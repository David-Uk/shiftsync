import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ISchedule extends Document {
  staff: Types.ObjectId; // Reference to Staff model
  startTime: Date; // Start time in UTC
  endTime: Date; // End time in UTC
  workDays: string[]; // Days of week (['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
  isOneOff: boolean; // Whether this is a one-time schedule
  oneOffDate?: Date; // Specific date for one-off schedules
  timezone: string; // Timezone for this schedule (e.g., 'UTC', 'GMT', 'EST', 'PST')
  location?: Types.ObjectId; // Reference to Location model
  notes?: string; // Additional notes
  isPublished: boolean; // Whether this schedule has been published
  createdAt: Date;
  updatedAt: Date;
  toLocalSchedule(): Record<string, unknown>;
}

export interface IScheduleModel extends Model<ISchedule> {
  toLocalTime(utcDate: Date, timezone: string): Date;
  toUTC(localDate: Date, timezone: string): Date;
}

const ScheduleSchema: Schema<ISchedule> = new Schema(
  {
    staff: { 
      type: Schema.Types.ObjectId, 
      ref: 'Staff', 
      required: true
    },
    startTime: { 
      type: Date, 
      required: true,
      validate: {
        validator: function(v: Date) {
          const doc = this as unknown as ISchedule;
          if ('endTime' in doc && doc.endTime) {
            return v < doc.endTime;
          }
          return true;
        },
        message: 'Start time must be before end time'
      }
    },
    endTime: { 
      type: Date, 
      required: true,
      validate: {
        validator: function(v: Date) {
          const doc = this as unknown as ISchedule;
          if ('startTime' in doc && doc.startTime) {
            return v > doc.startTime;
          }
          return true;
        },
        message: 'End time must be after start time'
      }
    },
    workDays: [{ 
      type: String, 
      enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    }],
    isOneOff: { 
      type: Boolean, 
      default: false 
    },
    oneOffDate: { 
      type: Date,
      validate: {
        validator: function(v: Date) {
          const doc = this as unknown as ISchedule;
          if ('isOneOff' in doc) {
            // oneOffDate is required if isOneOff is true
            if (doc.isOneOff && !v) return false;
            // oneOffDate should not be provided if isOneOff is false
            if (!doc.isOneOff && v) return false;
          }
          return true;
        },
        message: 'oneOffDate is required for one-off schedules and should not be provided for recurring schedules'
      }
    },
    timezone: { 
      type: String, 
      required: true,
      validate: {
        validator: function(v: string) {
          // Supports GMT format like GMT, GMT+1, GMT-1 etc.
          return /^GMT([+-]\d{1,2})?$/.test(v);
        },
        message: 'Invalid timezone format. Use GMT format (e.g., GMT, GMT+1, GMT-5).'
      }
    },
    location: { 
      type: Schema.Types.ObjectId, 
      ref: 'Location'
    },
    notes: { 
      type: String, 
      maxlength: 500 
    },
    isPublished: { 
      type: Boolean, 
      default: false 
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
ScheduleSchema.index({ staff: 1, startTime: 1 });
ScheduleSchema.index({ staff: 1, oneOffDate: 1 });
ScheduleSchema.index({ isOneOff: 1, oneOffDate: 1 });
ScheduleSchema.index({ workDays: 1 });

// Virtual for getting staff details
ScheduleSchema.virtual('staffDetails', {
  ref: 'Staff',
  localField: 'staff',
  foreignField: '_id',
  justOne: true
});

// Virtual for getting location details
ScheduleSchema.virtual('locationDetails', {
  ref: 'Location',
  localField: 'location',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to validate 10-hour gap and overlaps
ScheduleSchema.pre('save', async function(this: ISchedule) {
  if (this.isNew || this.isModified('startTime') || this.isModified('endTime') || this.isModified('workDays') || this.isModified('oneOffDate') || this.isModified('timezone')) {
    try {
      // 1. Get all schedules for this staff member (excluding current one if updating)
      const existingSchedules = await (this.constructor as IScheduleModel).find({
        staff: this.staff,
        _id: { $ne: this._id }
      });

      const normalizeToTimeOnly = (date: Date) => {
        const d = new Date(date);
        d.setFullYear(1970, 0, 1);
        return d.getTime();
      };

      const convertToTimezone = (date: Date, timezone: string): Date => {
        const ScheduleModel = this.constructor as IScheduleModel;
        return ScheduleModel.toLocalTime(date, timezone);
      };

      for (const other of existingSchedules) {
        // --- OVERLAP CHECK ---
        let overlap = false;

        if (this.isOneOff && other.isOneOff) {
          // Both one-off: Direct date comparison in their respective timezones
          const thisLocalStart = convertToTimezone(this.startTime, this.timezone);
          const thisLocalEnd = convertToTimezone(this.endTime, this.timezone);
          const otherLocalStart = convertToTimezone(other.startTime, other.timezone);
          const otherLocalEnd = convertToTimezone(other.endTime, other.timezone);
          
          overlap = (thisLocalStart < otherLocalEnd && thisLocalEnd > otherLocalStart);
        } else if (!this.isOneOff && !other.isOneOff) {
          // Both recurring: Check if any day overlaps (timezone-agnostic for recurring)
          const commonDays = this.workDays.filter(day => other.workDays.includes(day));
          if (commonDays.length > 0) {
            const thisStart = normalizeToTimeOnly(this.startTime);
            const thisEnd = normalizeToTimeOnly(this.endTime);
            const otherStart = normalizeToTimeOnly(other.startTime);
            const otherEnd = normalizeToTimeOnly(other.endTime);
            overlap = (thisStart < otherEnd && thisEnd > otherStart);
          }
        } else {
          // One is recurring, one is one-off - check timezone-aware conflicts
          const oneOff = this.isOneOff ? this : other;
          const recurring = this.isOneOff ? other : this;
          
          // Convert one-off date to recurring schedule's timezone for day comparison
          const oneOffInRecurringTz = convertToTimezone(oneOff.startTime, recurring.timezone);
          const oneOffDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][oneOffInRecurringTz.getDay()];
          
          if (recurring.workDays && recurring.workDays.includes(oneOffDay)) {
            // Compare times in the recurring schedule's timezone
            const oneOffStartInRecTz = normalizeToTimeOnly(oneOffInRecurringTz);
            const oneOffEndInRecTz = normalizeToTimeOnly(convertToTimezone(oneOff.endTime, recurring.timezone));
            const recStart = normalizeToTimeOnly(recurring.startTime);
            const recEnd = normalizeToTimeOnly(recurring.endTime);
            
            overlap = (oneOffStartInRecTz < recEnd && oneOffEndInRecTz > recStart);
          }
        }

        if (overlap) {
          const scheduleType = this.isOneOff ? 'One-off' : 'Recurring';
          const otherType = other.isOneOff ? 'one-off' : 'recurring';
          throw new Error(`${scheduleType} schedule conflicts with existing ${otherType} schedule. Schedules cannot overlap across different timezones.`);
        }

        // --- 10-HOUR GAP CHECK (Rest Rule) ---
        // This is most critical for One-Off shifts vs anything else on neighboring days
        if (this.isOneOff) {
          let gapError = false;
          let diffHours = 0;

          if (other.isOneOff) {
            // Check gap between two one-off shifts in their respective timezones
            const thisLocalEnd = convertToTimezone(this.endTime, this.timezone);
            const otherLocalStart = convertToTimezone(other.startTime, other.timezone);
            const otherLocalEnd = convertToTimezone(other.endTime, other.timezone);
            const thisLocalStart = convertToTimezone(this.startTime, this.timezone);
            
            const gap1 = (thisLocalStart.getTime() - otherLocalEnd.getTime()) / (1000 * 60 * 60);
            const gap2 = (otherLocalStart.getTime() - thisLocalEnd.getTime()) / (1000 * 60 * 60);
            
            // If they are on the same or adjacent days, check
            if ((gap1 > 0 && gap1 < 10) || (gap2 > 0 && gap2 < 10)) {
              gapError = true;
              diffHours = gap1 > 0 ? gap1 : gap2;
            }
          } else {
            // Check one-off vs recurring - timezone-aware gap checking
            const targetDate = new Date(this.startTime);
            const daysToCheck = [-1, 0, 1]; // Previous, current, next day
            
            for (const offset of daysToCheck) {
              const checkDate = new Date(targetDate);
              checkDate.setDate(checkDate.getDate() + offset);
              
              // Convert to recurring schedule's timezone for day comparison
              const checkDateInRecTz = convertToTimezone(checkDate, recurring.timezone);
              const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][checkDateInRecTz.getDay()];
              
              if (recurring.workDays && recurring.workDays.includes(dayName)) {
                // Construct virtual Date for the recurring shift on that specific day in recurring's timezone
                const recStart = new Date(checkDateInRecTz);
                recStart.setHours(other.startTime.getHours(), other.startTime.getMinutes(), 0, 0);
                
                const recEnd = new Date(checkDateInRecTz);
                recEnd.setHours(other.endTime.getHours(), other.endTime.getMinutes(), 0, 0);
                if (recEnd < recStart) recEnd.setDate(recEnd.getDate() + 1); // Handle overnight

                // Convert both to one-off's timezone for accurate gap calculation
                const recStartInOneOffTz = convertToTimezone(recStart, this.timezone);
                const recEndInOneOffTz = convertToTimezone(recEnd, this.timezone);
                const oneOffStart = convertToTimezone(this.startTime, this.timezone);
                const oneOffEnd = convertToTimezone(this.endTime, this.timezone);

                const gap1 = (oneOffStart.getTime() - recEndInOneOffTz.getTime()) / (1000 * 60 * 60);
                const gap2 = (recStartInOneOffTz.getTime() - oneOffEnd.getTime()) / (1000 * 60 * 60);
                
                if ((gap1 > 0 && gap1 < 10) || (gap2 > 0 && gap2 < 10)) {
                  gapError = true;
                  diffHours = gap1 > 0 ? gap1 : gap2;
                  break;
                }
              }
            }
          }

          if (gapError) {
            throw new Error(`10-hour rest rule violation: Only ${diffHours.toFixed(1)} hours rest between shifts across timezones.`);
          }
        }
      }
    } catch (error) {
      throw error;
    }
  }
});

// Static method to convert UTC time to local timezone
ScheduleSchema.statics.toLocalTime = function(utcDate: Date, timezone: string): Date {
  const timezoneMap: Record<string, string> = {
    'GMT': 'UTC',
    'GMT+0': 'UTC',
    'GMT+1': 'Etc/GMT-1',
    'GMT+2': 'Etc/GMT-2',
    'GMT+3': 'Etc/GMT-3',
    'GMT+4': 'Etc/GMT-4',
    'GMT+5': 'Etc/GMT-5',
    'GMT+6': 'Etc/GMT-6',
    'GMT+7': 'Etc/GMT-7',
    'GMT+8': 'Etc/GMT-8',
    'GMT+9': 'Etc/GMT-9',
    'GMT+10': 'Etc/GMT-10',
    'GMT+11': 'Etc/GMT-11',
    'GMT+12': 'Etc/GMT-12',
    'GMT+13': 'Etc/GMT-13',
    'GMT+14': 'Etc/GMT-14',
    'GMT-1': 'Etc/GMT+1',
    'GMT-2': 'Etc/GMT+2',
    'GMT-3': 'Etc/GMT+3',
    'GMT-4': 'Etc/GMT+4',
    'GMT-5': 'Etc/GMT+5',
    'GMT-6': 'Etc/GMT+6',
    'GMT-7': 'Etc/GMT+7',
    'GMT-8': 'Etc/GMT+8',
    'GMT-9': 'Etc/GMT+9',
    'GMT-10': 'Etc/GMT+10',
    'GMT-11': 'Etc/GMT+11',
    'GMT-12': 'Etc/GMT+12'
  };
  
  const ianaTimezone = timezoneMap[timezone] || 'UTC';
  return new Date(utcDate.toLocaleString("en-US", { timeZone: ianaTimezone }));
};

// Static method to convert local time to UTC
ScheduleSchema.statics.toUTC = function(localDate: Date, timezone: string): Date {
  const timezoneMap: Record<string, string> = {
    'GMT': 'UTC',
    'GMT+0': 'UTC',
    'GMT+1': 'Etc/GMT-1',
    'GMT+2': 'Etc/GMT-2',
    'GMT+3': 'Etc/GMT-3',
    'GMT+4': 'Etc/GMT-4',
    'GMT+5': 'Etc/GMT-5',
    'GMT+6': 'Etc/GMT-6',
    'GMT+7': 'Etc/GMT-7',
    'GMT+8': 'Etc/GMT-8',
    'GMT+9': 'Etc/GMT-9',
    'GMT+10': 'Etc/GMT-10',
    'GMT+11': 'Etc/GMT-11',
    'GMT+12': 'Etc/GMT-12',
    'GMT+13': 'Etc/GMT-13',
    'GMT+14': 'Etc/GMT-14',
    'GMT-1': 'Etc/GMT+1',
    'GMT-2': 'Etc/GMT+2',
    'GMT-3': 'Etc/GMT+3',
    'GMT-4': 'Etc/GMT+4',
    'GMT-5': 'Etc/GMT+5',
    'GMT-6': 'Etc/GMT+6',
    'GMT-7': 'Etc/GMT+7',
    'GMT-8': 'Etc/GMT+8',
    'GMT-9': 'Etc/GMT+9',
    'GMT-10': 'Etc/GMT+10',
    'GMT-11': 'Etc/GMT+11',
    'GMT-12': 'Etc/GMT+12'
  };
  
  const ianaTimezone = timezoneMap[timezone] || 'UTC';
  const tzDate = new Date(localDate.toLocaleString("en-US", { timeZone: ianaTimezone }));
  const utcDate = new Date(tzDate.toLocaleString("en-US", { timeZone: "UTC" }));
  return utcDate;
};

// Instance method to get schedule in local timezone
ScheduleSchema.methods.toLocalSchedule = function(this: ISchedule): Record<string, unknown> {
  const ScheduleModel = this.constructor as IScheduleModel;
  return {
    ...this.toObject(),
    startTime: ScheduleModel.toLocalTime(this.startTime, this.timezone),
    endTime: ScheduleModel.toLocalTime(this.endTime, this.timezone),
    oneOffDate: this.oneOffDate ? ScheduleModel.toLocalTime(this.oneOffDate, this.timezone) : undefined
  };
};

const Schedule = (mongoose.models.Schedule as IScheduleModel) || mongoose.model<ISchedule, IScheduleModel>('Schedule', ScheduleSchema);

export default Schedule;
