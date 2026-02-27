import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Staff from '@/models/Staff';
import User from '@/models/User';
import { verifyAdmin } from '@/lib/auth';
import { sanitizeStaffCreation } from '@/lib/validation';

// GET all staff members (Admin only)
export async function GET(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if ('error' in adminCheck) {
      return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
    }

    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    // Build query
    const query: Record<string, unknown> = {};
    if (status && ['active', 'inactive', 'on_leave', 'suspended', 'retrenched', 'resigned', 'retired'].includes(status)) {
      query.status = status;
    }

    // Get staff with user details
    const staff = await Staff.find(query)
      .populate('user', 'firstName lastName email role profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Staff.countDocuments(query);

    return NextResponse.json({
      staff,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}

// POST - Add user to staff (Admin only)
export async function POST(req: NextRequest) {
  try {
    const adminCheck = await verifyAdmin(req);
    if ('error' in adminCheck) {
      return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
    }

    const { userId, designation, status } = await req.json();

    // Validate and sanitize inputs
    if (!userId || !designation) {
      return NextResponse.json({ message: 'User ID and designation are required' }, { status: 400 });
    }

    const sanitizedData = sanitizeStaffCreation({
      userId,
      designation,
      status,
    });

    await connectToDatabase();

    // Check if user exists
    const user = await User.findById(sanitizedData.userId);
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // Check if user is already in staff
    const existingStaff = await Staff.findOne({ user: sanitizedData.userId });
    if (existingStaff) {
      return NextResponse.json({ message: 'User is already in staff' }, { status: 400 });
    }

    // Create staff record
    const newStaff = new Staff({
      user: sanitizedData.userId,
      designation: sanitizedData.designation,
      status: sanitizedData.status,
    });

    await newStaff.save();

    // Populate user details for response
    await newStaff.populate('user', 'firstName lastName email role profileImage');

    return NextResponse.json({
      message: 'Staff member added successfully',
      staff: newStaff
    }, { status: 201 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}
