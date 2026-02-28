import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import User from './User';
import Location from './Location';

export type NotificationType = 
  | 'shift_assigned'
  | 'shift_cancelled'
  | 'shift_updated'
  | 'schedule_published'
  | 'schedule_updated'
  | 'location_created'
  | 'location_updated'
  | 'user_created'
  | 'user_updated'
  | 'user_role_changed'
  | 'user_archived'
  | 'leave_request'
  | 'leave_approved'
  | 'leave_rejected'
  | 'clock_in'
  | 'clock_out'
  | 'emergency'
  | 'system_maintenance'
  | 'announcement';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface INotification extends Document {
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  recipient: Types.ObjectId; // User who receives the notification
  sender?: Types.ObjectId; // User who triggered the notification (optional)
  location?: Types.ObjectId; // Related location (optional)
  relatedEntity?: {
    type: 'shift' | 'schedule' | 'user' | 'location' | 'leave';
    id: Types.ObjectId;
  };
  isRead: boolean;
  isPush: boolean; // Whether it was sent as push notification
  pushSentAt?: Date; // When push notification was sent
  metadata?: Record<string, unknown>; // Additional data for the notification
  expiresAt?: Date; // When notification expires (optional)
  createdAt: Date;
  updatedAt: Date;
}

export type INotificationMethods = object;

export interface INotificationStatics {
  createNotification(notificationData: Partial<INotification>): Promise<INotification>;
  getUserNotifications(
    userId: Types.ObjectId,
    userRole: string,
    userLocation?: Types.ObjectId,
    options?: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
    }
  ): Promise<{
    notifications: INotification[];
    total: number;
    page: number;
    pages: number;
  }>;
  markAsRead(userId: Types.ObjectId, notificationIds?: Types.ObjectId[]): Promise<{ modifiedCount: number }>;
  getUnreadCount(userId: Types.ObjectId, userRole: string, userLocation?: Types.ObjectId): Promise<number>;
}

export interface INotificationModel extends Model<INotification, Record<string, never>, INotificationMethods>, INotificationStatics {}

const NotificationSchema: Schema<INotification> = new Schema(
  {
    title: { 
      type: String, 
      required: true,
      trim: true,
      maxlength: 200
    },
    message: { 
      type: String, 
      required: true,
      trim: true,
      maxlength: 1000
    },
    type: { 
      type: String, 
      enum: [
        'shift_assigned',
        'shift_cancelled', 
        'shift_updated',
        'schedule_published',
        'schedule_updated',
        'location_created',
        'location_updated',
        'user_created',
        'user_updated',
        'user_role_changed',
        'user_archived',
        'leave_request',
        'leave_approved',
        'leave_rejected',
        'clock_in',
        'clock_out',
        'emergency',
        'system_maintenance',
        'announcement'
      ],
      required: true
    },
    priority: { 
      type: String, 
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    recipient: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true
    },
    sender: { 
      type: Schema.Types.ObjectId, 
      ref: 'User'
    },
    location: { 
      type: Schema.Types.ObjectId, 
      ref: 'Location'
    },
    relatedEntity: {
      type: {
        type: String,
        enum: ['shift', 'schedule', 'user', 'location', 'leave']
      },
      id: {
        type: Schema.Types.ObjectId
      }
    },
    isRead: { 
      type: Boolean, 
      default: false
    },
    isPush: { 
      type: Boolean, 
      default: false
    },
    pushSentAt: { 
      type: Date
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    } as Record<string, unknown>,
    expiresAt: {
      type: Date
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, isRead: 1 });
NotificationSchema.index({ type: 1, createdAt: -1 });
NotificationSchema.index({ priority: 1, createdAt: -1 });
NotificationSchema.index({ location: 1, createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-expire notifications

// Virtual for getting recipient details
NotificationSchema.virtual('recipientDetails', {
  ref: 'User',
  localField: 'recipient',
  foreignField: '_id',
  justOne: true
});

// Virtual for getting sender details
NotificationSchema.virtual('senderDetails', {
  ref: 'User',
  localField: 'sender',
  foreignField: '_id',
  justOne: true
});

// Virtual for getting location details
NotificationSchema.virtual('locationDetails', {
  ref: 'Location',
  localField: 'location',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to validate recipient exists
NotificationSchema.pre('save', async function(this: INotification) {
  if (this.isNew) {
    try {
      const recipient = await User.findById(this.recipient);
      if (!recipient) {
        const error = new Error('Recipient user does not exist');
        throw error;
      }
      
      // Validate sender if provided
      if (this.sender) {
        const sender = await User.findById(this.sender);
        if (!sender) {
          const error = new Error('Sender user does not exist');
          throw error;
        }
      }
      
      // Validate location if provided
      if (this.location) {
        const location = await Location.findById(this.location);
        if (!location) {
          const error = new Error('Referenced location does not exist');
          throw error;
        }
      }
    } catch (error) {
      throw error;
    }
  }
});

// Static method to create notifications with proper filtering
NotificationSchema.statics.createNotification = async function(notificationData: Partial<INotification>) {
  const notification = new this(notificationData);
  return await notification.save();
};

// Static method to get notifications for a user with role-based filtering
NotificationSchema.statics.getUserNotifications = async function(
  userId: Types.ObjectId,
  userRole: string,
  userLocation?: Types.ObjectId,
  options: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  } = {}
) {
  const { page = 1, limit = 20, unreadOnly = false } = options;
  const skip = (page - 1) * limit;
  
  const query: Record<string, unknown> = {};
  
  if (unreadOnly) {
    query.isRead = false;
  }
  
  // Role-based filtering
  if (userRole === 'admin') {
    // Admins see all notifications for themselves
    query.recipient = userId;
  } else if (userRole === 'manager') {
    // Managers see notifications for themselves and their location
    query.$or = [
      { recipient: userId },
      { location: userLocation }
    ];
  } else {
    // Staff only see their own notifications
    query.recipient = userId;
  }
  
  const notifications = await this.find(query)
    .populate('recipientDetails', 'firstName lastName email')
    .populate('senderDetails', 'firstName lastName email')
    .populate('locationDetails', 'address city')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
    
  const total = await this.countDocuments(query);
  
  return {
    notifications,
    total,
    page,
    pages: Math.ceil(total / limit)
  };
};

// Static method to mark notifications as read
NotificationSchema.statics.markAsRead = async function(
  userId: Types.ObjectId,
  notificationIds?: Types.ObjectId[]
) {
  const query: Record<string, unknown> = { recipient: userId, isRead: false };
  
  if (notificationIds && notificationIds.length > 0) {
    query._id = { $in: notificationIds };
  }
  
  return await this.updateMany(query, { isRead: true });
};

// Static method to get unread count
NotificationSchema.statics.getUnreadCount = async function(
  userId: Types.ObjectId,
  userRole: string,
  userLocation?: Types.ObjectId
) {
  const query: Record<string, unknown> = { isRead: false };
  
  // Role-based filtering
  if (userRole === 'admin') {
    query.recipient = userId;
  } else if (userRole === 'manager') {
    query.$or = [
      { recipient: userId },
      { location: userLocation }
    ];
  } else {
    query.recipient = userId;
  }
  
  return await this.countDocuments(query);
};

const Notification = (mongoose.models.Notification as INotificationModel) || mongoose.model<INotification, INotificationModel>('Notification', NotificationSchema);

export default Notification;
