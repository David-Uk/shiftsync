'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Calendar, Clock, Edit, Globe, Plus, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Schedule {
  _id: string;
  staff: {
    firstName: string;
    lastName: string;
    email: string;
  };
  startTime: string;
  endTime: string;
  workDays: string[];
  isOneOff: boolean;
  oneOffDate?: string;
  timezone: string;
  notes?: string;
  isPublished: boolean;
  createdAt: string;
}

export default function SchedulePage() {
  const { user, isAuthenticated } = useAuth();
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [timeGapError, setTimeGapError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
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
    notes: ''
  });
  const [staff, setStaff] = useState([]);

  // Helper function to check for scheduling conflicts
  const checkSchedulingConflicts = (selectedStaffId: string, isOneOff: boolean, workDays: string[], oneOffDate: string) => {
    // Get relevant schedules for the selected staff member
    const staffSchedules = schedules.filter(s => s.staff._id === selectedStaffId || s.staff === selectedStaffId);

    setConflictError(null);

    if (isOneOff && oneOffDate) {
      // Check if one-off date conflicts with recurring work days
      const dateObj = new Date(oneOffDate);
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getDay()];

      const conflictingSchedule = staffSchedules.find(schedule =>
        !schedule.isOneOff && schedule.workDays.includes(dayOfWeek)
      );

      if (conflictingSchedule) {
        setConflictError(`The date ${new Date(oneOffDate).toLocaleDateString()} falls on a ${dayOfWeek} which is already scheduled as a recurring work day.`);
      }
    } else if (!isOneOff && workDays.length > 0) {
      // Check for duplicate recurring work days
      const duplicateDays: string[] = [];

      for (const newDay of workDays) {
        for (const existingSchedule of staffSchedules) {
          if (!existingSchedule.isOneOff && existingSchedule.workDays.includes(newDay)) {
            if (!duplicateDays.includes(newDay)) {
              duplicateDays.push(newDay);
            }
          }
        }
      }

      if (duplicateDays.length > 0) {
        setConflictError(`The following days are already scheduled: ${duplicateDays.join(', ')}`);
      }
    }
  };

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

    fetchSchedules();
    fetchStaff();
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
      setConflictError(null);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setValidationError(null);
      setConflictError(null);
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
      notes: ''
    });
    setValidationError(null);
    setTimeGapError(null);
    setConflictError(null);
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
        if (formData.isOneOff) {
          const dateValid = !!formData.oneOffDate;
          if (!dateValid && showToast) {
            showError('Please select a date for the one-off schedule');
          }
          if (dateValid && conflictError) {
            if (showToast) {
              showError(conflictError);
            }
            return false;
          }
          return dateValid;
        } else {
          const workDaysValid = formData.workDays.length > 0;
          if (!workDaysValid && showToast) {
            showError('Please select at least one work day');
          }
          if (workDaysValid && conflictError) {
            if (showToast) {
              showError(conflictError);
            }
            return false;
          }
          return workDaysValid;
        }
      case 3:
        const timezoneValid = !!formData.timezone;
        if (!timezoneValid && showToast) {
          showError('Please select a timezone');
        }
        return timezoneValid;
      default:
        return false;
    }
  };

  const handleCreateSchedule = async () => {
    // Perform final validation across all steps
    if (!validateStep(1, true) || !validateStep(2, true) || !validateStep(3, true)) {
      return;
    }

    const staffId = user?.role === 'staff' ? (user._id || user.id) : formData.staff;

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

      // For one-off schedules, we use the specific date. For recurring, we use 1970-01-01 template
      const baseDate = formData.isOneOff ? formData.oneOffDate : '1970-01-01';

      const startDate = new Date(`${baseDate}T${startTime24}:00`);
      const endDate = new Date(`${baseDate}T${endTime24}:00`);

      const scheduleData = {
        staff: staffId,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        workDays: formData.isOneOff ? [] : formData.workDays,
        isOneOff: formData.isOneOff,
        oneOffDate: formData.isOneOff && formData.oneOffDate ? new Date(formData.oneOffDate).toISOString() : undefined,
        timezone: formData.timezone,
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
    console.log('Publishing schedule with ID:', scheduleId);
    console.log('Schedule ID type:', typeof scheduleId);
    console.log('Schedule ID length:', scheduleId.length);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        showError('Authentication token not found. Please log in again.');
        return;
      }

      const response = await fetch(`/api/schedules/${scheduleId}/publish`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('Publish response status:', response.status);
      const data = await response.json();
      console.log('Publish response data:', data);

      if (response.ok) {
        // Update the local state immediately for better UX
        setSchedules(prev =>
          prev.map(schedule =>
            schedule._id === scheduleId
              ? { ...schedule, isPublished: true }
              : schedule
          )
        );
        showSuccess('Schedule published successfully');
      } else {
        const errorMessage = data.message || data.error || 'Failed to publish schedule';
        console.error('Publish error:', errorMessage);
        showError(errorMessage);
      }
    } catch (error) {
      console.error('Error publishing schedule:', error);
      showError(error instanceof Error ? error.message : 'Failed to publish schedule');
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

            {(user?.role === 'staff' || user?.role === 'admin' || user?.role === 'manager') && (
              <button
                type="button"
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
          <div className="fixed inset-0 bg-gray-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300">
            <div className="bg-white rounded-[2rem] shadow-2xl border border-gray-100 max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col transform transition-all animate-in fade-in zoom-in duration-300">
              <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Create Schedule</h2>
                    <p className="text-gray-500 text-xs mt-1">Plan your next work shift.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="p-1.5 text-gray-400 bg-gray-50 rounded-full hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    ×
                  </button>
                </div>

                {/* Multi-Step Schedule Form */}
                <div className="space-y-6">
                  {/* Compact Step Progress */}
                  <div className="flex items-center space-x-1 mb-8">
                    {[1, 2, 3].map((step) => (
                      <div key={step} className={`h-1 flex-1 rounded-full transition-all duration-500 ${currentStep >= step ? 'bg-indigo-600' : 'bg-gray-100'}`} />
                    ))}
                  </div>

                  {/* Step 1: Basic Information */}
                  {currentStep === 1 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                      <div className="grid grid-cols-1 gap-5">
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
                              onChange={(e) => {
                                setFormData(prev => ({ ...prev, staff: e.target.value }));
                                setConflictError(null);
                              }}
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
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Time *</label>
                          <div className="flex space-x-2">
                            <input
                              type="time"
                              value={formData.startTime}
                              onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
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

                  {/* Step 2: Schedule Type & Days/Date */}
                  {currentStep === 2 && (
                    <div className="space-y-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Schedule Type & Availability</h3>

                      <div className="flex space-x-4 mb-6">
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, isOneOff: false, oneOffDate: '' }));
                            setConflictError(null);
                          }}
                          className={`flex-1 p-4 rounded-xl border-2 transition-all duration-200 text-center ${!formData.isOneOff
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                            : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'}`}
                        >
                          <div className="font-bold mb-1">Recurring</div>
                          <div className="text-xs">Repeats weekly</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, isOneOff: true, workDays: [] }));
                            setConflictError(null);
                          }}
                          className={`flex-1 p-4 rounded-xl border-2 transition-all duration-200 text-center ${formData.isOneOff
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                            : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'}`}
                        >
                          <div className="font-bold mb-1">One-off</div>
                          <div className="text-xs">Single occurrence</div>
                        </button>
                      </div>

                      {!formData.isOneOff ? (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <label className="block text-sm font-semibold text-gray-700 mb-3">Select Work Days *</label>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                              <label key={day} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                                <input
                                  type="checkbox"
                                  checked={formData.workDays.includes(day)}
                                  onChange={(e) => {
                                    let newWorkDays;
                                    if (e.target.checked) {
                                      newWorkDays = [...formData.workDays, day];
                                    } else {
                                      newWorkDays = formData.workDays.filter(d => d !== day);
                                    }
                                    setFormData(prev => ({ ...prev, workDays: newWorkDays }));
                                    const staffId = user?.role === 'staff' ? (user._id || user.id) : formData.staff;
                                    checkSchedulingConflicts(staffId, false, newWorkDays, '');
                                  }}
                                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-gray-700 font-medium">{day}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Select Date *</label>
                          <input
                            type="date"
                            value={formData.oneOffDate}
                            onChange={(e) => {
                              setFormData(prev => ({ ...prev, oneOffDate: e.target.value }));
                              const staffId = user?.role === 'staff' ? (user._id || user.id) : formData.staff;
                              checkSchedulingConflicts(staffId, true, [], e.target.value);
                            }}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 outline-none text-sm"
                          />
                          <p className="mt-2 text-xs text-gray-500 italic">This schedule will only apply to the selected date.</p>
                        </div>
                      )}

                      {/* Conflict Error Message */}
                      {conflictError && currentStep === 2 && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                          <p className="text-sm text-red-600 flex items-center">
                            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            {conflictError}
                          </p>
                        </div>
                      )}
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
                            <option value="GMT-12">GMT-12 (International Date Line West)</option>
                            <option value="GMT-11">GMT-11 (Midway Island, Samoa)</option>
                            <option value="GMT-10">GMT-10 (Hawaii)</option>
                            <option value="GMT-9">GMT-9 (Alaska)</option>
                            <option value="GMT-8">GMT-8 (Pacific Time - US & Canada)</option>
                            <option value="GMT-7">GMT-7 (Mountain Time - US & Canada)</option>
                            <option value="GMT-6">GMT-6 (Central Time - US & Canada)</option>
                            <option value="GMT-5">GMT-5 (Eastern Time - US & Canada)</option>
                            <option value="GMT-4">GMT-4 (Atlantic Time - Canada, Caracas)</option>
                            <option value="GMT-3">GMT-3 (Buenos Aires, Greenland)</option>
                            <option value="GMT-2">GMT-2 (Mid-Atlantic)</option>
                            <option value="GMT-1">GMT-1 (Azores, Cape Verde Islands)</option>
                            <option value="GMT">GMT (Greenwich Mean Time, London, Lisbon)</option>
                            <option value="GMT+1">GMT+1 (Central European Time, Paris, Lagos)</option>
                            <option value="GMT+2">GMT+2 (Eastern European Time, Cairo, Johannesburg)</option>
                            <option value="GMT+3">GMT+3 (Moscow, Nairobi, Baghdad)</option>
                            <option value="GMT+4">GMT+4 (Abu Dhabi, Muscat, Tbilisi)</option>
                            <option value="GMT+5">GMT+5 (Islamabad, Karachi, Tashkent)</option>
                            <option value="GMT+6">GMT+6 (Almaty, Dhaka, Colombo)</option>
                            <option value="GMT+7">GMT+7 (Bangkok, Hanoi, Jakarta)</option>
                            <option value="GMT+8">GMT+8 (Beijing, Perth, Singapore, Hong Kong)</option>
                            <option value="GMT+9">GMT+9 (Tokyo, Seoul, Osaka)</option>
                            <option value="GMT+10">GMT+10 (Sydney, Guam, Port Moresby)</option>
                            <option value="GMT+11">GMT+11 (Magadan, Solomon Islands)</option>
                            <option value="GMT+12">GMT+12 (Auckland, Wellington, Fiji)</option>
                            <option value="GMT+13">GMT+13 (Nuku&apos;alofa)</option>
                            <option value="GMT+14">GMT+14 (Kiritimati)</option>
                          </select>
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
                </div>
              </div>

              {/* Modal Actions */}
              <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
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
                        (currentStep === 2 && (formData.isOneOff ? !formData.oneOffDate : formData.workDays.length === 0))
                      }
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCreateSchedule}
                      disabled={formLoading || !formData.timezone}
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
              {schedules.map((schedule: Schedule) => (
                <div
                  key={schedule._id}
                  className="p-6 border-b border-gray-200 last:border-b-0 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex flex-col mb-2">
                        <div className="flex items-center text-sm font-semibold text-gray-900">
                          {schedule.isOneOff ? (
                            <div className="flex items-center text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                              <Calendar className="h-4 w-4 mr-2" />
                              One-off: {new Date(schedule.startTime).toLocaleDateString()}
                            </div>
                          ) : (
                            <div className="flex items-center text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                              <Users className="h-4 w-4 mr-2" />
                              Recurring: {schedule.workDays.join(', ')}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center mt-3 gap-y-2 text-sm text-gray-500">
                          <div className="flex items-center mr-4">
                            <Clock className="h-4 w-4 mr-1.5 text-gray-400" />
                            {new Date(schedule.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(schedule.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="flex items-center mr-4">
                            <Globe className="h-4 w-4 mr-1.5 text-gray-400" />
                            {schedule.timezone}
                          </div>
                        </div>

                        {(user?.role === 'admin' || user?.role === 'manager') && schedule.staff && (
                          <div className="mt-2 text-xs text-gray-400">
                            Assigned to: {schedule.staff.firstName} {schedule.staff.lastName}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 mt-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${schedule.isPublished
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                          }`}>
                          {schedule.isPublished ? 'Published' : 'Draft'}
                        </span>
                        <span className="text-xs text-gray-400">
                          Created: {new Date(schedule.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      {!schedule.isPublished && (user?.role === 'staff' || user?.role === 'manager' || user?.role === 'admin') && (
                        <button
                          onClick={() => handlePublishSchedule(schedule._id)}
                          className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 text-sm"
                        >
                          Publish
                        </button>
                      )}
                      {user?.role === 'staff' && (
                        <>
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
