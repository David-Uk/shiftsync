'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Users, Mail, Phone, MapPin, MoreHorizontal } from 'lucide-react';

interface TeamMember {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'manager' | 'staff';
  designation?: string;
  location?: {
    _id: string;
    address: string;
    city: string;
    timezone: string;
  };
  status: string;
  profileImage?: string;
}

export default function TeamPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    const fetchTeamMembers = async () => {
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({
          search: searchTerm
        });

        const response = await fetch(`/api/users?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setTeamMembers(data.users || []);
        } else {
          throw new Error('Failed to fetch team members');
        }
      } catch (error) {
        console.error('Error fetching team members:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTeamMembers();
  }, [isAuthenticated, searchTerm, router]);

  const filteredTeamMembers = teamMembers.filter(member =>
    member.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        setTeamMembers(prev =>
          prev.map(member =>
            member._id === userId
              ? { ...member, role: newRole as 'admin' | 'manager' | 'staff' }
              : member
          )
        );
      } else {
        throw new Error('Failed to update user role');
      }
    } catch (error) {
      console.error('Error updating user role:', error);
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
              <h1 className="text-2xl font-bold text-gray-900">Team Directory</h1>
              <p className="text-gray-600 mt-1">View and manage team members</p>
            </div>

            {user?.role === 'admin' && (
              <button
                onClick={() => router.push('/users/create')}
                className="mt-4 sm:mt-0 sm:ml-4 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
              >
                Add Team Member
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Search team members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <Users className="absolute left-3 top-1/2 h-4 w-4 text-gray-400" />
          </div>
        </div>

        {/* Team Members Grid */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading team members...</p>
            </div>
          ) : filteredTeamMembers.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No team members found</h3>
              <p className="text-gray-600">
                {searchTerm
                  ? `No team members found matching "${searchTerm}"`
                  : 'No team members found'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTeamMembers.map((member) => (
                <div
                  key={member._id}
                  className="bg-white p-6 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start space-x-4">
                    {/* Avatar */}
                    <div className="shrink-0">
                      {member.profileImage ? (
                        <img
                          src={member.profileImage}
                          alt={`${member.firstName} ${member.lastName}`}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                          <span className="text-lg font-medium text-indigo-600">
                            {member.firstName?.charAt(0)}{member.lastName?.charAt(0)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Member Info */}
                    <div className="flex-1">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {member.firstName} {member.lastName}
                        </h3>
                        <p className="text-sm text-gray-600">{member.email}</p>
                        {member.designation && (
                          <p className="text-sm text-gray-500">{member.designation}</p>
                        )}
                      </div>

                      <div className="mt-2 space-y-2">
                        <div className="flex items-center text-sm text-gray-500">
                          <MapPin className="h-4 w-4 mr-1" />
                          {member.location?.city}
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Mail className="h-4 w-4 mr-1" />
                          {member.email}
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Phone className="h-4 w-4 mr-1" />
                          {member.location?.address}
                        </div>
                      </div>

                      {/* Role and Status */}
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${member.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                              member.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                                'bg-green-100 text-green-800'
                            }`}>
                            {member.role}
                          </span>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ml-2 ${member.status === 'active' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                            {member.status}
                          </span>
                        </div>

                        {user?.role === 'admin' && (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleRoleChange(member._id, member.role === 'staff' ? 'manager' : 'staff')}
                              className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                            >
                              Change Role
                            </button>
                            <button
                              onClick={() => router.push(`/users/${member._id}/edit`)}
                              className="text-gray-600 hover:text-gray-900 text-sm font-medium"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
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
