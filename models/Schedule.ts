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
        validator: function(this: ISchedule, v: Date) {
          return v < this.endTime;
        },
        message: 'Start time must be before end time'
      }
    },
    endTime: { 
      type: Date, 
      required: true,
      validate: {
        validator: function(this: ISchedule, v: Date) {
          return v > this.startTime;
        },
        message: 'End time must be after start time'
      }
    },
    workDays: [{ 
      type: String, 
      enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      required: true
    }],
    isOneOff: { 
      type: Boolean, 
      default: false 
    },
    oneOffDate: { 
      type: Date,
      validate: {
        validator: function(this: ISchedule, v: Date) {
          // oneOffDate is required if isOneOff is true
          if (this.isOneOff && !v) return false;
          // oneOffDate should not be provided if isOneOff is false
          if (!this.isOneOff && v) return false;
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
          // Common timezone abbreviations validation
          const validTimezones = ['UTC', 'GMT', 'EST', 'EDT', 'CST', 'CDT', 'MST', 'MDT', 'PST', 'PDT', 'AKST', 'AKDT', 'HST', 'CEST', 'CET', 'IST', 'JST', 'AEST', 'AEDT'];
          return validTimezones.includes(v);
        },
        message: 'Invalid timezone. Use standard abbreviations like UTC, GMT, EST, PST, etc.'
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

// Pre-save middleware to validate 10-hour gap between schedules
ScheduleSchema.pre('save', async function(this: ISchedule) {
  if (this.isNew) {
    try {
      // Find the last schedule for this staff member
      const lastSchedule = await Schedule.findOne({ 
        staff: this.staff,
        endTime: { $lt: this.startTime }
      }).sort({ endTime: -1 });

      if (lastSchedule) {
        const timeDiff = this.startTime.getTime() - lastSchedule.endTime.getTime();
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        
        if (hoursDiff < 10) {
          const error = new Error(`Schedule must be at least 10 hours after the previous schedule. Only ${hoursDiff.toFixed(1)} hours detected.`);
          throw error;
        }
      }
    } catch (error) {
      throw error;
    }
  }
});

// Static method to convert UTC time to local timezone
ScheduleSchema.statics.toLocalTime = function(utcDate: Date, timezone: string): Date {
  // Map timezone abbreviations to IANA timezone names
  const timezoneMap: Record<string, string> = {
    'UTC': 'UTC',
    'GMT': 'GMT',
    'EST': 'America/New_York',
    'EDT': 'America/New_York',
    'CST': 'America/Chicago',
    'CDT': 'America/Chicago',
    'MST': 'America/Denver',
    'MDT': 'America/Denver',
    'PST': 'America/Los_Angeles',
    'PDT': 'America/Los_Angeles',
    'AKST': 'America/Anchorage',
    'AKDT': 'America/Anchorage',
    'HST': 'Pacific/Honolulu',
    'CEST': 'Europe/Paris',
    'CET': 'Europe/Paris',
    'IST': 'Asia/Kolkata',
    'JST': 'Asia/Tokyo',
    'AEST': 'Australia/Sydney',
    'AEDT': 'Australia/Sydney'
  };
  
  const ianaTimezone = timezoneMap[timezone] || 'UTC';
  return new Date(utcDate.toLocaleString("en-US", { timeZone: ianaTimezone }));
};

// Static method to convert local time to UTC
ScheduleSchema.statics.toUTC = function(localDate: Date, timezone: string): Date {
  // Map timezone abbreviations to IANA timezone names
  const timezoneMap: Record<string, string> = {
    'UTC': 'UTC',
    'GMT': 'GMT',
    'EST': 'America/New_York',
    'EDT': 'America/New_York',
    'CST': 'America/Chicago',
    'CDT': 'America/Chicago',
    'MST': 'America/Denver',
    'MDT': 'America/Denver',
    'PST': 'America/Los_Angeles',
    'PDT': 'America/Los_Angeles',
    'AKST': 'America/Anchorage',
    'AKDT': 'America/Anchorage',
    'HST': 'Pacific/Honolulu',
    'CEST': 'Europe/Paris',
    'CET': 'Europe/Paris',
    'IST': 'Asia/Kolkata',
    'JST': 'Asia/Tokyo',
    'AEST': 'Australia/Sydney',
    'AEDT': 'Australia/Sydney'
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

const Schedule: IScheduleModel = mongoose.models.Schedule || mongoose.model<ISchedule>('Schedule', ScheduleSchema);

export default Schedule;
