'use client';

import DashboardLayout from '@/components/DashboardLayout';
import ShiftScheduleModal from '@/components/ShiftScheduleModal';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { Calendar, Clock, MapPin, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface Shift {
  _id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location: {
    _id: string;
    address: string;
    city: string;
    timezone?: string;
  };
  manager: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  workDays: string[];
  timezone: string;
  requiredSkills: string[];
  headcount: number;
  assignedStaff: string[];
  isActive: boolean;
  startDate: string;
  endDate?: string;
  status?: string;
  role?: string;
  notes?: string;
}

export default function MyShiftsPage() {
  const { user, isAuthenticated } = useAuth();
  const { notifications, markAsRead } = useNotifications();
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'my' | 'team'>('my');
  const [filter, setFilter] = useState('upcoming');
  const [searchTerm, setSearchTerm] = useState('');
  const [showShiftModal, setShowShiftModal] = useState(false);

  const fetchShifts = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({
        filter,
        search: searchTerm
      });

      // Use different endpoint based on view
      const endpoint = view === 'my' ? '/api/my-shifts' : '/api/shift-schedules';
      
      const response = await fetch(`${endpoint}?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setShifts(Array.isArray(data.data) ? data.data : []);
      } else {
        setShifts([]);
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }, [filter, searchTerm, view]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    fetchShifts();
  }, [isAuthenticated, fetchShifts, router]);

  const filteredShifts = shifts.filter(shift => {
    const addressMatch = shift.location.address?.toLowerCase().includes(searchTerm.toLowerCase());
    const cityMatch = shift.location.city?.toLowerCase().includes(searchTerm.toLowerCase());
    const titleMatch = shift.title?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSearch = addressMatch || cityMatch || titleMatch;

    const today = new Date();
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Recurring shifts logic
    const isRecurring = shift.workDays && shift.workDays.length > 0;
    const endDate = shift.endDate ? new Date(shift.endDate) : null;
    const endDay = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) : null;

    if (filter === 'upcoming') {
      if (isRecurring) {
        // Show if recurring hasn't ended yet
        return matchesSearch && (!endDay || endDay >= todayDay);
      }
      // One-off shift logic (using startTime as date)
      const shiftDate = new Date(shift.startTime);
      const shiftDay = new Date(shiftDate.getFullYear(), shiftDate.getMonth(), shiftDate.getDate());
      return matchesSearch && shiftDay >= todayDay;
    } else if (filter === 'past') {
      if (isRecurring) {
        // Show if recurring has ended
        return matchesSearch && endDay && endDay < todayDay;
      }
      const shiftDate = new Date(shift.startTime);
      const shiftDay = new Date(shiftDate.getFullYear(), shiftDate.getMonth(), shiftDate.getDate());
      return matchesSearch && shiftDay < todayDay;
    }

    return matchesSearch;
  });

  const getShiftStatus = (shift: Shift) => {
    const now = new Date();
    const startTime = new Date(shift.startTime);
    const endTime = new Date(shift.endTime);
    
    // For status display, we use exact times if it's today
    const shiftDay = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
    const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const isToday = shiftDay.getTime() === todayDay.getTime();
    
    if (startTime > now) return { label: 'Upcoming', color: 'bg-green-50 text-green-600' };
    if (isToday && startTime <= now && endTime >= now) return { label: 'In Progress', color: 'bg-indigo-50 text-indigo-600' };
    return { label: 'Completed', color: 'bg-gray-100 text-gray-500' };
  };

  // Set initial view based on role
  useEffect(() => {
    if (user?.role === 'manager' || user?.role === 'admin') {
      setView('team');
    }
  }, [user?.role]);

  const handleShiftClick = (shiftId: string) => {
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
        <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                {view === 'my' ? 'My Shifts' : 'Team Schedule'}
              </h1>
              <p className="text-gray-500 mt-2 font-medium">
                {view === 'my' ? 'Manage and view your assigned work shifts' : 'View full team schedule across all locations'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {user?.role === 'manager' && (
                <button
                  type="button"
                  onClick={() => setShowShiftModal(true)}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 transition-all duration-300 shadow-lg shadow-indigo-100 flex items-center font-bold text-sm"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Create Weekly Shift
                </button>
              )}
            </div>
          </div>

          <div className="mt-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex flex-wrap gap-4">
              {/* View Toggle */}
              <div className="flex p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setView('my')}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${view === 'my'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  My Shifts
                </button>
                <button
                  onClick={() => setView('team')}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${view === 'team'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  Team View
                </button>
              </div>

              {/* Status Filter */}
              <div className="flex p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setFilter('upcoming')}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${filter === 'upcoming'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  Upcoming
                </button>
                <button
                  onClick={() => setFilter('past')}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${filter === 'past'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                  Past
                </button>
              </div>
            </div>

            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search shifts or locations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none font-medium shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Shifts List */}
        <div className="grid grid-cols-1 gap-4">
          {loading ? (
            <div className="p-20 text-center bg-white rounded-3xl border border-gray-100 shadow-sm">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-500 font-bold">Loading schedules...</p>
            </div>
          ) : filteredShifts.length === 0 ? (
            <div className="p-20 text-center bg-white rounded-3xl border border-gray-100 shadow-sm">
              <Calendar className="h-16 w-16 text-gray-200 mx-auto mb-6" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">No schedules found</h3>
              <p className="text-gray-500 font-medium">
                {searchTerm
                  ? `Try adjusting your search for "${searchTerm}"`
                  : 'Check back later for newly published shifts'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredShifts.map((shift) => (
                <div
                  key={shift._id}
                  onClick={() => handleShiftClick(shift._id)}
                  className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="bg-indigo-50 p-3 rounded-2xl group-hover:bg-indigo-600 transition-colors duration-300">
                          <Clock className="h-5 w-5 text-indigo-600 group-hover:text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 line-clamp-1">{shift.title || 'General Shift'}</h3>
                          <div className="flex items-center text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                            {new Date(shift.startTime).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getShiftStatus(shift).color}`}>
                        {getShiftStatus(shift).label}
                      </span>
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center text-gray-600 bg-gray-50 p-3 rounded-2xl">
                        <MapPin className="h-4 w-4 mr-3 text-gray-400" />
                        <span className="text-sm font-semibold">{shift.location.city} - {shift.location.address}</span>
                      </div>
                      <div className="flex items-center text-gray-600 bg-gray-50 p-3 rounded-2xl">
                        <Clock className="h-4 w-4 mr-3 text-gray-400" />
                        <span className="text-sm font-bold">
                          {new Date(shift.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                          {new Date(shift.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                    <div className="flex -space-x-2 overflow-hidden">
                      {shift.assignedStaff?.length > 0 ? (
                        <>
                          {[1, 2, 3].slice(0, shift.assignedStaff.length).map((_, i) => (
                            <div key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                              S{i + 1}
                            </div>
                          ))}
                          {shift.assignedStaff.length > 3 && (
                            <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600">
                              +{shift.assignedStaff.length - 3}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 font-bold">No staff assigned</span>
                      )}
                    </div>
                    {shift.role && (
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">
                        {shift.role}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ShiftScheduleModal
        isOpen={showShiftModal}
        onClose={() => setShowShiftModal(false)}
        onSuccess={() => {
          fetchShifts();
        }}
      />
    </DashboardLayout>
  );
}

