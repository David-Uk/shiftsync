'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Calendar, Users, Plus, Edit, MapPin, Trash2 } from 'lucide-react';

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
  const { showError } = useToast();
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [timeGapError, setTimeGapError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    staff: '',
    startTime: '',
    startAmPm: 'AM',
    endTime: '',
    endAmPm: 'AM',
    workDays: [] as string[],
    isOneOff: false,
    oneOffDate: '',
    timezone: 'UTC',
    location: '',
    notes: ''
  });
  const [staff, setStaff] = useState([]);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    const fetchSchedules = async () => {
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams();

        // Add role-based filtering
        if (user?.role === 'staff') {
          params.append('staffId', user._id || user.id);
        }
        // Managers and admins see all schedules

        const response = await fetch(`/api/schedules?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSchedules(data.schedules || []);
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to fetch schedules');
        }
      } catch (error) {
        console.error('Error fetching schedules:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchStaff = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/users?role=staff&limit=100', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setStaff(data.users || []);
        }
      } catch (error) {
        console.error('Error fetching staff:', error);
      }
    };

    const fetchLocations = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/locations', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setLocations(data.data || []);
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
      }
    };

    fetchSchedules();
    fetchStaff();
    fetchLocations();
  }, [isAuthenticated, router, user?.role, user?._id, user?.id]);

  // Real-time time gap validation
  useEffect(() => {
    if (currentStep === 1 && formData.startTime && formData.endTime) {
      const convertToMinutes = (time: string, amPm: string) => {
        if (!time) return 0;
        const [hours, minutes] = time.split(':');
        let hour24 = parseInt(hours);

        if (amPm === 'PM' && hour24 !== 12) {
          hour24 += 12;
        } else if (amPm === 'AM' && hour24 === 12) {
          hour24 = 0;
        }

        return hour24 * 60 + parseInt(minutes);
      };

      const startMinutes = convertToMinutes(formData.startTime, formData.startAmPm);
      const endMinutes = convertToMinutes(formData.endTime, formData.endAmPm);

      // Calculate gap from end of shift to start of next shift (rest time)
      let gap: number;
      if (endMinutes > startMinutes) {
        // Same day shift (e.g., 7 AM to 11 PM) - gap to next day's start (11 PM to 7 AM)
        gap = (24 * 60 - endMinutes) + startMinutes; 
      } else {
        // Overnight shift (e.g., 10 PM to 6 AM) - gap is from end to next day's start (6 AM to 10 PM)
        gap = startMinutes - endMinutes; 
      }

      if (gap < 10 * 60) { // 10 hours in minutes
        setTimeGapError('Rest time between shifts must be at least 10 hours. Your current gap is ' + Math.floor(gap / 60) + ' hours.');
      } else {
        setTimeGapError(null);
      }
    } else {
      setTimeGapError(null);
    }
  }, [formData.startTime, formData.endTime, formData.startAmPm, formData.endAmPm, currentStep]);

  // Multi-step form navigation
  const nextStep = () => {
    if (validateStep(currentStep, true)) {
      setCurrentStep(currentStep + 1);
      setValidationError(null);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setValidationError(null);
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setFormData({
      staff: '',
      startTime: '',
      startAmPm: 'AM',
      endTime: '',
      endAmPm: 'AM',
      workDays: [] as string[],
      isOneOff: false,
      oneOffDate: '',
      timezone: 'UTC',
      location: '',
      notes: ''
    });
    setValidationError(null);
    setTimeGapError(null);
    setShowCreateForm(false);
  };

  const validateStep = (step: number, showToast = false) => {
    switch (step) {
      case 1:
        const staffValid = user?.role === 'staff' || formData.staff;
        const timeValid = formData.startTime && formData.endTime;

        if (!staffValid || !timeValid) {
          if (showToast) {
            showError('Please fill in all required fields');
          }
          return false;
        }

        // Check 10-hour gap requirement
        const convertToMinutes = (time: string, amPm: string) => {
          if (!time) return 0;
          const [hours, minutes] = time.split(':');
          let hour24 = parseInt(hours);

          if (amPm === 'PM' && hour24 !== 12) {
            hour24 += 12;
          } else if (amPm === 'AM' && hour24 === 12) {
            hour24 = 0;
          }

          return hour24 * 60 + parseInt(minutes);
        };

        const startMinutes = convertToMinutes(formData.startTime, formData.startAmPm);
        const endMinutes = convertToMinutes(formData.endTime, formData.endAmPm);

        // Calculate gap from end of shift to start of next shift (rest time)
        let gap: number;
        if (endMinutes > startMinutes) {
          // Same day shift (e.g., 7 AM to 11 PM) - gap to next day's start (11 PM to 7 AM)
          gap = (24 * 60 - endMinutes) + startMinutes;
        } else {
          // Overnight shift (e.g., 10 PM to 6 AM) - gap is from end to next day's start (6 AM to 10 PM)
          gap = startMinutes - endMinutes;
        }

        if (gap < 10 * 60) { // 10 hours in minutes
          const errorMsg = 'Rest time between shifts must be at least 10 hours. Your current gap is ' + Math.floor(gap / 60) + ' hours.';
          setValidationError(errorMsg);
          if (showToast) {
            showError(errorMsg);
          }
          return false;
        }

        setValidationError(null);
        return true;
      case 2:
        const workDaysValid = formData.workDays.length > 0;
        if (!workDaysValid && showToast) {
          showError('Please select at least one work day');
        }
        return workDaysValid;
      case 3:
        return true; // Final step - all fields are optional
      default:
        return false;
    }
  };

  const handleCreateSchedule = async () => {
    const staffId = user?.role === 'staff' ? (user._id || user.id) : formData.staff;

    if (!staffId || !formData.startTime || !formData.endTime || formData.workDays.length === 0) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setFormLoading(true);
      const token = localStorage.getItem('token');

      // Convert times to Date objects with AM/PM handling
      const convertTo24Hour = (time: string, amPm: string) => {
        if (!time) return '';
        const [hours, minutes] = time.split(':');
        let hour24 = parseInt(hours);

        if (amPm === 'PM' && hour24 !== 12) {
          hour24 += 12;
        } else if (amPm === 'AM' && hour24 === 12) {
          hour24 = 0;
        }

        return `${hour24.toString().padStart(2, '0')}:${minutes}`;
      };

      const startTime24 = convertTo24Hour(formData.startTime, formData.startAmPm);
      const endTime24 = convertTo24Hour(formData.endTime, formData.endAmPm);

      const startDate = new Date(`1970-01-01T${startTime24}:00`);
      const endDate = new Date(`1970-01-01T${endTime24}:00`);

      const scheduleData = {
        staff: staffId,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        workDays: formData.workDays,
        isOneOff: formData.isOneOff,
        oneOffDate: formData.isOneOff && formData.oneOffDate ? new Date(formData.oneOffDate).toISOString() : undefined,
        timezone: formData.timezone,
        location: formData.location || undefined,
        notes: formData.notes || undefined
      };

      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scheduleData),
      });

      if (response.ok) {
        const data = await response.json();
        setSchedules(prev => [data.schedule, ...prev]);
        setShowCreateForm(false);
        setFormData({
          staff: '',
          startTime: '',
          startAmPm: 'AM',
          endTime: '',
          endAmPm: 'AM',
          workDays: [],
          isOneOff: false,
          oneOffDate: '',
          timezone: 'UTC',
          location: '',
          notes: ''
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create schedule');
      }
    } catch (error) {
      console.error('Error creating schedule:', error);
      alert(error instanceof Error ? error.message : 'Failed to create schedule');
    } finally {
      setFormLoading(false);
    }
  };

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



  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {user?.role === 'staff' ? 'My Schedule' : 'Schedule Management'}
              </h1>
              <p className="text-gray-600 mt-1">
                {user?.role === 'staff'
                  ? 'Create and manage your work schedule'
                  : 'View work schedules for all staff'
                }
              </p>
            </div>

            {user?.role === 'staff' && (
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
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300">
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 max-w-2xl w-full max-h-[85vh] overflow-y-auto overflow-x-hidden transform transition-all translate-y-8">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-100">
                  <h2 className="text-xl font-semibold text-gray-900">Create New Schedule</h2>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="p-1.5 text-gray-400 bg-gray-50 rounded-full hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    ×
                  </button>
                </div>

                {/* Multi-Step Schedule Form */}
                <form onSubmit={(e) => { e.preventDefault(); if (currentStep === 3) handleCreateSchedule(); }} className="space-y-6">
                  {/* Step Progress */}
                  <div className="flex items-center justify-between mb-8">
                    {[1, 2, 3].map((step) => (
                      <div key={step} className="flex items-center">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${currentStep >= step
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-200 text-gray-600'
                            }`}
                        >
                          {step}
                        </div>
                        {step < 3 && (
                          <div
                            className={`w-full h-1 mx-2 transition-colors ${currentStep > step ? 'bg-indigo-600' : 'bg-gray-200'
                              }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Step 1: Basic Information */}
                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Staff Member *</label>
                          {user?.role === 'staff' ? (
                            <input
                              type="text"
                              value={`${user.firstName} ${user.lastName}`}
                              readOnly
                              className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-xl text-gray-600 cursor-not-allowed outline-none text-sm"
                            />
                          ) : (
                            <select
                              value={formData.staff}
                              onChange={(e) => setFormData(prev => ({ ...prev, staff: e.target.value }))}
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                              required
                            >
                              <option value="">Select staff member</option>
                              {staff.map((staffMember: { _id: string, firstName: string, lastName: string }) => (
                                <option key={staffMember._id} value={staffMember._id}>
                                  {staffMember.firstName} {staffMember.lastName}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {user?.role !== 'staff' && (
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Location</label>
                            <select
                              value={formData.location}
                              onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                            >
                              <option value="">Select location (optional)</option>
                              {locations.map((location: { _id: string, address: string, city: string }) => (
                                <option key={location._id} value={location._id}>
                                  {location.address}, {location.city}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Time *</label>
                          <div className="flex space-x-2">
                            <input
                              type="time"
                              value={formData.startTime}
                              onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                              required
                            />
                            <select
                              value={formData.startAmPm}
                              onChange={(e) => setFormData(prev => ({ ...prev, startAmPm: e.target.value }))}
                              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                            >
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Time *</label>
                          <div className="flex space-x-2">
                            <input
                              type="time"
                              value={formData.endTime}
                              onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                              required
                            />
                            <select
                              value={formData.endAmPm}
                              onChange={(e) => setFormData(prev => ({ ...prev, endAmPm: e.target.value }))}
                              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                            >
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Time Gap Error Message */}
                      {timeGapError && currentStep === 1 && (
                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                          <p className="text-sm text-yellow-600 flex items-center">
                            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 2.722s-2.159-.896-2.722-1.36C6.712 1.9 5.35 1.9 3.1s3.412.912 3.1 2.722c0 1.81.891 3.418 2.722 3.418a.75.75 0 01.1.497-.018c.467.073.875.141 1.249.141.873-.002 1.809-.082 2.722-.16l-1.674-.331v1.04c0-.815.391-1.541 1.027-1.541-1.527 0-1.491.335-2.768 1.027-2.768.815 0 1.491.335 2.768 1.027 2.768zm0 9.757c0 .924.383 1.727 1.027 1.727-.645 0-1.191-.337-1.527-1.027-.336.735-.824 1.027-1.527.824 0 1.191.337 1.527 1.027 1.527z" clipRule="evenodd" />
                            </svg>
                            {timeGapError}
                          </p>
                        </div>
                      )}

                      {/* Validation Error Message */}
                      {validationError && currentStep === 1 && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                          <p className="text-sm text-red-600 flex items-center">
                            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            {validationError}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 2: Work Days */}
                  {currentStep === 2 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Work Days</h3>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">Select Work Days *</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                            <label key={day} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={formData.workDays.includes(day)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData(prev => ({ ...prev, workDays: [...prev.workDays, day] }));
                                  } else {
                                    setFormData(prev => ({ ...prev, workDays: prev.workDays.filter(d => d !== day) }));
                                  }
                                }}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-gray-700 font-medium">{day}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Additional Details */}
                  {currentStep === 3 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Timezone</label>
                          <select
                            value={formData.timezone}
                            onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                          >
                            <option value="UTC">🌍 UTC (Coordinated Universal Time)</option>
                            <option value="GMT">🇬🇧 GMT (Greenwich Mean Time)</option>
                            <option value="EST">🇺🇸 EST (Eastern Standard Time)</option>
                            <option value="EDT">🇺🇸 EDT (Eastern Daylight Time)</option>
                            <option value="CST">🇺🇸 CST (Central Standard Time)</option>
                            <option value="CDT">🇺🇸 CDT (Central Daylight Time)</option>
                            <option value="MST">🇺🇸 MST (Mountain Standard Time)</option>
                            <option value="MDT">🇺🇸 MDT (Mountain Daylight Time)</option>
                            <option value="PST">🇺🇸 PST (Pacific Standard Time)</option>
                            <option value="PDT">🇺🇸 PDT (Pacific Daylight Time)</option>
                            <option value="CET">🇪🇺 CET (Central European Time)</option>
                            <option value="CEST">🇪🇺 CEST (Central European Summer Time)</option>
                            <option value="IST">🇮🇳 IST (India Standard Time)</option>
                            <option value="JST">🇯🇵 JST (Japan Standard Time)</option>
                            <option value="AEST">🇦🇺 AEST (Australian Eastern Standard Time)</option>
                            <option value="AEDT">🇦🇺 AEDT (Australian Eastern Daylight Time)</option>
                            <option value="HST">🇺🇸 HST (Hawaii Standard Time)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                            <input
                              type="checkbox"
                              checked={formData.isOneOff}
                              onChange={(e) => setFormData(prev => ({ ...prev, isOneOff: e.target.checked }))}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mr-2"
                            />
                            One-off Schedule
                          </label>
                          {formData.isOneOff && (
                            <input
                              type="date"
                              value={formData.oneOffDate}
                              onChange={(e) => setFormData(prev => ({ ...prev, oneOffDate: e.target.value }))}
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm mt-2"
                              required
                            />
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes</label>
                        <textarea
                          value={formData.notes}
                          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                          rows={3}
                          placeholder="Optional notes about this schedule..."
                        />
                      </div>
                    </div>
                  )}

                  {/* Modal Actions */}
                  <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors text-sm"
                    >
                      Cancel
                    </button>
                    <div className="flex space-x-3">
                      {currentStep > 1 && (
                        <button
                          type="button"
                          onClick={prevStep}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-medium transition-colors text-sm"
                        >
                          Previous
                        </button>
                      )}
                      {currentStep < 3 ? (
                        <button
                          type="button"
                          onClick={nextStep}
                          disabled={
                            (currentStep === 1 && (!(user?.role === 'staff' || formData.staff) || !formData.startTime || !formData.endTime || !!timeGapError)) ||
                            (currentStep === 2 && formData.workDays.length === 0)
                          }
                          className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={formLoading}
                          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl shadow-md shadow-indigo-200/50 hover:shadow-lg hover:shadow-indigo-300/50 hover:-translate-y-0.5 transition-all duration-200 flex items-center font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                          {formLoading ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Creating...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-1.5" />
                              Create Schedule
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              </div>
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
                      {user?.role === 'staff' && (
                        <>
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
                            title="Edit Schedule"
                          >
                            <Edit className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteSchedule(schedule._id)}
                            className="bg-red-600 text-white px-3 py-1 rounded-md hover:bg-red-700 text-sm"
                            title="Delete Schedule"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
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
