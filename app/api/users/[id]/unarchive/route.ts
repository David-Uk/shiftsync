import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { verifyAdmin } from '@/lib/auth';
import { validateObjectId } from '@/lib/validation';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminCheck = await verifyAdmin(req);
    if ('error' in adminCheck) {
      return NextResponse.json({ message: adminCheck.error }, { status: adminCheck.status });
    }

    const { id } = await params;
    validateObjectId(id);
    await connectToDatabase();

    const unarchivedUser = await User.findByIdAndUpdate(
      id,
      { isArchived: false },
      { new: true }
    ).select('-password');

    if (!unarchivedUser) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(
      { message: 'User unarchived successfully', user: unarchivedUser },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({ message: 'Internal server error', error: errorMessage }, { status: 500 });
  }
}
