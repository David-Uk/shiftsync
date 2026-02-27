import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  role: 'admin' | 'manager' | 'user';
  profileImage?: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema<IUser> = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8 },
    role: { type: String, enum: ['admin', 'manager', 'user'], default: 'user' },
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
    isArchived: { type: Boolean, default: false },
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
