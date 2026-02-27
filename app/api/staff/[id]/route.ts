import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Staff from '@/models/Staff';
import { verifyAdmin } from '@/lib/auth';
import { validateObjectId, sanitizeStaffUpdate } from '@/lib/validation';

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

    return NextResponse.json({
      message: 'Staff member removed successfully'
    }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}
