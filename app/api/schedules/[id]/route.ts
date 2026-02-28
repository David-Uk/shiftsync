import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Schedule from '@/models/Schedule';
import Staff from '@/models/Staff';
import jwt from 'jsonwebtoken';
import User from '@/models/User';
import { createNotificationForEvent } from '@/lib/notificationMiddleware';
import NotificationService from '@/lib/notificationService';

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

// GET schedule by ID for authenticated staff
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await mongoose.connect(process.env.MONGODB_URI!);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid schedule ID' },
        { status: 400 }
      );
    }
    
    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());
    
    const schedule = await Schedule.findOne({ 
      _id: id, 
      staff: staff._id 
    })
      .populate('location', 'address city timezone');
    
    if (!schedule) {
      return NextResponse.json(
        { success: false, error: 'Schedule not found' },
        { status: 404 }
      );
    }
    
    // Convert to local timezone if requested
    const { searchParams } = new URL(request.url);
    const timezone = searchParams.get('timezone');
    const processedSchedule = timezone ? schedule.toLocalSchedule() : schedule;
    
    return NextResponse.json({
      success: true,
      data: processedSchedule
    });
  } catch (error: unknown) {
    console.error('Error fetching schedule:', error);
    
    if (error instanceof Error && error.message === 'Staff record not found for this user') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch schedule' },
      { status: 500 }
    );
  }
}

// PUT update schedule for authenticated staff
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await mongoose.connect(process.env.MONGODB_URI!);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid schedule ID' },
        { status: 400 }
      );
    }
    
    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());
    
    const schedule = await Schedule.findOne({ 
      _id: id, 
      staff: staff._id 
    });
    
    if (!schedule) {
      return NextResponse.json(
        { success: false, error: 'Schedule not found' },
        { status: 404 }
      );
    }
    
    const body = await request.json();
    const { startTime, endTime, workDays, isOneOff, oneOffDate, timezone, location, notes } = body;
    
    // Validate workDays if provided
    if (workDays && Array.isArray(workDays)) {
      const validDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const invalidDays = workDays.filter((day: string) => !validDays.includes(day));
      if (invalidDays.length > 0) {
        return NextResponse.json(
          { success: false, error: `Invalid work days: ${invalidDays.join(', ')}. Use: ${validDays.join(', ')}` },
          { status: 400 }
        );
      }
    }
    
    // Update fields
    if (startTime) schedule.startTime = new Date(startTime);
    if (endTime) schedule.endTime = new Date(endTime);
    if (workDays && Array.isArray(workDays)) schedule.workDays = workDays;
    if (typeof isOneOff === 'boolean') schedule.isOneOff = isOneOff;
    if (oneOffDate !== undefined) schedule.oneOffDate = oneOffDate ? new Date(oneOffDate) : undefined;
    if (timezone) schedule.timezone = timezone;
    if (location !== undefined) schedule.location = location;
    if (notes !== undefined) schedule.notes = notes;
    
    await schedule.save();
    
    // Populate the response
    await schedule.populate('location', 'address city timezone manager');
    
    // Create notification for the staff member and location manager
    if (schedule.location) {
      const loc = schedule.location as any;
      if (loc.manager) {
        await createNotificationForEvent(
          request,
          'schedule_updated',
          {
            scheduleId: schedule._id.toString(),
            locationId: loc._id.toString(),
            message: `Staff member ${user.firstName} updated their schedule at ${loc.address}.`
          },
          [loc.manager.toString()]
        );
      }
    }
    
    return NextResponse.json({
      success: true,
      data: schedule
    });
  } catch (error: unknown) {
    console.error('Error updating schedule:', error);
    
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
      { success: false, error: 'Failed to update schedule' },
      { status: 500 }
    );
  }
}

// DELETE schedule for authenticated staff
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await mongoose.connect(process.env.MONGODB_URI!);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid schedule ID' },
        { status: 400 }
      );
    }
    
    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());
    
    const schedule = await Schedule.findOne({ 
      _id: id, 
      staff: staff._id 
    });
    
    if (!schedule) {
      return NextResponse.json(
        { success: false, error: 'Schedule not found' },
        { status: 404 }
      );
    }
    
    await Schedule.findByIdAndDelete(id);
    
    return NextResponse.json({
      success: true,
      message: 'Schedule deleted successfully'
    });
  } catch (error: unknown) {
    console.error('Error deleting schedule:', error);
    
    if (error instanceof Error && error.message === 'Staff record not found for this user') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to delete schedule' },
      { status: 500 }
    );
  }
}
