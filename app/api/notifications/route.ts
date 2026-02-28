import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Notification from '@/models/Notification';
import User from '@/models/User';
import Location from '@/models/Location';
import { verifyAuth } from '@/lib/auth';

// GET /api/notifications - Get notifications for the current user
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const auth = await verifyAuth(request);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const user = auth.user!;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    // Get user's location if they're a manager
    let userLocation = undefined;
    if (user.role === 'manager') {
      const location = await Location.findOne({ manager: user._id });
      userLocation = location?._id;
    }

    const result = await Notification.getUserNotifications(
      user._id,
      user.role,
      userLocation,
      { page, limit, unreadOnly }
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/notifications - Create a new notification
export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const auth = await verifyAuth(request);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const senderUser = auth.user!;

    const body = await request.json();
    const {
      title,
      message,
      type,
      priority = 'medium',
      recipient,
      location,
      relatedEntity,
      metadata,
      expiresAt
    } = body;

    // Validate required fields
    if (!title || !message || !type || !recipient) {
      return NextResponse.json(
        { error: 'Missing required fields: title, message, type, recipient' },
        { status: 400 }
      );
    }

    // Validate recipient exists
    const recipientUser = await User.findById(recipient);
    if (!recipientUser) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    // Validate location if provided
    if (location) {
      const locationDoc = await Location.findById(location);
      if (!locationDoc) {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 });
      }
    }

    // Create notification
    const notification = await Notification.createNotification({
      title,
      message,
      type,
      priority,
      recipient,
      sender: senderUser._id,
      location,
      relatedEntity,
      metadata,
      expiresAt
    });

    // Populate notification details
    await notification.populate([
      { path: 'recipientDetails', select: 'firstName lastName email' },
      { path: 'senderDetails', select: 'firstName lastName email' },
      { path: 'locationDetails', select: 'address city' }
    ]);

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error('Error creating notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
