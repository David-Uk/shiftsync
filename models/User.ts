import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  role: 'admin' | 'manager' | 'staff';
  profileImage?: string;
  phone?: string;
  designation?: string;
  isArchived: boolean;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema<IUser> = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8 },
    role: { type: String, enum: ['admin', 'manager', 'staff'], default: 'staff' },
    profileImage: { 
      type: String, 
      validate: {
        validator: function(v: string) {
          if (!v) return true; // Optional field
          // Validate Cloudinary URL format
          const cloudinaryRegex = /^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/v\d+\/[a-zA-Z0-9_\-\/]+\/[a-zA-Z0-9_\-]+\.(jpg|jpeg|png|gif|webp)$/;
          return cloudinaryRegex.test(v);
        },
        message: 'Invalid profile image URL format'
      }
    },
    phone: { type: String, trim: true },
    designation: { 
      type: String, 
      enum: ['bartender', 'line cook', 'host', 'waiter', 'security', 'janitor', 'accountant'],
      required: function(this: IUser) {
        return this.role === 'staff';
      }
    },
    isArchived: { type: Boolean, default: false },
    passwordResetToken: { type: String },
    passwordResetExpiry: { type: Date },
  },
  { timestamps: true }
);

// Index for better query performance
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isArchived: 1 });

// Mongoose automatically looks for the plural, lowercased version of your model name.
const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
