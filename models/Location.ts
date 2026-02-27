import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import User from './User';

export interface ILocation extends Document {
  address: string;
  city: string;
  timezone: string;
  manager: Types.ObjectId; // Reference to User model (manager role)
  createdBy: Types.ObjectId; // Reference to User model (admin who created it)
  createdAt: Date;
  updatedAt: Date;
}

const LocationSchema: Schema<ILocation> = new Schema(
  {
    address: { 
      type: String, 
      required: true,
      trim: true,
      maxlength: 200
    },
    city: { 
      type: String, 
      required: true,
      trim: true,
      maxlength: 100
    },
    timezone: { 
      type: String, 
      required: true,
      trim: true,
      maxlength: 50
    },
    manager: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true
    },
    createdBy: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
LocationSchema.index({ city: 1 });
LocationSchema.index({ manager: 1 });
LocationSchema.index({ createdBy: 1 });

// Virtual for getting manager details
LocationSchema.virtual('managerDetails', {
  ref: 'User',
  localField: 'manager',
  foreignField: '_id',
  justOne: true
});

// Virtual for getting creator details
LocationSchema.virtual('creatorDetails', {
  ref: 'User',
  localField: 'createdBy',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to validate manager and creator roles
LocationSchema.pre('save', async function(this: ILocation) {
  if (this.isNew) {
    try {
      // Validate manager exists and has manager role
      const manager = await User.findById(this.manager);
      if (!manager) {
        const error = new Error('Referenced manager does not exist');
        throw error;
      }
      if (manager.role !== 'manager' && manager.role !== 'admin') {
        const error = new Error('Manager must have manager or admin role');
        throw error;
      }

      // Validate creator exists and has admin role
      const creator = await User.findById(this.createdBy);
      if (!creator) {
        const error = new Error('Referenced creator does not exist');
        throw error;
      }
      if (creator.role !== 'admin') {
        const error = new Error('Only admins can create locations');
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }
});

const Location: Model<ILocation> = mongoose.models.Location || mongoose.model<ILocation>('Location', LocationSchema);

export default Location;
