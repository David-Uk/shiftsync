'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { MapPin, Phone, Mail, Plus, Edit, Trash2, RefreshCw } from 'lucide-react';

interface Location {
  _id: string;
  address: string;
  city: string;
  timezone: string;
  manager: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  updatedAt?: string;
}

interface Manager {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isAvailable: boolean;
  assignedLocationCount: number;
}

interface ApiUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface ApiLocation {
  manager: string | { _id: string };
}

export default function LocationsPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [formData, setFormData] = useState({
    address: '',
    city: '',
    timezone: 'GMT+0',
    manager: ''
  });
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    const handleRefresh = async () => {
      setRefreshing(true);
      await fetchLocations();
      setRefreshing(false);
    };

    const fetchLocations = async () => {
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({
          search: searchTerm
        });

        // Add manager filter if user is a manager
        if (user?.role === 'manager') {
          params.append('managerId', user._id || user.id);
        }

        const response = await fetch(`/api/locations?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setLocations(data.data || []);
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to fetch locations');
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchManagers = async () => {
      try {
        const token = localStorage.getItem('token');

        // 1. Fetch all users with manager role
        const usersResponse = await fetch('/api/users?role=manager&limit=100', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        // 2. Fetch all locations to see which managers are already assigned
        const locationsResponse = await fetch('/api/locations?limit=100', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (usersResponse.ok && locationsResponse.ok) {
          const userData = await usersResponse.json();
          const locationData = await locationsResponse.json();

          const allUsers = userData.users || [];
          const allLocations = locationData.data || [];

          // Count locations per manager
          const locationCounts: Record<string, number> = {};
          allLocations.forEach((loc: ApiLocation) => {
            const mId = typeof loc.manager === 'object' && loc.manager !== null ? loc.manager._id : loc.manager;
            if (mId) locationCounts[mId] = (locationCounts[mId] || 0) + 1;
          });

          const mappedManagers = allUsers.map((u: ApiUser) => ({
            _id: u._id,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            role: u.role,
            isAvailable: true, // Always available for multiple assignments now
            assignedLocationCount: locationCounts[u._id] || 0
          }));

          setManagers(mappedManagers);
        } else {
          throw new Error('Failed to fetch manager data');
        }
      } catch (error) {
        console.error('Error fetching managers:', error);
      }
    };

    fetchLocations();
    if (user?.role === 'admin') {
      fetchManagers();
    }
  }, [isAuthenticated, searchTerm, user?.role, user?._id, user?.id, router]);

  const filteredLocations = locations.filter(location =>
    location.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.city.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateTimeSpan = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();

    const totalDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

    if (totalDays === 0) return 'Created today';
    if (totalDays === 1) return 'Created yesterday';
    if (totalDays < 7) return `Created ${totalDays} days ago`;
    if (totalDays < 30) return `Created ${Math.floor(totalDays / 7)} week${Math.floor(totalDays / 7) > 1 ? 's' : ''} ago`;
    if (totalDays < 365) return `Created ${Math.floor(totalDays / 30)} month${Math.floor(totalDays / 30) > 1 ? 's' : ''} ago`;
    return `Created ${Math.floor(totalDays / 365)} year${Math.floor(totalDays / 365) > 1 ? 's' : ''} ago`;
  };

  const handleDeleteLocation = async (locationId: string) => {
    if (!confirm('Are you sure you want to delete this location?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/locations/${locationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setLocations(prev => prev.filter(loc => loc._id !== locationId));
      } else {
        throw new Error('Failed to delete location');
      }
    } catch (error) {
      console.error('Error deleting location:', error);
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.address || !formData.city || !formData.timezone || !formData.manager) {
      alert('Please fill in all required fields');
      return;
    }

    setFormLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/locations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          createdBy: user?._id || user?.id
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setLocations(prev => [data.data, ...prev]);
        setShowCreateForm(false);
        setFormData({
          address: '',
          city: '',
          timezone: '',
          manager: ''
        });
        alert('Location created successfully!');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create location');
      }
    } catch (error) {
      console.error('Error creating location:', error);
      alert(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setFormLoading(false);
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

  // Only admins and managers can access this page
  if (user?.role !== 'admin' && user?.role !== 'manager') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
            <h2 className="text-lg font-bold mb-2">Access Denied</h2>
            <p className="text-red-700">You don&apos;t have permission to access this page.</p>
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
              <h1 className="text-2xl font-bold text-gray-900">
                {user?.role === 'manager' ? 'My Locations' : 'Locations'}
              </h1>
              <p className="text-gray-600 mt-1">
                {user?.role === 'manager'
                  ? 'Locations assigned to you for management'
                  : 'Manage work locations'
                }
              </p>
            </div>

            {user?.role === 'admin' && (
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="mt-4 sm:mt-0 sm:ml-4 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Location
              </button>
            )}
          </div>
        </div>

        {/* Create Form Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300">
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 max-w-md w-full max-h-[90vh] overflow-y-auto transform transition-all">
              <div className="p-6">
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-100">
                  <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
                    Create New Location
                  </h2>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="p-1.5 text-gray-400 bg-gray-50 rounded-full hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    ×
                  </button>
                </div>

                <form onSubmit={handleCreateLocation} className="space-y-3.5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Address *
                    </label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                      placeholder="123 Main St"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      City *
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                      placeholder="New York"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Timezone *
                    </label>
                    <select
                      value={formData.timezone}
                      onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 font-medium text-gray-700 outline-none text-sm"
                      required
                    >
                      <option value="">Select timezone</option>
                      <option value="GMT-12">GMT-12</option>
                      <option value="GMT-11">GMT-11</option>
                      <option value="GMT-10">GMT-10</option>
                      <option value="GMT-9">GMT-9</option>
                      <option value="GMT-8">GMT-8</option>
                      <option value="GMT-7">GMT-7</option>
                      <option value="GMT-6">GMT-6</option>
                      <option value="GMT-5">GMT-5</option>
                      <option value="GMT-4">GMT-4</option>
                      <option value="GMT-3">GMT-3</option>
                      <option value="GMT-2">GMT-2</option>
                      <option value="GMT-1">GMT-1</option>
                      <option value="GMT+0">GMT+0</option>
                      <option value="GMT+1">GMT+1</option>
                      <option value="GMT+2">GMT+2</option>
                      <option value="GMT+3">GMT+3</option>
                      <option value="GMT+4">GMT+4</option>
                      <option value="GMT+5">GMT+5</option>
                      <option value="GMT+6">GMT+6</option>
                      <option value="GMT+7">GMT+7</option>
                      <option value="GMT+8">GMT+8</option>
                      <option value="GMT+9">GMT+9</option>
                      <option value="GMT+10">GMT+10</option>
                      <option value="GMT+11">GMT+11</option>
                      <option value="GMT+12">GMT+12</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Manager *
                    </label>
                    <select
                      value={formData.manager}
                      onChange={(e) => setFormData(prev => ({ ...prev, manager: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 font-medium text-gray-700 outline-none text-sm"
                      required
                    >
                      <option value="">Select manager</option>
                      {managers.map((manager) => (
                        <option
                          key={manager._id}
                          value={manager._id}
                          className="text-gray-700"
                        >
                          👤 {manager.firstName} {manager.lastName} ({manager.email}) — {manager.assignedLocationCount === 0 ? 'No active locations' : `${manager.assignedLocationCount} location${manager.assignedLocationCount > 1 ? 's' : ''} assigned`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 hover:shadow-sm transition-all duration-200 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={formLoading}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl shadow-md shadow-indigo-200/50 hover:shadow-lg hover:shadow-indigo-300/50 hover:-translate-y-0.5 transition-all duration-200 flex items-center font-medium text-sm disabled:opacity-50"
                    >
                      {formLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1.5" />
                          Create Location
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search locations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 text-gray-400" />
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="bg-white text-gray-700 border border-gray-200 shadow-sm px-4 py-2 rounded-xl hover:bg-gray-50 hover:shadow hover:-translate-y-0.5 transition-all duration-200 flex items-center font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <RefreshCw className={`h-4 w-4 mr-2 text-gray-500 ${refreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Locations Grid */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading locations...</p>
            </div>
          ) : filteredLocations.length === 0 ? (
            <div className="p-12 text-center">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No locations found</h3>
              <p className="text-gray-600">
                {searchTerm
                  ? `No locations found matching "${searchTerm}"`
                  : 'No locations found'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
              {filteredLocations.map((location) => (
                <div
                  key={location._id}
                  className="bg-white p-6 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col h-full">
                    <div className="flex-1">
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">{location.address}</h3>
                        <p className="text-sm text-gray-600">{location.city}</p>
                        <p className="text-xs text-gray-500">Timezone: {location.timezone}</p>
                        <p className="text-xs text-indigo-600 font-medium mt-1">{calculateTimeSpan(location.createdAt, location.updatedAt)}</p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-start">
                          <MapPin className="h-4 w-4 mr-2 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-0.5">Address</p>
                            <p className="text-sm text-gray-700">{location.address}</p>
                          </div>
                        </div>

                        <div className="flex items-start">
                          <Phone className="h-4 w-4 mr-2 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-0.5">Manager Contact</p>
                            <p className="text-sm text-gray-700">{location.manager.email}</p>
                          </div>
                        </div>

                        <div className="flex items-start">
                          <Mail className="h-4 w-4 mr-2 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-0.5">Email</p>
                            <p className="text-sm text-gray-700">{location.manager.email}</p>
                          </div>
                        </div>

                        <div className="flex items-start">
                          <div className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5">
                            <div className="w-full h-full rounded-full bg-indigo-100 flex items-center justify-center">
                              <span className="text-xs font-medium text-indigo-600">MGR</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-0.5">Assigned Manager</p>
                            <p className="text-sm text-gray-700 font-medium">
                              {location.manager.firstName} {location.manager.lastName}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {user?.role === 'admin' && (
                      <div className="flex gap-2 mt-6 pt-4 border-t border-gray-100">
                        <button
                          onClick={() => router.push(`/locations/${location._id}/edit`)}
                          className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 text-sm flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow active:scale-[0.98]"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </button>

                        <button
                          onClick={() => handleDeleteLocation(location._id)}
                          className="flex-1 bg-red-50 text-red-600 px-3 py-2 rounded-lg hover:bg-red-100 text-sm flex items-center justify-center transition-all duration-200 border border-red-100 active:scale-[0.98]"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </button>
                      </div>
                    )}
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
