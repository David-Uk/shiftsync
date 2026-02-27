import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import TimeEntry from '@/models/TimeEntry';
import Staff from '@/models/Staff';
import jwt from 'jsonwebtoken';
import User from '@/models/User';

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

// Helper function to get staff record for authenticated user
async function getUserStaffRecord(userId: string) {
  const staff = await Staff.findOne({ user: userId });
  if (!staff) {
    throw new Error('Staff record not found for this user');
  }
  return staff;
}

// POST clock out
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
    const { notes } = body;
    
    // Get staff record for this user
    const staff = await getUserStaffRecord(user._id.toString());
    
    // Find active time entry
    const activeEntry = await TimeEntry.findOne({ 
      staff: staff._id, 
      isActive: true 
    }).populate('schedule', 'startTime endTime');
    
    if (!activeEntry) {
      return NextResponse.json(
        { success: false, error: 'No active time entry found. Please clock in first.' },
        { status: 400 }
      );
    }
    
    // Clock out
    activeEntry.clockOut = new Date();
    activeEntry.isActive = false;
    
    // Calculate duration in minutes
    const duration = Math.round((activeEntry.clockOut.getTime() - activeEntry.clockIn.getTime()) / (1000 * 60));
    activeEntry.duration = duration;
    
    // Add notes if provided
    if (notes) {
      activeEntry.notes = notes;
    }
    
    await activeEntry.save();
    
    // Check if this should be marked as overtime based on schedule duration
    let shouldMarkAsOvertime = activeEntry.isOvertime;
    
    if (activeEntry.schedule && !activeEntry.isOvertime) {
      const scheduleDuration = Math.round((activeEntry.schedule.endTime.getTime() - activeEntry.schedule.startTime.getTime()) / (1000 * 60));
      
      // If worked more than 30 minutes over schedule duration, mark as overtime
      if (duration > scheduleDuration + 30) {
        shouldMarkAsOvertime = true;
        activeEntry.isOvertime = true;
        await activeEntry.save();
      }
    }
    
    // Populate the response
    await activeEntry.populate('schedule', 'startTime endTime workDays timezone');
    await activeEntry.populate('location', 'address city');
    
    return NextResponse.json({
      success: true,
      data: {
        ...activeEntry.toObject(),
        durationHours: Math.round(duration / 60 * 100) / 100,
        isOvertime: shouldMarkAsOvertime,
        message: shouldMarkAsOvertime ? 'Clocked out with overtime' : 'Clocked out successfully'
      }
    });
    
  } catch (error: unknown) {
    console.error('Error clocking out:', error);
    
    if (error instanceof Error && error.message === 'Staff record not found for this user') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to clock out' },
      { status: 500 }
    );
  }
}
