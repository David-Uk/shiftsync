'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Calendar, Users, Plus, Edit, Trash2, MapPin } from 'lucide-react';

interface Schedule {
  _id: string;
  weekStart: string;
  weekEnd: string;
  location: {
    _id: string;
    address: string;
    city: string;
    timezone: string;
  };
  shifts: Array<{
    _id: string;
    startTime: string;
    endTime: string;
    role: string;
    status: string;
  }>;
  isPublished: boolean;
  createdAt: string;
}

export default function SchedulePage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    const fetchSchedules = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/schedules', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSchedules(data.schedules || []);
        } else {
          throw new Error('Failed to fetch schedules');
        }
      } catch (error) {
        console.error('Error fetching schedules:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedules();
  }, [isAuthenticated, router]);

  const handlePublishSchedule = async (scheduleId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/schedules/${scheduleId}/publish`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Update the local state
        setSchedules(prev =>
          prev.map(schedule =>
            schedule._id === scheduleId
              ? { ...schedule, isPublished: true }
              : schedule
          )
        );
      } else {
        throw new Error('Failed to publish schedule');
      }
    } catch (error) {
      console.error('Error publishing schedule:', error);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setSchedules(prev => prev.filter(schedule => schedule._id !== scheduleId));
      } else {
        throw new Error('Failed to delete schedule');
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Only managers and admins can access this page
  if (user?.role !== 'manager' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
            <h2 className="text-lg font-bold mb-2">Access Denied</h2>
            <p className="text-red-700">You don't have permission to access this page.</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-4 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
            >
              Go Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Schedule Management</h1>
              <p className="text-gray-600 mt-1">Create and manage work schedules</p>
            </div>

            {(user?.role === 'admin' || user?.role === 'manager') && (
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="mt-4 sm:mt-0 sm:ml-4 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Schedule
              </button>
            )}
          </div>
        </div>

        {/* Create Form Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Schedule</h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
              {/* Form fields would go here */}
              <p className="text-gray-600">Schedule creation form would be implemented here...</p>
            </div>
          </div>
        )}

        {/* Schedules List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading schedules...</p>
            </div>
          ) : schedules.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No schedules found</h3>
              <p className="text-gray-600">Create your first schedule to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {schedules.map((schedule) => (
                <div
                  key={schedule._id}
                  className="p-6 border-b border-gray-200 last:border-b-0"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="flex items-center text-sm text-gray-500">
                          <Calendar className="h-4 w-4 mr-1" />
                          {new Date(schedule.weekStart).toLocaleDateString()} - {new Date(schedule.weekEnd).toLocaleDateString()}
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Users className="h-4 w-4 mr-1" />
                          {schedule.shifts?.length || 0} shifts
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <MapPin className="h-4 w-4 mr-1" />
                          {schedule.location.city}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${schedule.isPublished
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                          }`}>
                          {schedule.isPublished ? 'Published' : 'Draft'}
                        </span>
                        <span className="text-sm text-gray-600 ml-2">
                          Created: {new Date(schedule.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      {!schedule.isPublished && (
                        <button
                          onClick={() => handlePublishSchedule(schedule._id)}
                          className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 text-sm"
                        >
                          Publish
                        </button>
                      )}

                      <button
                        onClick={() => router.push(`/schedules/${schedule._id}/edit`)}
                        className="bg-indigo-600 text-white px-3 py-1 rounded-md hover:bg-indigo-700 text-sm"
                      >
                        <Edit className="h-4 w-4" />
                      </button>

                      {(user?.role === 'admin' || user?.role === 'manager') && (
                        <button
                          onClick={() => handleDeleteSchedule(schedule._id)}
                          className="bg-red-600 text-white px-3 py-1 rounded-md hover:bg-red-700 text-sm"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
