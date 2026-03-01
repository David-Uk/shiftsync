import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Schedule from '@/models/Schedule';
import Staff from '@/models/Staff';
import User from '@/models/User';
import { verifyAuth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import { createNotificationForEvent } from '@/lib/notificationMiddleware';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth(request);
    if (auth.error) {
      return NextResponse.json(
        { success: false, error: auth.error, message: auth.error },
        { status: auth.status }
      );
    }
    const user = auth.user!;
    const { id } = await params;

    console.log('Publish endpoint called with ID:', id);
    console.log('ID type:', typeof id);
    console.log('ID length:', id.length);

    await connectToDatabase();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log('Invalid ObjectId format for ID:', id);
      return NextResponse.json(
        { success: false, error: 'Invalid schedule ID', message: `Invalid schedule ID format: ${id}` },
        { status: 400 }
      );
    }

    // Helper logic to get staff record
    let staff = await Staff.findOne({ user: user._id });
    if (!staff && (user.role === 'staff' || user.role === 'manager')) {
        staff = new Staff({
            user: user._id,
            designation: user.designation || (user.role === 'manager' ? 'Manager' : 'Staff Member'),
            status: 'active'
        });
        await staff.save();
    }

    if (!staff) {
        return NextResponse.json(
            { success: false, error: 'Staff record not found', message: 'Staff record not found' },
            { status: 404 }
        );
    }

    const schedule = await Schedule.findOne({
      _id: id,
      staff: staff._id
    });

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: 'Schedule not found or unauthorized', message: 'Schedule not found or unauthorized' },
        { status: 404 }
      );
    }

    if (schedule.isPublished) {
      return NextResponse.json(
        { success: false, error: 'Schedule is already published', message: 'Schedule is already published' },
        { status: 400 }
      );
    }

    schedule.isPublished = true;
    await schedule.save();

    // Create notification for publishing
    await createNotificationForEvent(
      request,
      'schedule_published',
      {
        scheduleId: schedule._id.toString(),
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        isOneOff: schedule.isOneOff
      },
      [user._id.toString()]
    );

    return NextResponse.json({
      success: true,
      message: 'Schedule published successfully',
      schedule
    });
  } catch (error: any) {
    console.error('Error publishing schedule:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to publish schedule', message: error.message || 'Failed to publish schedule' },
      { status: 500 }
    );
  }
}
