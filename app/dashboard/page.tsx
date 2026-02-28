'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Users, Clock, Settings, MapPin, UserCheck, TrendingUp, Activity } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface DashboardStats {
  totalShifts: number;
  hoursThisWeek: number;
  pendingRequests: number;
  // Admin specific
  totalUsers?: number;
  activeUsers?: number;
  totalLocations?: number;
  totalSchedules?: number;
  totalStaff?: number;
  usersByRole?: Array<{ _id: string; count: number }>;
  // Manager specific
  managedLocations?: number;
  staffAtLocations?: number;
  locations?: Array<{
    _id: string;
    address: string;
    city: string;
    timezone: string;
  }>;
  // Staff specific
  assignedShifts?: number;
  completedShifts?: number;
  status?: string;
  designation?: string;
}

export default function DashboardPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const { showError, showSuccess } = useToast();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/dashboard/stats', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch dashboard stats');
        }

        const data = await response.json();
        setStats(data.stats);
        showSuccess('Dashboard stats loaded successfully');
      } catch (error) {
        console.error('Error fetching stats:', error);
        showError('Failed to load dashboard statistics');
      } finally {
        setStatsLoading(false);
      }
    };

    if (isAuthenticated && user) {
      fetchStats();
    }
  }, [isAuthenticated, user, showError, showSuccess]);

  if (isLoading || !isAuthenticated) {
    return null; // Will be handled by DashboardLayout
  }

  if (statsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="ml-4 text-gray-600">Loading dashboard...</p>
        </div>
      </DashboardLayout>
    );
  }

  const renderAdminStats = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white/95 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-100/50 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group">
          <div className="flex items-center">
            <div className="shrink-0 p-3 bg-indigo-50 rounded-xl group-hover:bg-indigo-100 transition-colors duration-300">
              <Users className="h-7 w-7 text-indigo-600" />
            </div>
            <div className="ml-5">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Total Users</p>
              <p className="text-3xl font-black text-gray-900 mt-1">{stats?.totalUsers || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-100/50 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group">
          <div className="flex items-center">
            <div className="shrink-0 p-3 bg-green-50 rounded-xl group-hover:bg-green-100 transition-colors duration-300">
              <UserCheck className="h-7 w-7 text-green-600" />
            </div>
            <div className="ml-5">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Active Staff</p>
              <p className="text-3xl font-black text-gray-900 mt-1">{stats?.activeUsers || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/95 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-gray-100/50 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group">
          <div className="flex items-center">
            <div className="shrink-0 p-3 bg-blue-50 rounded-xl group-hover:bg-blue-100 transition-colors duration-300">
              <MapPin className="h-7 w-7 text-blue-600" />
            </div>
            <div className="ml-5">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Total Locations</p>
              <p className="text-3xl font-black text-gray-900 mt-1">{stats?.totalLocations || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="shrink-0 p-3 bg-purple-50 rounded-xl group-hover:bg-purple-100 transition-colors duration-300">
              <Calendar className="h-7 w-7 text-purple-600" />
            </div>
            <div className="ml-5">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Total Schedules</p>
              <p className="text-3xl font-black text-gray-900 mt-1">{stats?.totalSchedules || 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/90 backdrop-blur-md shadow-sm rounded-2xl border border-gray-100 overflow-hidden transition-all duration-300">
        <div className="px-6 py-5 bg-gray-50/50 border-b border-gray-100">
          <h3 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">User Distribution by Role</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {stats?.usersByRole?.map((roleData) => (
              <div key={roleData._id} className="flex items-center justify-between p-3 bg-white/50 border border-gray-100 rounded-xl hover:shadow-sm transition-all duration-200">
                <span className="text-sm font-semibold text-gray-600 capitalize">{roleData._id}s</span>
                <span className="text-lg font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">{roleData.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  const renderManagerStats = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="shrink-0">
              <MapPin className="h-8 w-8 text-indigo-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Managed Locations</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.managedLocations || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="shrink-0">
              <Users className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Staff at Locations</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.staffAtLocations || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="shrink-0">
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Shifts</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalShifts || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="shrink-0">
              <Clock className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Hours This Week</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.hoursThisWeek || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Managed Locations */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Managed Locations</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats?.locations?.map((location) => (
              <div key={location._id} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900">{location.city}</h4>
                <p className="text-sm text-gray-600 mt-1">{location.address}</p>
                <p className="text-xs text-gray-500 mt-2">Timezone: {location.timezone}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  const renderStaffStats = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="shrink-0">
              <Calendar className="h-8 w-8 text-indigo-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Assigned Shifts</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.assignedShifts || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="shrink-0">
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Completed Shifts</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.completedShifts || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="shrink-0">
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Hours This Week</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.hoursThisWeek || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="shrink-0">
              <Activity className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Status</p>
              <p className="text-lg font-bold text-gray-900 capitalize">{stats?.status || 'Unknown'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="shrink-0">
              <UserCheck className="h-8 w-8 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Designation</p>
              <p className="text-lg font-bold text-gray-900">{stats?.designation || 'Not Assigned'}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.firstName}!
          </h1>
          <p className="mt-2 text-gray-600">
            Here&apos;s your {user?.role} dashboard with current statistics.
          </p>
        </div>

        {/* Role-specific Stats */}
        {user?.role === 'admin' && renderAdminStats()}
        {user?.role === 'manager' && renderManagerStats()}
        {user?.role === 'staff' && renderStaffStats()}

        {/* Common Stats for All Roles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="shrink-0">
                <Calendar className="h-8 w-8 text-indigo-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Shifts</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.totalShifts || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="shrink-0">
                <Clock className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Hours This Week</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.hoursThisWeek || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="shrink-0">
                <Settings className="h-8 w-8 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pending Requests</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.pendingRequests || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                href="/shifts"
                className="block p-4 text-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Calendar className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
                <span className="text-sm font-medium text-gray-900">View My Shifts</span>
              </Link>
              <Link
                href="/schedule"
                className="block p-4 text-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Clock className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <span className="text-sm font-medium text-gray-900">Manage Schedule</span>
              </Link>
              <Link
                href="/team"
                className="block p-4 text-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Users className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <span className="text-sm font-medium text-gray-900">Team Directory</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
