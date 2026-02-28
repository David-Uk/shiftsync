import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Notification from '@/models/Notification';
import { verifyAuth } from '@/lib/auth';

// PUT /api/notifications/read - Mark notifications as read
export async function PUT(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const auth = await verifyAuth(request);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const user = auth.user!;
    const body = await request.json();
    const { notificationIds } = body;

    const result = await Notification.markAsRead(user._id, notificationIds);

    return NextResponse.json({ 
      message: 'Notifications marked as read',
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/notifications/count - Get unread count
export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const auth = await verifyAuth(request);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const user = auth.user!;

    // Get user's location if they're a manager
    let userLocation = undefined;
    if (user.role === 'manager') {
      const Location = (await import('@/models/Location')).default;
      const location = await Location.findOne({ manager: user._id });
      userLocation = location?._id;
    }

    const unreadCount = await Notification.getUnreadCount(
      user._id,
      user.role,
      userLocation
    );

    return NextResponse.json({ unreadCount });
  } catch (error) {
    console.error('Error getting unread count:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
