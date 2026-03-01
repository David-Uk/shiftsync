import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import TimeEntry from '@/models/TimeEntry';
import Schedule from '@/models/Schedule';
import Staff from '@/models/Staff';
import jwt from 'jsonwebtoken';
import User from '@/models/User';
import NotificationService from '@/lib/notificationService';
import Location from '@/models/Location';

// Helper function to verify JWT token and get user
async function getAuthenticatedUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    
    await mongoose.connect(process.env.MONGODB_URL!);
    const user = await User.findById(decoded.userId);
    
    if (!user || (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'staff')) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

// Helper function to get staff record for authenticated user
async function getUserStaffRecord(userId: string) {
  const staff = await Staff.findOne({ user: userId });
  if (!staff) {
    throw new Error('Staff record not found for this user');
  }
  return staff;
}

// Helper function to check if current time is within schedule
function isWithinSchedule(currentTime: Date, schedule: {
  startTime: Date;
  endTime: Date;
  isOneOff: boolean;
  oneOffDate?: Date;
  workDays: string[];
}): boolean {
  const scheduleDate = new Date(currentTime);
  const scheduleStartTime = new Date(scheduleDate);
  const scheduleEndTime = new Date(scheduleDate);
  
  // Set the time parts from schedule
  const startParts = schedule.startTime.toISOString().split('T')[1].split(':');
  const endParts = schedule.endTime.toISOString().split('T')[1].split(':');
  
  scheduleStartTime.setHours(parseInt(startParts[0]), parseInt(startParts[1]), 0, 0);
  scheduleEndTime.setHours(parseInt(endParts[0]), parseInt(endParts[1]), 0, 0);
  
  // Check if it's a one-off schedule
  if (schedule.isOneOff && schedule.oneOffDate) {
    const oneOffDate = new Date(schedule.oneOffDate);
    if (scheduleDate.toDateString() !== oneOffDate.toDateString()) {
      return false;
    }
  } else {
    // Check if current day is in work days
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[scheduleDate.getDay()];
    if (!schedule.workDays.includes(currentDay)) {
      return false;
    }
  }
  
  // Check if current time is within schedule hours
  return currentTime >= scheduleStartTime && currentTime <= scheduleEndTime;
}

// POST clock in
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await mongoose.connect(process.env.MONGODB_URL!);
    
    const body = await request.json();
    const { timezone, location, notes } = body;
    
    if (!timezone) {
      return NextResponse.json(
        { success: false, error: 'Timezone is required' },
        { status: 400 }
      );
    }
    
    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());
    
    // Check if staff already has an active time entry
    const activeEntry = await TimeEntry.findOne({ 
      staff: staff._id, 
      isActive: true 
    });
    
    if (activeEntry) {
      return NextResponse.json(
        { success: false, error: 'Already clocked in. Please clock out first.' },
        { status: 400 }
      );
    }
    
    // Find active schedule for current time
    const currentTime = new Date();
    const schedules = await Schedule.find({ 
      staff: staff._id,
      isOneOff: false 
    });
    
    // Also check one-off schedules for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const oneOffSchedules = await Schedule.find({
      staff: staff._id,
      isOneOff: true,
      oneOffDate: {
        $gte: today,
        $lt: tomorrow
      }
    });
    
    const allSchedules = [...schedules, ...oneOffSchedules];
    let activeSchedule = null;
    let isOvertime = false;
    
    // Check if current time is within any schedule
    for (const schedule of allSchedules) {
      if (isWithinSchedule(currentTime, schedule)) {
        activeSchedule = schedule;
        break;
      }
    }
    
    // If no active schedule, mark as overtime
    if (!activeSchedule) {
      isOvertime = true;
    }
    
    // Create time entry
    const timeEntryData: Record<string, unknown> = {
      staff: staff._id,
      clockIn: currentTime,
      isActive: true,
      isOvertime,
      timezone,
      location,
      notes
    };
    
    if (activeSchedule) {
      timeEntryData.schedule = activeSchedule._id;
    }
    
    const timeEntry = await TimeEntry.create(timeEntryData);
    
    // Populate the response
    await timeEntry.populate('schedule', 'startTime endTime workDays timezone');
    await timeEntry.populate('location', 'address city');
    
    // Send Notifications
    try {
      const staffUser = await User.findById(staff.user);
      const staffName = staffUser ? `${staffUser.firstName} ${staffUser.lastName}` : 'Staff Member';
      const staffUserId = staffUser?._id as mongoose.Types.ObjectId;

      // 1. Notify Admin
      await NotificationService.createAdminNotification({
        type: 'clock_in',
        title: 'Staff Clocked In',
        message: `${staffName} clocked in at ${timeEntry.location ? 'assigned location' : 'location'}.`,
        location: timeEntry.location as mongoose.Types.ObjectId,
        relatedEntity: { type: 'user', id: staffUserId },
        sender: staffUserId
      });

      // 2. Notify Location Manager
      if (timeEntry.location) {
        const locationDoc = await Location.findById(timeEntry.location);
        if (locationDoc && locationDoc.manager) {
          await NotificationService.createNotification({
            type: 'clock_in',
            title: 'Staff Arrival',
            message: `${staffName} has just clocked in for their shift.`,
            recipient: locationDoc.manager as mongoose.Types.ObjectId,
            location: locationDoc._id as mongoose.Types.ObjectId,
            relatedEntity: { type: 'user', id: staffUserId },
            sender: staffUserId
          });
        }
      }
    } catch (err) {
      console.error('Failed to send clock-in notifications:', err);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...timeEntry.toObject(),
        isWithinSchedule: !!activeSchedule,
        message: isOvertime ? 'Clocked in as overtime' : 'Clocked in within schedule'
      }
    }, { status: 201 });
    
  } catch (error: unknown) {
    console.error('Error clocking in:', error);
    
    if (error instanceof Error && error.message === 'Staff record not found for this user') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to clock in' },
      { status: 500 }
    );
  }
}
