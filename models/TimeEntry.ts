import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface ITimeEntry extends Document {
  staff: Types.ObjectId; // Reference to Staff model
  schedule?: Types.ObjectId; // Reference to Schedule model (if applicable)
  clockIn: Date; // Clock in time in UTC
  clockOut?: Date; // Clock out time in UTC (null when active)
  isActive: boolean; // Whether the time entry is currently active
  isOvertime: boolean; // Whether this is overtime
  duration?: number; // Duration in minutes (calculated on clock out)
  notes?: string; // Optional notes for manual entries
  location?: Types.ObjectId; // Reference to Location model
  timezone: string; // Timezone for this time entry
  createdAt: Date;
  updatedAt: Date;
}

export interface ITimeEntryStatics {
  toLocalTime(utcDate: Date, timezone: string): Date;
  toUTC(localDate: Date, timezone: string): Date;
}

const TimeEntrySchema: Schema<ITimeEntry> = new Schema(
  {
    staff: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    schedule: {
      type: Schema.Types.ObjectId,
      ref: "Schedule",
    },
    clockIn: {
      type: Date,
      required: true,
      default: Date.now,
    },
    clockOut: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    isOvertime: {
      type: Boolean,
      required: true,
      default: false,
    },
    duration: {
      type: Number, // Duration in minutes
      min: 0,
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    location: {
      type: Schema.Types.ObjectId,
      ref: "Location",
    },
    timezone: {
      type: String,
      required: true,
      validate: {
        validator: function (v: string) {
          // Supports GMT format like GMT, GMT+1, GMT-1 etc.
          return /^GMT([+-]\d{1,2})?$/.test(v);
        },
        message:
          "Invalid timezone format. Use GMT format (e.g., GMT, GMT+1, GMT-5).",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for better query performance
TimeEntrySchema.index({ staff: 1, clockIn: -1 });
TimeEntrySchema.index({ staff: 1, isActive: 1 });
TimeEntrySchema.index({ schedule: 1 });
TimeEntrySchema.index({ isActive: 1 });

// Virtual for getting staff details
TimeEntrySchema.virtual("staffDetails", {
  ref: "Staff",
  localField: "staff",
  foreignField: "_id",
  justOne: true,
});

// Virtual for getting schedule details
TimeEntrySchema.virtual("scheduleDetails", {
  ref: "Schedule",
  localField: "schedule",
  foreignField: "_id",
  justOne: true,
});

// Virtual for getting location details
TimeEntrySchema.virtual("locationDetails", {
  ref: "Location",
  localField: "location",
  foreignField: "_id",
  justOne: true,
});

// Pre-save middleware to calculate duration and check for active entries
TimeEntrySchema.pre("save", async function (this: ITimeEntry) {
  if (this.isNew) {
    try {
      // Check if staff already has an active time entry
      const activeEntry = await TimeEntry.findOne({
        staff: this.staff,
        isActive: true,
      });

      if (activeEntry) {
        const error = new Error(
          "Staff already has an active time entry. Please clock out first.",
        );
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }

  // Calculate duration when clocking out
  if (this.clockOut && this.isActive) {
    this.isActive = false;
    this.duration = Math.round(
      (this.clockOut.getTime() - this.clockIn.getTime()) / (1000 * 60),
    );
  }
});

// Static method to convert UTC time to local timezone
TimeEntrySchema.statics.toLocalTime = function (
  utcDate: Date,
  timezone: string,
): Date {
  // Map GMT format to IANA timezone names
  const timezoneMap: Record<string, string> = {
    GMT: "UTC",
    "GMT+0": "UTC",
    "GMT+1": "Etc/GMT-1",
    "GMT+2": "Etc/GMT-2",
    "GMT+3": "Etc/GMT-3",
    "GMT+4": "Etc/GMT-4",
    "GMT+5": "Etc/GMT-5",
    "GMT+6": "Etc/GMT-6",
    "GMT+7": "Etc/GMT-7",
    "GMT+8": "Etc/GMT-8",
    "GMT+9": "Etc/GMT-9",
    "GMT+10": "Etc/GMT-10",
    "GMT+11": "Etc/GMT-11",
    "GMT+12": "Etc/GMT-12",
    "GMT+13": "Etc/GMT-13",
    "GMT+14": "Etc/GMT-14",
    "GMT-1": "Etc/GMT+1",
    "GMT-2": "Etc/GMT+2",
    "GMT-3": "Etc/GMT+3",
    "GMT-4": "Etc/GMT+4",
    "GMT-5": "Etc/GMT+5",
    "GMT-6": "Etc/GMT+6",
    "GMT-7": "Etc/GMT+7",
    "GMT-8": "Etc/GMT+8",
    "GMT-9": "Etc/GMT+9",
    "GMT-10": "Etc/GMT+10",
    "GMT-11": "Etc/GMT+11",
    "GMT-12": "Etc/GMT+12",
  };

  const ianaTimezone = timezoneMap[timezone] || "UTC";
  return new Date(utcDate.toLocaleString("en-US", { timeZone: ianaTimezone }));
};

// Static method to convert local time to UTC
TimeEntrySchema.statics.toUTC = function (
  localDate: Date,
  timezone: string,
): Date {
  // Map GMT format to IANA timezone names
  const timezoneMap: Record<string, string> = {
    GMT: "UTC",
    "GMT+0": "UTC",
    "GMT+1": "Etc/GMT-1",
    "GMT+2": "Etc/GMT-2",
    "GMT+3": "Etc/GMT-3",
    "GMT+4": "Etc/GMT-4",
    "GMT+5": "Etc/GMT-5",
    "GMT+6": "Etc/GMT-6",
    "GMT+7": "Etc/GMT-7",
    "GMT+8": "Etc/GMT-8",
    "GMT+9": "Etc/GMT-9",
    "GMT+10": "Etc/GMT-10",
    "GMT+11": "Etc/GMT-11",
    "GMT+12": "Etc/GMT-12",
    "GMT+13": "Etc/GMT-13",
    "GMT+14": "Etc/GMT-14",
    "GMT-1": "Etc/GMT+1",
    "GMT-2": "Etc/GMT+2",
    "GMT-3": "Etc/GMT+3",
    "GMT-4": "Etc/GMT+4",
    "GMT-5": "Etc/GMT+5",
    "GMT-6": "Etc/GMT+6",
    "GMT-7": "Etc/GMT+7",
    "GMT-8": "Etc/GMT+8",
    "GMT-9": "Etc/GMT+9",
    "GMT-10": "Etc/GMT+10",
    "GMT-11": "Etc/GMT+11",
    "GMT-12": "Etc/GMT+12",
  };

  const ianaTimezone = timezoneMap[timezone] || "UTC";
  const tzDate = new Date(
    localDate.toLocaleString("en-US", { timeZone: ianaTimezone }),
  );
  const utcDate = new Date(tzDate.toLocaleString("en-US", { timeZone: "UTC" }));
  return utcDate;
};

// Instance method to get time entry in local timezone
TimeEntrySchema.methods.toLocalTimeEntry = function (
  this: ITimeEntry,
): Record<string, unknown> {
  const model = this.constructor as unknown as Model<ITimeEntry> &
    ITimeEntryStatics;
  return {
    ...this.toObject(),
    clockIn: model.toLocalTime(this.clockIn, this.timezone),
    clockOut: this.clockOut
      ? model.toLocalTime(this.clockOut, this.timezone)
      : undefined,
  };
};

const TimeEntry: Model<ITimeEntry> & ITimeEntryStatics =
  (mongoose.models.TimeEntry as Model<ITimeEntry> & ITimeEntryStatics) ||
  mongoose.model<ITimeEntry>("TimeEntry", TimeEntrySchema);

export default TimeEntry;
