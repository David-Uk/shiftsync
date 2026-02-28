import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Schedule from '@/models/Schedule';
import Staff from '@/models/Staff';
import jwt from 'jsonwebtoken';
import User from '@/models/User';
import { createNotificationForEvent } from '@/lib/notificationMiddleware';

// Helper function to verify JWT token and get user
async function getAuthenticatedUser(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    
    await mongoose.connect(process.env.MONGODB_URI!);
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

// GET all schedules for authenticated staff
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await mongoose.connect(process.env.MONGODB_URI!);
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const timezone = searchParams.get('timezone');
    
    const skip = (page - 1) * limit;
    
    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());
    
    // Build filter
    const filter: Record<string, unknown> = { staff: staff._id };
    
    if (startDate || endDate) {
      filter.startTime = {};
      if (startDate) {
        (filter.startTime as Record<string, unknown>)['$gte'] = new Date(startDate);
      }
      if (endDate) {
        (filter.startTime as Record<string, unknown>)['$lte'] = new Date(endDate);
      }
    }
    
    const schedules = await Schedule.find(filter)
      .populate('location', 'address city timezone')
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit);
    
    // Convert to local timezone if requested
    const processedSchedules = timezone 
      ? schedules.map(schedule => schedule.toLocalSchedule())
      : schedules;
    
    const total = await Schedule.countDocuments(filter);
    
    return NextResponse.json({
      success: true,
      data: processedSchedules,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error: unknown) {
    console.error('Error fetching schedules:', error);
    
    if (error instanceof Error && error.message === 'Staff record not found for this user') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch schedules' },
      { status: 500 }
    );
  }
}

// POST create new schedule for authenticated staff
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await mongoose.connect(process.env.MONGODB_URI!);
    
    const body = await request.json();
    const { startTime, endTime, workDays, isOneOff, oneOffDate, timezone, location, notes } = body;
    
    // Validate required fields
    if (!startTime || !endTime || !workDays || !Array.isArray(workDays) || workDays.length === 0 || !timezone) {
      return NextResponse.json(
        { success: false, error: 'Start time, end time, work days, and timezone are required' },
        { status: 400 }
      );
    }
    
    // Validate workDays values
    const validDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const invalidDays = workDays.filter((day: string) => !validDays.includes(day));
    if (invalidDays.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid work days: ${invalidDays.join(', ')}. Use: ${validDays.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());
    
    // Convert times to UTC if they're in local timezone
    const utcStartTime = new Date(startTime);
    const utcEndTime = new Date(endTime);
    
    // Create schedule data
    const scheduleData: Record<string, unknown> = {
      staff: staff._id,
      startTime: utcStartTime,
      endTime: utcEndTime,
      workDays,
      isOneOff: Boolean(isOneOff),
      timezone,
      location,
      notes
    };
    
    if (isOneOff && oneOffDate) {
      scheduleData.oneOffDate = new Date(oneOffDate);
    }
    
    const schedule = await Schedule.create(scheduleData);
    
    // Populate the response
    await schedule.populate('location', 'address city timezone');
    
    // Create notification for the staff member about their new schedule
    await createNotificationForEvent(
      request,
      'schedule_published',
      {
        scheduleId: schedule._id.toString(),
        weekStart: startTime,
        weekEnd: endTime
      },
      [user._id.toString()]
    );
    
    return NextResponse.json({
      success: true,
      data: schedule
    }, { status: 201 });
    
  } catch (error: unknown) {
    console.error('Error creating schedule:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('at least 10 hours')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      }
      
      if (error.message.includes('Start time must be before end time') || 
          error.message.includes('End time must be after start time')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      }
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to create schedule' },
      { status: 500 }
    );
  }
}
