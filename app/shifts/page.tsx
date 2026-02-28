'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Calendar, Clock, MapPin, Search } from 'lucide-react';

interface Shift {
  _id: string;
  startTime: string;
  endTime: string;
  location: {
    _id: string;
    address: string;
    city: string;
  };
  role: string;
  status: string;
  notes?: string;
}

export default function MyShiftsPage() {
  const { user, isAuthenticated } = useAuth();
  const { notifications, markAsRead } = useNotifications();
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    const fetchShifts = async () => {
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({
          filter,
          search: searchTerm
        });

        const response = await fetch(`/api/my-shifts?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setShifts(data.shifts || []);
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to fetch shifts');
        }
      } catch (error) {
        console.error('Error fetching shifts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchShifts();
  }, [isAuthenticated, filter, searchTerm, router]);

  const filteredShifts = shifts.filter(shift => {
    const matchesSearch = shift.location.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shift.location.city.toLowerCase().includes(searchTerm.toLowerCase());

    if (filter === 'upcoming') {
      return matchesSearch && new Date(shift.startTime) > new Date();
    } else if (filter === 'past') {
      return matchesSearch && new Date(shift.startTime) <= new Date();
    }

    return matchesSearch;
  });

  const handleShiftClick = (shiftId: string) => {
    // Mark related notifications as read
    const shiftNotifications = notifications.filter(n =>
      n.relatedEntity?.id === shiftId && n.type === 'shift_assigned'
    );

    if (shiftNotifications.length > 0) {
      markAsRead(shiftNotifications.map(n => n._id));
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Shifts</h1>
              <p className="text-gray-600 mt-1">Manage and view your assigned work shifts</p>
            </div>

            <div className="mt-4 sm:mt-0 sm:ml-4">
              <div className="flex space-x-4">
                {/* Filter Tabs */}
                <div className="flex rounded-lg bg-gray-100 p-1">
                  <button
                    onClick={() => setFilter('upcoming')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${filter === 'upcoming'
                      ? 'bg-white text-indigo-600 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    Upcoming
                  </button>
                  <button
                    onClick={() => setFilter('past')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${filter === 'past'
                      ? 'bg-white text-indigo-600 shadow'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    Past
                  </button>
                </div>

                {/* Search */}
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search shifts..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Shifts List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading shifts...</p>
            </div>
          ) : filteredShifts.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No shifts found</h3>
              <p className="text-gray-600">
                {searchTerm
                  ? `No shifts found matching "${searchTerm}"`
                  : 'No shifts found for the selected filter'
                }
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredShifts.map((shift) => (
                <div
                  key={shift._id}
                  onClick={() => handleShiftClick(shift._id)}
                  className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="flex items-center text-sm text-gray-500">
                          <Calendar className="h-4 w-4 mr-1" />
                          {new Date(shift.startTime).toLocaleDateString()}
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Clock className="h-4 w-4 mr-1" />
                          {new Date(shift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                          {new Date(shift.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <div className="flex items-center text-sm text-gray-500">
                          <MapPin className="h-4 w-4 mr-1" />
                          <span>{shift.location.address}</span>
                        </div>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${shift.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                          shift.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                          {shift.status}
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm text-gray-600 mb-1">Role: {shift.role}</p>
                      {shift.notes && (
                        <p className="text-sm text-gray-500">{shift.notes}</p>
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
