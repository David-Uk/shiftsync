import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Staff from '@/models/Staff';
import { verifyAdmin } from '@/lib/auth';
import { validateObjectId, sanitizeStaffUpdate } from '@/lib/validation';
import NotificationService from '@/lib/notificationService';
import mongoose from 'mongoose';

// GET staff member by ID (Admin only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminCheck = await verifyAdmin(req);
    if ('error' in adminCheck) {
      return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
    }

    const { id } = await params;
    validateObjectId(id);

    await connectToDatabase();

    const staff = await Staff.findById(id)
      .populate('user', 'firstName lastName email role profileImage');

    if (!staff) {
      return NextResponse.json({ message: 'Staff member not found' }, { status: 404 });
    }

    return NextResponse.json({ staff }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}

// PUT - Update staff member (Admin only)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminCheck = await verifyAdmin(req);
    if ('error' in adminCheck) {
      return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
    }

    const { id } = await params;
    validateObjectId(id);

    const { designation, status } = await req.json();

    await connectToDatabase();

    const staff = await Staff.findById(id);
    if (!staff) {
      return NextResponse.json({ message: 'Staff member not found' }, { status: 404 });
    }

    // Validate and sanitize inputs
    const sanitizedData = sanitizeStaffUpdate({
      designation,
      status,
    });

    const updatedStaff = await Staff.findByIdAndUpdate(
      id,
      sanitizedData,
      { new: true, runValidators: true }
    ).populate('user', 'firstName lastName email role profileImage');

    if (updatedStaff) {
      try {
        const adminId = adminCheck.user?._id as mongoose.Types.ObjectId;
        const staffUserId = (updatedStaff.user as any)._id as mongoose.Types.ObjectId;

        // 1. Notify User
        await NotificationService.createNotification({
          type: 'user_updated',
          title: 'Employment Details Updated',
          message: `Your staff record has been updated by an administrator. New designation: ${updatedStaff.designation}.`,
          recipient: staffUserId,
          sender: adminId
        });

        // 2. Notify Admin
        await NotificationService.createAdminNotification({
          type: 'user_updated',
          title: 'Staff Record Updated',
          message: `Admin ${adminCheck.user?.firstName} updated staff record for ${(updatedStaff.user as any).firstName}.`,
          sender: adminId
        });
      } catch (err) {
        console.error('Failed to send staff update notifications:', err);
      }
    }

    return NextResponse.json({
      message: 'Staff member updated successfully',
      staff: updatedStaff
    }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}

// DELETE - Remove staff member (Admin only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminCheck = await verifyAdmin(req);
    if ('error' in adminCheck) {
      return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
    }

    const { id } = await params;
    validateObjectId(id);

    await connectToDatabase();

    const staff = await Staff.findById(id);
    if (!staff) {
      return NextResponse.json({ message: 'Staff member not found' }, { status: 404 });
    }

    await Staff.findByIdAndDelete(id);

    try {
      const adminId = adminCheck.user?._id as mongoose.Types.ObjectId;
      const staffUserId = staff.user as mongoose.Types.ObjectId;

      await NotificationService.createAdminNotification({
        type: 'user_archived',
        title: 'Staff Removed',
        message: `Staff member record for user ID ${staffUserId} was removed by admin.`,
        sender: adminId
      });
    } catch (err) {
      console.error('Failed to send staff removal notifications:', err);
    }

    return NextResponse.json({
      message: 'Staff member removed successfully'
    }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}
