import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Schedule from '@/models/Schedule';
import Staff from '@/models/Staff';
import { createNotificationForEvent } from '@/lib/notificationMiddleware';
import { verifyAuth } from '@/lib/auth';
import User from '@/models/User';
import connectToDatabase from '@/lib/mongodb';



// Helper function to get staff record for authenticated user
async function getUserStaffRecord(userId: string) {
  let staff = await Staff.findOne({ user: userId });
  if (!staff) {
    // Check if user exists and has a role that requires a staff record
    const user = await User.findById(userId);
    if (user && (user.role === 'staff' || user.role === 'manager')) {
      staff = new Staff({
        user: userId,
        designation: user.designation || (user.role === 'manager' ? 'Manager' : 'Staff Member'),
        status: 'active'
      });
      await staff.save();
    } else {
      throw new Error('Staff record not found for this user');
    }
  }
  return staff;
}

// GET all schedules for authenticated user
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }
    const user = auth.user!;

    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const timezone = searchParams.get('timezone');
    const staffId = searchParams.get('staffId');
    
    const skip = (page - 1) * limit;
    
    // Build filter based on user role
    const filter: Record<string, unknown> = {};
    
    if (user.role === 'staff') {
      // Staff can only see their own schedules
      const staff = await getUserStaffRecord(user._id.toString());
      filter.staff = staff._id;
    } else if (user.role === 'manager' || user.role === 'admin') {
      // Managers and admins can see all schedules, or specific staff if staffId is provided
      if (staffId) {
        const staff = await Staff.findOne({ user: staffId });
        if (staff) {
          filter.staff = staff._id;
        } else {
          // If no staff record found for this user ID, ensure no results are returned
          filter.staff = new mongoose.Types.ObjectId(); 
        }
      }
    }
    
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
      .populate('staff', 'firstName lastName email')
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
      schedules: processedSchedules,
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
        { success: false, error: error.message, message: error.message },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch schedules', message: 'Failed to fetch schedules' },
      { status: 500 }
    );
  }
}

// POST create new schedule for authenticated staff
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }
    const user = auth.user!;

    await connectToDatabase();
    
    const body = await request.json();
    const { 
      staff: targetUserId, 
      startTime, 
      endTime, 
      workDays, 
      isOneOff, 
      oneOffDate, 
      timezone, 
      notes 
    } = body;
    
    // Validate required fields
    if (!startTime || !endTime || !timezone) {
      return NextResponse.json(
        { success: false, error: 'Start time, end time, and timezone are required' },
        { status: 400 }
      );
    }
    
    // Additional conditional validation
    if (!isOneOff && (!workDays || !Array.isArray(workDays) || workDays.length === 0)) {
       return NextResponse.json(
        { success: false, error: 'Recurring schedules require at least one work day' },
        { status: 400 }
      );
    }
    
    if (isOneOff && !oneOffDate) {
       return NextResponse.json(
        { success: false, error: 'One-off schedules require a specific date' },
        { status: 400 }
      );
    }
    
    // Determine which staff member this schedule is for
    let staffToSchedulesFor;
    if (user.role === 'admin' || user.role === 'manager') {
      if (!targetUserId) {
        return NextResponse.json(
          { success: false, error: 'Staff member is required' },
          { status: 400 }
        );
      }
      staffToSchedulesFor = await getUserStaffRecord(targetUserId);
    } else {
      // Staff member creating for themselves
      staffToSchedulesFor = await getUserStaffRecord(user._id.toString());
    }
    
    // Validate workDays values if recurring
    if (!isOneOff && workDays) {
      const validDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const invalidDays = workDays.filter((day: string) => !validDays.includes(day));
      if (invalidDays.length > 0) {
        return NextResponse.json(
          { success: false, error: `Invalid work days: ${invalidDays.join(', ')}. Use: ${validDays.join(', ')}` },
          { status: 400 }
        );
      }
    }
    
    // Convert times to UTC
    const utcStartTime = new Date(startTime);
    const utcEndTime = new Date(endTime);
    
    // Create schedule data
    const scheduleData: Record<string, unknown> = {
      staff: staffToSchedulesFor._id,
      startTime: utcStartTime,
      endTime: utcEndTime,
      workDays,
      isOneOff: Boolean(isOneOff),
      timezone,
      notes: notes || undefined
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
        startTime: startTime,
        endTime: endTime,
        isOneOff: Boolean(isOneOff)
      },
      [staffToSchedulesFor.user.toString()]
    );
    
    return NextResponse.json({
      success: true,
      schedule: schedule
    }, { status: 201 });
    
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Error creating schedule:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
