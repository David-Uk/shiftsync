'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Users, Mail, Shield, Plus, Edit, Trash2, Save, RefreshCw, Eye, EyeOff } from 'lucide-react';

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'manager' | 'staff';
  status: 'active' | 'inactive' | 'archived';
  profileImage?: string;
  phone?: string;
  createdAt: string;
  password?: string;
}

export default function UsersPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/users', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUsers(data.users || []);
        } else {
          throw new Error('Failed to fetch users');
        }
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    fetchUsers();
  }, [isAuthenticated, searchTerm, roleFilter, router]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      } else {
        throw new Error('Failed to refresh users');
      }
    } catch (error) {
      console.error('Error refreshing users:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = (user.firstName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (user.lastName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

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
        setUsers(prev =>
          prev.map(user =>
            user._id === userId
              ? { ...user, role: newRole as 'admin' | 'manager' | 'staff' }
              : user
          )
        );
      } else {
        throw new Error('Failed to update user role');
      }
    } catch (error) {
      console.error('Error updating user role:', error);
    }
  };

  const handleEditUser = (userItem: User) => {
    setSelectedUser(userItem);
    setIsEditMode(true);
    setShowEditModal(true);
  };

  const handleCreateUser = () => {
    setSelectedUser({
      _id: '',
      firstName: '',
      lastName: '',
      email: '',
      role: 'staff',
      status: 'active',
      phone: '',
      password: '',
      createdAt: new Date().toISOString()
    });
    setIsEditMode(true);
    setShowEditModal(true);
  };

  const handleModalSave = async () => {
    if (!selectedUser) return;

    try {
      const token = localStorage.getItem('token');

      if (isEditMode && selectedUser._id) {
        // Update existing user
        const userData = selectedUser.password ? selectedUser : { ...selectedUser, password: undefined };

        const response = await fetch(`/api/users/${selectedUser._id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(userData),
        });

        if (response.ok) {
          setUsers(prev =>
            prev.map(user =>
              user._id === selectedUser._id ? selectedUser : user
            )
          );
        } else {
          throw new Error('Failed to update user');
        }
      } else {
        // Create new user - validate password
        if (!selectedUser.password || selectedUser.password.length < 6) {
          throw new Error('Password must be at least 6 characters long');
        }

        const response = await fetch('/api/users', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(selectedUser),
        });

        if (response.ok) {
          const result = await response.json();
          setUsers(prev => [...prev, result.user]);
        } else {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create user');
        }
      }

      setShowEditModal(false);
      setSelectedUser(null);
      setIsEditMode(false);
    } catch (error) {
      console.error('Error saving user:', error);
      alert(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleModalClose = () => {
    setShowEditModal(false);
    setSelectedUser(null);
  };

  const handleArchiveUser = async (userId: string) => {
    if (!confirm('Are you sure you want to archive this user?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/users/${userId}/archive`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setUsers(prev =>
          prev.map(user =>
            user._id === userId
              ? { ...user, status: 'archived' }
              : user
          )
        );
      } else {
        throw new Error('Failed to archive user');
      }
    } catch (error) {
      console.error('Error archiving user:', error);
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

  // Only admins can access this page
  if (user?.role !== 'admin') {
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
        <div className="bg-white/90 backdrop-blur-md border border-gray-100 rounded-2xl shadow-sm p-6 transition-all duration-200 hover:shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">User Management</h1>
              <p className="text-gray-500 mt-1 font-medium">Manage system users and permissions</p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-white text-gray-700 border border-gray-200 shadow-sm px-4 py-2 rounded-xl hover:bg-gray-50 hover:shadow hover:-translate-y-0.5 transition-all duration-200 flex items-center font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                <RefreshCw className={`h-4 w-4 mr-2 text-gray-500 ${refreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={handleCreateUser}
                className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-200/50 px-5 py-2 rounded-xl hover:shadow-lg hover:shadow-indigo-300/50 hover:-translate-y-0.5 transition-all duration-200 flex items-center font-medium"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create User
              </button>
            </div>
          </div>
        </div>

        {/* Users List Container */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200">
          <div className="p-6 border-b border-gray-100">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
              <div className="flex-1 relative group">
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 text-sm outline-none"
                />
                <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors duration-200" />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="mt-4 sm:mt-0 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 text-sm font-medium text-gray-700 outline-none min-w-[160px]"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredUsers.map((userItem) => (
                  <tr key={userItem._id} className="hover:bg-gray-50/80 transition-colors duration-150 group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="shrink-0 h-10 w-10">
                          {userItem.profileImage ? (
                            <Image
                              className="h-10 w-10 rounded-full object-cover"
                              src={userItem.profileImage}
                              alt={`${userItem.firstName} ${userItem.lastName}`}
                              width={40}
                              height={40}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-indigo-600">
                                {userItem.firstName?.charAt(0)}{userItem.lastName?.charAt(0)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {userItem.firstName} {userItem.lastName}
                          </div>
                          <div className="text-sm text-gray-500">
                            Joined: {new Date(userItem.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{userItem.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${userItem.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                        userItem.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                        {userItem.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${userItem.status === 'active' ? 'bg-green-100 text-green-800' :
                        userItem.status === 'inactive' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                        {userItem.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                          onClick={() => handleEditUser(userItem)}
                          className="p-1.5 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 hover:text-indigo-900 transition-all duration-200"
                          title="Edit user"
                        >
                          <Edit className="h-4 w-4" />
                        </button>

                        {userItem.status !== 'archived' && (
                          <button
                            onClick={() => handleArchiveUser(userItem._id)}
                            className="p-1.5 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 hover:text-red-900 transition-all duration-200"
                            title="Archive user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit User Modal */}
        {showEditModal && selectedUser && (
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300">
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 max-w-lg w-full max-h-[85vh] overflow-y-auto overflow-x-hidden transform transition-all translate-y-8">
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
                    {isEditMode && selectedUser._id ? 'Edit User' : 'Create User'}
                  </h2>
                  <button
                    onClick={handleModalClose}
                    className="p-1.5 text-gray-400 bg-gray-50 rounded-full hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    ×
                  </button>
                </div>

                {/* User Form */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">First Name</label>
                      <input
                        type="text"
                        value={selectedUser.firstName}
                        onChange={(e) => setSelectedUser(prev => prev ? { ...prev, firstName: e.target.value } : null)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={selectedUser.lastName}
                        onChange={(e) => setSelectedUser(prev => prev ? { ...prev, lastName: e.target.value } : null)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={selectedUser.email}
                        onChange={(e) => setSelectedUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={selectedUser.phone || ''}
                        onChange={(e) => setSelectedUser(prev => prev ? { ...prev, phone: e.target.value } : null)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Password {!selectedUser._id && <span className="text-red-500">*</span>}
                      </label>
                      <div className="flex space-x-2">
                        <div className="flex-1 relative group">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={selectedUser.password || ''}
                            onChange={(e) => setSelectedUser(prev => prev ? { ...prev, password: e.target.value } : null)}
                            placeholder={selectedUser._id ? "Leave empty to keep current password" : "Enter password"}
                            className="w-full px-3 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors duration-200"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {!selectedUser._id && (
                          <button
                            type="button"
                            onClick={() => {
                              const generatedPassword = Math.random().toString(36).slice(-8);
                              setSelectedUser(prev => prev ? { ...prev, password: generatedPassword } : null);
                            }}
                            className="px-3 py-2 bg-gray-100/80 text-gray-700 rounded-xl hover:bg-gray-200 font-medium text-xs transition-colors duration-200 whitespace-nowrap"
                          >
                            Generate
                          </button>
                        )}
                      </div>
                      {!selectedUser._id && (
                        <p className="text-xs text-indigo-500/80 mt-1 font-medium select-none animate-pulse">Min 6 chars</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Role</label>
                      <select
                        value={selectedUser.role}
                        onChange={(e) => setSelectedUser(prev => prev ? { ...prev, role: e.target.value as 'admin' | 'manager' | 'staff' } : null)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 font-medium text-gray-700 outline-none text-sm"
                      >
                        <option value="staff">Staff</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                      <select
                        value={selectedUser.status}
                        onChange={(e) => setSelectedUser(prev => prev ? { ...prev, status: e.target.value as 'active' | 'inactive' | 'archived' } : null)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 font-medium text-gray-700 outline-none text-sm"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="flex justify-end space-x-3 mt-5 pt-3 border-t border-gray-100">
                  <button
                    onClick={handleModalClose}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 hover:shadow-sm transition-all duration-200 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleModalSave}
                    className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl shadow-md shadow-indigo-200/50 hover:shadow-lg hover:shadow-indigo-300/50 hover:-translate-y-0.5 transition-all duration-200 flex items-center font-medium text-sm"
                  >
                    <Save className="h-4 w-4 mr-1.5" />
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
