import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import ShiftSchedule from '@/models/ShiftSchedule';
import Location from '@/models/Location';
import Staff from '@/models/Staff';
import User from '@/models/User';
import jwt from 'jsonwebtoken';

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
    
    if (!user || (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'user')) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

// GET shift schedule by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await mongoose.connect(process.env.MONGODB_URI!);
    
    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid shift schedule ID' },
        { status: 400 }
      );
    }
    
    const shiftSchedule = await ShiftSchedule.findById(params.id)
      .populate('location', 'address city timezone')
      .populate('manager', 'firstName lastName email')
      .populate('assignedStaff', 'designation user');
    
    if (!shiftSchedule) {
      return NextResponse.json(
        { success: false, error: 'Shift schedule not found' },
        { status: 404 }
      );
    }
    
    // Check permissions
    if (user.role === 'manager' && shiftSchedule.manager._id.toString() !== user._id.toString()) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }
    
    // If user is staff, check if they're assigned to this shift
    if (user.role === 'user') {
      const staff = await Staff.findOne({ user: user._id });
      if (!staff || !shiftSchedule.assignedStaff.some(s => s._id.toString() === staff._id.toString())) {
        return NextResponse.json(
          { success: false, error: 'Access denied' },
          { status: 403 }
        );
      }
    }
    
    // Convert to local timezone if requested
    const { searchParams } = new URL(request.url);
    const timezone = searchParams.get('timezone');
    const processedSchedule = timezone ? shiftSchedule.toLocalShiftSchedule() : shiftSchedule;
    
    return NextResponse.json({
      success: true,
      data: processedSchedule
    });
  } catch (error: unknown) {
    console.error('Error fetching shift schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch shift schedule' },
      { status: 500 }
    );
  }
}

// PUT update shift schedule (managers only)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user || user.role === 'user') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await mongoose.connect(process.env.MONGODB_URI!);
    
    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid shift schedule ID' },
        { status: 400 }
      );
    }
    
    const shiftSchedule = await ShiftSchedule.findById(params.id);
    if (!shiftSchedule) {
      return NextResponse.json(
        { success: false, error: 'Shift schedule not found' },
        { status: 404 }
      );
    }
    
    // Check permissions
    if (user.role === 'manager' && shiftSchedule.manager.toString() !== user._id.toString()) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }
    
    const body = await request.json();
    const { 
      title, 
      description, 
      startTime, 
      endTime, 
      workDays, 
      timezone, 
      requiredSkills, 
      headcount, 
      assignedStaff,
      isActive,
      endDate 
    } = body;
    
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
    if (title) shiftSchedule.title = title;
    if (description !== undefined) shiftSchedule.description = description;
    if (startTime) shiftSchedule.startTime = new Date(startTime);
    if (endTime) shiftSchedule.endTime = new Date(endTime);
    if (workDays && Array.isArray(workDays)) shiftSchedule.workDays = workDays;
    if (timezone) shiftSchedule.timezone = timezone;
    if (requiredSkills && Array.isArray(requiredSkills)) shiftSchedule.requiredSkills = requiredSkills;
    if (headcount) shiftSchedule.headcount = headcount;
    if (assignedStaff && Array.isArray(assignedStaff)) shiftSchedule.assignedStaff = assignedStaff;
    if (typeof isActive === 'boolean') shiftSchedule.isActive = isActive;
    if (endDate !== undefined) shiftSchedule.endDate = endDate ? new Date(endDate) : undefined;
    
    await shiftSchedule.save();
    
    // Populate the response
    await shiftSchedule.populate('location', 'address city timezone');
    await shiftSchedule.populate('manager', 'firstName lastName email');
    await shiftSchedule.populate('assignedStaff', 'designation user');
    
    return NextResponse.json({
      success: true,
      data: shiftSchedule
    });
  } catch (error: unknown) {
    console.error('Error updating shift schedule:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Start time must be before end time') || 
          error.message.includes('End time must be after start time')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      }
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to update shift schedule' },
      { status: 500 }
    );
  }
}

// DELETE shift schedule (managers only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user || user.role === 'user') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await mongoose.connect(process.env.MONGODB_URI!);
    
    if (!mongoose.Types.ObjectId.isValid(params.id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid shift schedule ID' },
        { status: 400 }
      );
    }
    
    const shiftSchedule = await ShiftSchedule.findById(params.id);
    if (!shiftSchedule) {
      return NextResponse.json(
        { success: false, error: 'Shift schedule not found' },
        { status: 404 }
      );
    }
    
    // Check permissions
    if (user.role === 'manager' && shiftSchedule.manager.toString() !== user._id.toString()) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }
    
    await ShiftSchedule.findByIdAndDelete(params.id);
    
    return NextResponse.json({
      success: true,
      message: 'Shift schedule deleted successfully'
    });
  } catch (error: unknown) {
    console.error('Error deleting shift schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete shift schedule' },
      { status: 500 }
    );
  }
}
