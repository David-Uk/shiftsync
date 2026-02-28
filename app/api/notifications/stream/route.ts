import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import Notification from '@/models/Notification';
import Location from '@/models/Location';
import connectToDatabase from '@/lib/mongodb';

// GET /api/notifications/stream - Server-Sent Events for real-time notifications
export async function GET(request: NextRequest) {
  // Get token from query parameter for SSE authentication
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  
  if (!token) {
    return new Response('Token is required', { status: 401 });
  }

  // Verify token directly instead of using verifyAuth (which expects headers)
  const auth = await verifyToken(token);
  if (!auth) {
    return new Response('Unauthorized', { status: 401 });
  }

  const user = auth;

  // Create a readable stream
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

      // Set up polling interval (every 5 seconds)
      const pollInterval = setInterval(async () => {
        try {
          await connectToDatabase();

          // Get user's location if they're a manager
          let userLocation = undefined;
          if (user.role === 'manager') {
            const location = await Location.findOne({ manager: user._id });
            userLocation = location?._id;
          }

          // Get unread notifications
          const notifications = await Notification.getUserNotifications(
            user._id,
            user.role,
            userLocation,
            { page: 1, limit: 10, unreadOnly: true }
          );

          if (notifications.notifications.length > 0) {
            controller.enqueue(
              `data: ${JSON.stringify({
                type: 'notifications',
                data: notifications.notifications
              })}\n\n`
            );
          }

          // Send unread count
          const unreadCount = await Notification.getUnreadCount(
            user._id,
            user.role,
            userLocation
          );

          controller.enqueue(
            `data: ${JSON.stringify({
              type: 'unread_count',
              data: { count: unreadCount }
            })}\n\n`
          );
        } catch (error) {
          console.error('Error in notification stream:', error);
          controller.enqueue(
            `data: ${JSON.stringify({
              type: 'error',
              message: 'Failed to fetch notifications'
            })}\n\n`
          );
        }
      }, 5000);

      // Clean up when client disconnects
      request.signal.addEventListener('abort', () => {
        clearInterval(pollInterval);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  });
}
