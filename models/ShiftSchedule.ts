import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IShiftSchedule extends Document {
  location: Types.ObjectId; // Reference to Location model
  manager: Types.ObjectId; // Reference to User model (manager who created it)
  title: string; // Shift title/name
  description?: string; // Shift description
  startTime: Date; // Shift start time in UTC
  endTime: Date; // Shift end time in UTC
  workDays: string[]; // Days of week (['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
  timezone: string; // Timezone for this schedule (e.g., 'UTC', 'GMT', 'EST', 'PST')
  requiredSkills: string[]; // Skills required for this shift
  headcount: number; // Number of staff needed
  assignedStaff: Types.ObjectId[]; // Array of assigned staff IDs
  isActive: boolean; // Whether this shift is active
  startDate: Date; // Start date for recurring schedule
  endDate?: Date; // End date for recurring schedule (optional)
  createdAt: Date;
  updatedAt: Date;
  toLocalShiftSchedule(): Record<string, unknown>;
}

export interface IShiftScheduleModel extends Model<IShiftSchedule> {
  toLocalTime(utcDate: Date, timezone: string): Date;
  toUTC(localDate: Date, timezone: string): Date;
}

const ShiftScheduleSchema: Schema<IShiftSchedule> = new Schema(
  {
    location: { 
      type: Schema.Types.ObjectId, 
      ref: 'Location', 
      required: true
    },
    manager: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true
    },
    title: { 
      type: String, 
      required: true,
      trim: true,
      maxlength: 100
    },
    description: { 
      type: String, 
      maxlength: 500 
    },
    startTime: { 
      type: Date, 
      required: true,
      validate: {
        validator: function(v: Date) {
          // Type guard to ensure we're working with a document
          if ('endTime' in this) {
            return v < (this as IShiftSchedule).endTime;
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
          // Type guard to ensure we're working with a document
          if ('startTime' in this) {
            return v > (this as IShiftSchedule).startTime;
          }
          return true;
        },
        message: 'End time must be after start time'
      }
    },
    workDays: [{ 
      type: String, 
      enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      required: true
    }],
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
    requiredSkills: [{ 
      type: String, 
      trim: true,
      maxlength: 50
    }],
    headcount: { 
      type: Number, 
      required: true,
      min: 1,
      max: 50
    },
    assignedStaff: [{ 
      type: Schema.Types.ObjectId, 
      ref: 'Staff'
    }],
    isActive: { 
      type: Boolean, 
      required: true,
      default: true
    },
    startDate: { 
      type: Date, 
      required: true,
      default: Date.now
    },
    endDate: { 
      type: Date
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
ShiftScheduleSchema.index({ location: 1, startTime: 1 });
ShiftScheduleSchema.index({ manager: 1 });
ShiftScheduleSchema.index({ assignedStaff: 1 });
ShiftScheduleSchema.index({ isActive: 1, workDays: 1 });
ShiftScheduleSchema.index({ startDate: 1, endDate: 1 });

// Virtual for getting location details
ShiftScheduleSchema.virtual('locationDetails', {
  ref: 'Location',
  localField: 'location',
  foreignField: '_id',
  justOne: true
});

// Virtual for getting manager details
ShiftScheduleSchema.virtual('managerDetails', {
  ref: 'User',
  localField: 'manager',
  foreignField: '_id',
  justOne: true
});

// Virtual for getting assigned staff details
ShiftScheduleSchema.virtual('assignedStaffDetails', {
  ref: 'Staff',
  localField: 'assignedStaff',
  foreignField: '_id'
});

// Pre-save middleware to validate and set location
ShiftScheduleSchema.pre('save', async function(this: IShiftSchedule) {
  if (this.isNew || this.isModified('location')) {
    try {
      // Get manager details
      const User = mongoose.model('User');
      const manager = await User.findById(this.manager);
      
      if (!manager) {
        const error = new Error('Manager not found');
        throw error;
      }
      
      // Get all locations managed by this manager
      const Location = mongoose.model('Location');
      const managedLocations = await Location.find({ manager: this.manager });
      
      // Check if the selected location is managed by this manager
      const isManagedLocation = managedLocations.some(
        (loc: { _id: Types.ObjectId }) => loc._id.toString() === this.location.toString()
      );
      
      if (!isManagedLocation) {
        const error = new Error('Location is not managed by this manager');
        throw error;
      }
      
      // Validate assigned staff if provided
      if (this.assignedStaff && this.assignedStaff.length > 0) {
        const Staff = mongoose.model('Staff');
        
        for (const staffId of this.assignedStaff) {
          const staff = await Staff.findById(staffId).populate('user', 'firstName lastName email designation');
          if (!staff) {
            const error = new Error(`Assigned staff not found: ${staffId}`);
            throw error;
          }
          
          // Check if staff has required skills (basic validation for now)
          // This would need to be enhanced with actual skill matching
          
          // Check if staff work hours align with shift (basic validation)
          // This would need to be enhanced with actual work hour checking
        }
      }
    } catch (error) {
      throw error;
    }
  }
});

// Static method to convert UTC time to local timezone
ShiftScheduleSchema.statics.toLocalTime = function(utcDate: Date, timezone: string): Date {
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
ShiftScheduleSchema.statics.toUTC = function(localDate: Date, timezone: string): Date {
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

// Instance method to get shift schedule in local timezone
ShiftScheduleSchema.methods.toLocalShiftSchedule = function(this: IShiftSchedule): Record<string, unknown> {
  const ShiftScheduleModel = this.constructor as unknown as IShiftScheduleModel;
  return {
    ...this.toObject(),
    startTime: ShiftScheduleModel.toLocalTime(this.startTime, this.timezone),
    endTime: ShiftScheduleModel.toLocalTime(this.endTime, this.timezone),
    startDate: ShiftScheduleModel.toLocalTime(this.startDate, this.timezone),
    endDate: this.endDate ? ShiftScheduleModel.toLocalTime(this.endDate, this.timezone) : undefined,
  };
};

const ShiftSchedule: IShiftScheduleModel = (mongoose.models.ShiftSchedule as IShiftScheduleModel) || mongoose.model<IShiftSchedule>('ShiftSchedule', ShiftScheduleSchema) as IShiftScheduleModel;

export default ShiftSchedule;
