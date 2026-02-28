'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';

export interface Notification {
  _id: string;
  title: string;
  message: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  recipient: string;
  sender?: string;
  location?: string;
  relatedEntity?: {
    type: 'shift' | 'schedule' | 'user' | 'location' | 'leave';
    id: string;
  };
  isRead: boolean;
  isPush: boolean;
  pushSentAt?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  recipientDetails?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  senderDetails?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  locationDetails?: {
    address: string;
    city: string;
  };
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  fetchNotifications: (options?: { page?: number; limit?: number; unreadOnly?: boolean }) => Promise<void>;
  markAsRead: (notificationIds?: string[]) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  createNotification: (notification: Partial<Notification>) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, token } = useAuth();

  // Fetch notifications from API
  const fetchNotifications = useCallback(async (options: { page?: number; limit?: number; unreadOnly?: boolean } = {}) => {
    if (!user || !token) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (options.page) params.append('page', options.page.toString());
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.unreadOnly) params.append('unreadOnly', 'true');

      const response = await fetch(`/api/notifications?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const data = await response.json();

      if (options.unreadOnly) {
        setNotifications(data.notifications);
      } else {
        setNotifications(prev =>
          options.page === 1
            ? data.notifications
            : [...prev, ...data.notifications]
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [user, token]);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!user || !token) return;

    try {
      const response = await fetch('/api/notifications/read', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return;

      const data = await response.json();
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.error('Error fetching unread count:', err);
    }
  }, [user, token]);

  // Mark notifications as read
  const markAsRead = async (notificationIds?: string[]) => {
    if (!user || !token) return;

    try {
      const response = await fetch('/api/notifications/read', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to mark notifications as read');
      }

      const data = await response.json();

      // Update local state
      if (notificationIds) {
        setNotifications(prev =>
          prev.map(notif =>
            notificationIds.includes(notif._id)
              ? { ...notif, isRead: true }
              : notif
          )
        );
      } else {
        setNotifications(prev =>
          prev.map(notif => ({ ...notif, isRead: true }))
        );
      }

      setUnreadCount(prev => Math.max(0, prev - data.modifiedCount));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  // Delete notification
  const deleteNotification = async (notificationId: string) => {
    if (!user || !token) return;

    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete notification');
      }

      // Update local state
      setNotifications(prev =>
        prev.filter(notif => notif._id !== notificationId)
      );

      const deletedNotif = notifications.find(n => n._id === notificationId);
      if (deletedNotif && !deletedNotif.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  // Create notification
  const createNotification = async (notification: Partial<Notification>) => {
    if (!user || !token) return;

    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notification),
      });

      if (!response.ok) {
        throw new Error('Failed to create notification');
      }

      const newNotification = await response.json();
      setNotifications(prev => [newNotification, ...prev]);

      if (!newNotification.isRead) {
        setUnreadCount(prev => prev + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  // Set up real-time notifications using Server-Sent Events
  useEffect(() => {
    if (!user || !token) return;

    // Add token as query parameter for SSE authentication
    const eventSource = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'notifications':
            setNotifications(prev => {
              const newNotifications = data.data.filter(
                (newNotif: Notification) =>
                  !prev.some(existingNotif => existingNotif._id === newNotif._id)
              );
              return [...newNotifications, ...prev];
            });
            break;

          case 'unread_count':
            setUnreadCount(data.data.count);
            break;

          case 'error':
            console.error('Notification stream error:', data.message);
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('Error parsing notification stream data:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('Notification stream error:', error);
      eventSource.close();

      // Try to reconnect after a delay
      setTimeout(() => {
        if (user && token) {
          console.log('Attempting to reconnect notification stream...');
          // The useEffect will handle reconnection
        }
      }, 5000);
    };

    return () => {
      eventSource.close();
    };
  }, [user, token]);

  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchNotifications({ page: 1, limit: 20 });
      fetchUnreadCount();
    }
  }, [user, fetchNotifications, fetchUnreadCount]);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    isLoading,
    error,
    fetchNotifications,
    markAsRead,
    deleteNotification,
    createNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
