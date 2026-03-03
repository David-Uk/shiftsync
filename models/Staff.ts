import mongoose, { Document, Model, Schema, Types } from "mongoose";
import User from "./User";

export interface IStaff extends Document {
  user: Types.ObjectId; // Reference to User model
  designation: string;
  status:
    | "active"
    | "inactive"
    | "on_leave"
    | "suspended"
    | "retrenched"
    | "resigned"
    | "retired";
  standardWorkHours?: {
    startTime: string; // HH:mm format
    endTime: string;   // HH:mm format
    timezone: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema: Schema<IStaff> = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // Each user can only have one staff record
    },
    designation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: [
        "active",
        "inactive",
        "on_leave",
        "suspended",
        "retrenched",
        "resigned",
        "retired",
      ],
      default: "active",
    },
    standardWorkHours: {
      startTime: { type: String, trim: true },
      endTime: { type: String, trim: true },
      timezone: { type: String, trim: true, default: 'UTC' }
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for better query performance
// Note: user index is automatically created by unique: true constraint
StaffSchema.index({ status: 1 });
StaffSchema.index({ designation: 1 });

// Virtual for getting user details
StaffSchema.virtual("userDetails", {
  ref: "User",
  localField: "user",
  foreignField: "_id",
  justOne: true,
});

// Pre-save middleware to ensure user exists
StaffSchema.pre("save", async function (this: IStaff) {
  if (this.isNew) {
    try {
      const userExists = await User.findById(this.user);
      if (!userExists) {
        const error = new Error("Referenced user does not exist");
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }
});

const Staff: Model<IStaff> =
  mongoose.models.Staff || mongoose.model<IStaff>("Staff", StaffSchema);

export default Staff;
