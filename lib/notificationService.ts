import Notification from '@/models/Notification';
import User from '@/models/User';
import Location from '@/models/Location';
import { Types } from 'mongoose';

export type NotificationEvent = {
  type: 'shift_assigned' | 'shift_cancelled' | 'shift_updated' | 'schedule_published' | 
        'schedule_updated' | 'location_created' | 'location_updated' | 'user_created' | 
        'user_updated' | 'user_role_changed' | 'user_archived' | 'leave_request' | 'leave_approved' | 
        'leave_rejected' | 'clock_in' | 'clock_out' | 'emergency' | 'system_maintenance' | 'announcement';
  title: string;
  message: string;
  sender?: Types.ObjectId;
  recipient?: Types.ObjectId;
  location?: Types.ObjectId;
  relatedEntity?: {
    type: 'shift' | 'schedule' | 'user' | 'location' | 'leave';
    id: Types.ObjectId;
  };
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
};

class NotificationService {
  /**
   * Create a single notification
   */
  static async createNotification(event: NotificationEvent): Promise<void> {
    if (!event.recipient) {
      console.warn('Notification event missing recipient:', event);
      return;
    }

    try {
      await Notification.createNotification({
        title: event.title,
        message: event.message,
        type: event.type,
        priority: event.priority || 'medium',
        recipient: event.recipient,
        sender: event.sender,
        location: event.location,
        relatedEntity: event.relatedEntity,
        metadata: event.metadata,
        expiresAt: event.expiresAt
      });
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }

  /**
   * Create notifications for multiple recipients
   */
  static async createBulkNotifications(
    baseEvent: Omit<NotificationEvent, 'recipient'>,
    recipients: Types.ObjectId[]
  ): Promise<void> {
    const notifications = recipients.map(recipient => ({
      ...baseEvent,
      recipient
    }));

    try {
      await Promise.all(
        notifications.map(event => this.createNotification(event))
      );
    } catch (error) {
      console.error('Error creating bulk notifications:', error);
    }
  }

  /**
   * Create notifications for all users in a location
   */
  static async createLocationNotification(
    baseEvent: Omit<NotificationEvent, 'recipient' | 'location'>,
    locationId: Types.ObjectId
  ): Promise<void> {
    try {
      // Get all users associated with this location
      const location = await Location.findById(locationId).populate('manager');
      if (!location) {
        console.warn('Location not found:', locationId);
        return;
      }

      const recipients: Types.ObjectId[] = [];
      
      // Add location manager
      if (location.manager) {
        recipients.push(location.manager as Types.ObjectId);
      }

      // Find all staff who work at this location
      // This would require a staff-location relationship in a real implementation
      // For now, we'll add the manager only
      const staffUsers = await User.find({ 
        // Add your staff-location query here
        role: { $in: ['staff', 'manager'] }
      });
      
      recipients.push(...staffUsers.map(user => user._id));

      // Remove duplicates
      const uniqueRecipients = [...new Set(recipients)];
      
      await this.createBulkNotifications(
        { ...baseEvent, location: locationId },
        uniqueRecipients
      );
    } catch (error) {
      console.error('Error creating location notification:', error);
    }
  }

  /**
   * Create notifications for all admins
   */
  static async createAdminNotification(
    baseEvent: Omit<NotificationEvent, 'recipient'>
  ): Promise<void> {
    try {
      const admins = await User.find({ role: 'admin' });
      const adminIds = admins.map(admin => admin._id);
      
      await this.createBulkNotifications(baseEvent, adminIds);
    } catch (error) {
      console.error('Error creating admin notification:', error);
    }
  }

  /**
   * Create notifications for shift schedule changes
   */
  static async createScheduleNotification(
    scheduleId: Types.ObjectId,
    affectedStaff: Types.ObjectId[],
    type: 'schedule_published' | 'schedule_updated',
    sender?: Types.ObjectId
  ): Promise<void> {
    const baseEvent = {
      type,
      title: type === 'schedule_published' ? 'New Schedule Published' : 'Schedule Updated',
      message: type === 'schedule_published' 
        ? 'A new work schedule has been published. Please review your assigned shifts.'
        : 'The work schedule has been updated. Please check for any changes to your shifts.',
      sender,
      relatedEntity: {
        type: 'schedule' as const,
        id: scheduleId
      },
      priority: 'high' as const
    };

    await this.createBulkNotifications(baseEvent, affectedStaff);
  }

  /**
   * Create notification for shift assignment
   */
  static async createShiftAssignmentNotification(
    shiftId: Types.ObjectId,
    staffId: Types.ObjectId,
    sender?: Types.ObjectId,
    locationId?: Types.ObjectId
  ): Promise<void> {
    await this.createNotification({
      type: 'shift_assigned',
      title: 'New Shift Assigned',
      message: 'You have been assigned to a new shift. Please check the schedule for details.',
      recipient: staffId,
      sender,
      location: locationId,
      relatedEntity: {
        type: 'shift',
        id: shiftId
      },
      priority: 'medium'
    });
  }

  /**
   * Create notification for user role changes
   */
  static async createRoleChangeNotification(
    userId: Types.ObjectId,
    oldRole: string,
    newRole: string,
    sender?: Types.ObjectId
  ): Promise<void> {
    await this.createNotification({
      type: 'user_role_changed',
      title: 'Role Updated',
      message: `Your role has been changed from ${oldRole} to ${newRole}.`,
      recipient: userId,
      sender,
      relatedEntity: {
        type: 'user',
        id: userId
      },
      priority: 'high'
    });
  }

  /**
   * Create emergency notification
   */
  static async createEmergencyNotification(
    title: string,
    message: string,
    sender?: Types.ObjectId,
    locationId?: Types.ObjectId
  ): Promise<void> {
    const baseEvent = {
      type: 'emergency' as const,
      title,
      message,
      sender,
      priority: 'urgent' as const
    };

    if (locationId) {
      await this.createLocationNotification(baseEvent, locationId);
    } else {
      await this.createAdminNotification(baseEvent);
    }
  }
}

export default NotificationService;
