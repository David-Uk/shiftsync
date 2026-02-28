'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { MapPin, Phone, Mail, Plus, Edit, Trash2 } from 'lucide-react';

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

export default function LocationsPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [formData, setFormData] = useState({
    address: '',
    city: '',
    timezone: '',
    manager: ''
  });
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    const fetchLocations = async () => {
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({
          search: searchTerm
        });

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
          throw new Error('Failed to fetch locations');
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
          
          // Get IDs of managers already assigned to a location
          const assignedManagerIds = new Set(allLocations.map((loc: any) => 
            typeof loc.manager === 'object' ? loc.manager._id : loc.manager
          ));

          const mappedManagers = allUsers.map((u: any) => ({
            _id: u._id,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            role: u.role,
            isAvailable: !assignedManagerIds.has(u._id),
            assignedLocationCount: assignedManagerIds.has(u._id) ? 1 : 0
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
  }, [isAuthenticated, searchTerm, user?.role, router]);

  const filteredLocations = locations.filter(location =>
    location.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.city.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
              <p className="text-gray-600 mt-1">Manage work locations</p>
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
                          disabled={!manager.isAvailable}
                          className={manager.isAvailable ? "text-green-600" : "text-gray-400"}
                        >
                          {manager.isAvailable ? '✅' : '🚫'} {manager.firstName} {manager.lastName} ({manager.email}) {manager.isAvailable ? '- Available' : '- Already Assigned'}
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
          <div className="relative">
            <input
              type="text"
              placeholder="Search locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 text-gray-400" />
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
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{location.address}</h3>
                        <p className="text-sm text-gray-600">{location.city}</p>
                        <p className="text-xs text-gray-500">Timezone: {location.timezone}</p>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center text-sm text-gray-500">
                          <MapPin className="h-4 w-4 mr-1" />
                          <span>{location.address}</span>
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Phone className="h-4 w-4 mr-1" />
                          <span>Contact: {location.manager.email}</span>
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Mail className="h-4 w-4 mr-1" />
                          <span>{location.manager.email}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <button
                        onClick={() => router.push(`/locations/${location._id}/edit`)}
                        className="bg-indigo-600 text-white px-3 py-1 rounded-md hover:bg-indigo-700 text-sm"
                      >
                        <Edit className="h-4 w-4" />
                      </button>

                      {user?.role === 'admin' && (
                        <button
                          onClick={() => handleDeleteLocation(location._id)}
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
