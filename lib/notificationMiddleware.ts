import { NextRequest } from 'next/server';
import NotificationService from '@/lib/notificationService';
import { verifyAuth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import mongoose, { Types } from 'mongoose';

// Simplified middleware to automatically create notifications for various events
export async function createNotificationForEvent(
  request: NextRequest,
  eventType: string,
  eventData: {
    userId?: string;
    firstName?: string;
    lastName?: string;
    oldRole?: string;
    newRole?: string;
    locationId?: string;
    address?: string;
    shiftId?: string;
    staffId?: string;
    scheduleId?: string;
    staffName?: string;
    leaveId?: string;
    title?: string;
    message?: string;
    weekStart?: string | Date;
    weekEnd?: string | Date;
    startTime?: string | Date;
    endTime?: string | Date;
    isOneOff?: boolean;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  },
  affectedUsers?: string[]
) {
  try {
    await connectToDatabase();
    
    const auth = await verifyAuth(request);
    if (auth.error) return; // Skip if not authenticated

    const sender = auth.user!._id;

    switch (eventType) {
      case 'user_created':
        if (eventData.userId && eventData.firstName && eventData.lastName) {
          await NotificationService.createAdminNotification({
            type: 'user_created',
            title: 'New User Created',
            message: `New user ${eventData.firstName} ${eventData.lastName} has been created.`,
            sender,
            relatedEntity: {
              type: 'user',
              id: new Types.ObjectId(eventData.userId)
            }
          });
        }
        break;

      case 'user_updated':
        if (eventData.userId) {
          await NotificationService.createNotification({
            type: 'user_updated',
            title: 'Profile Updated',
            message: 'Your profile has been updated successfully.',
            recipient: new Types.ObjectId(eventData.userId),
            sender,
            relatedEntity: {
              type: 'user',
              id: new Types.ObjectId(eventData.userId)
            }
          });
        }
        break;

      case 'user_role_changed':
        if (eventData.userId && eventData.oldRole && eventData.newRole) {
          await NotificationService.createRoleChangeNotification(
            new Types.ObjectId(eventData.userId),
            eventData.oldRole,
            eventData.newRole,
            sender
          );
        }
        break;

      case 'shift_assigned':
        if (eventData.shiftId && eventData.staffId) {
          await NotificationService.createShiftAssignmentNotification(
            new Types.ObjectId(eventData.shiftId),
            new Types.ObjectId(eventData.staffId),
            sender,
            eventData.locationId ? new Types.ObjectId(eventData.locationId) : undefined
          );
        }
        break;

      case 'schedule_published':
      case 'schedule_updated':
        if (eventData.scheduleId && affectedUsers && affectedUsers.length > 0) {
          await NotificationService.createScheduleNotification(
            new Types.ObjectId(eventData.scheduleId),
            affectedUsers.map(id => new Types.ObjectId(id)),
            eventType as 'schedule_published' | 'schedule_updated',
            sender
          );
        }
        break;

      case 'clock_in':
      case 'clock_out':
        // Universal admin notification will capture these
        break;

      case 'emergency':
        if (eventData.title && eventData.message) {
          await NotificationService.createEmergencyNotification(
            eventData.title,
            eventData.message,
            sender,
            eventData.locationId ? new Types.ObjectId(eventData.locationId) : undefined
          );
        }
        break;

      default:
        console.log(`Event type ${eventType} handled`);
    }

    // ALWAYS notify admins for every action in the system
    try {
      const senderName = auth.user ? `${auth.user.firstName} ${auth.user.lastName}` : 'System';
      const eventTitle = eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      
      await NotificationService.createAdminNotification({
        type: eventType as any,
        title: `[Admin Alert] ${eventTitle}`,
        message: `${senderName} triggered ${eventType}: ${eventData.message || eventData.title || ''}`,
        sender: sender as mongoose.Types.ObjectId,
        priority: eventData.priority || 'medium',
        location: eventData.locationId ? new mongoose.Types.ObjectId(eventData.locationId) : undefined,
        metadata: { ...eventData, senderName }
      });
    } catch (adminNotifyError) {
      console.error('Failed to send universal admin notification:', adminNotifyError);
    }
  } catch (error) {
    console.error('Error creating notification for event:', eventType, error);
  }
}
