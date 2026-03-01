'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AlertCircle, Clock, Loader, MapPin, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface Location {
    _id: string;
    address: string;
    city: string;
    timezone: string;
}

interface AvailableStaff {
    _id: string;
    user: {
        firstName: string;
        lastName: string;
    };
    designation: string;
}

interface ShiftScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function ShiftScheduleModal({
    isOpen,
    onClose,
    onSuccess
}: ShiftScheduleModalProps) {
    const { user, token } = useAuth();
    const { showError, showSuccess } = useToast();
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState<Location[]>([]);
    const [locationsLoading, setLocationsLoading] = useState(false);
    const [availableStaff, setAvailableStaff] = useState<AvailableStaff[]>([]);
    const [availableStaffLoading, setAvailableStaffLoading] = useState(false);
    const [staffAvailabilityCount, setStaffAvailabilityCount] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        location: '',
        title: '',
        description: '',
        designation: '',
        startTime: '',
        startAmPm: 'AM' as 'AM' | 'PM',
        endTime: '',
        endAmPm: 'PM' as 'AM' | 'PM',
        workDays: [] as string[],
        timezone: 'UTC',
        requiredSkills: [] as string[],
        headcount: 1,
        assignedStaff: [] as string[]
    });

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const designations = ['bartender', 'line cook', 'host', 'waiter', 'security', 'janitor', 'accountant'];

    // Helper function to convert 12-hour format to 24-hour format
    const convertTo24Hour = (time: string, period: 'AM' | 'PM'): string => {
        if (!time) return '';
        let hour = parseInt(time);

        if (period === 'PM' && hour !== 12) hour += 12;
        if (period === 'AM' && hour === 12) hour = 0;

        return `${String(hour).padStart(2, '0')}:00`;
    };
    // Fetch manager's locations
    const fetchLocations = useCallback(async () => {
        setLocationsLoading(true);
        try {
            const response = await fetch('/api/locations', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Failed to fetch locations');
            const data = await response.json();
            setLocations(data.data || []);
            if (data.data && data.data.length > 0) {
                setFormData(prev => ({
                    ...prev,
                    location: data.data[0]._id,
                    timezone: data.data[0].timezone
                }));
            }
        } catch (err) {
            console.error('Error fetching locations:', err);
            setError('Failed to load locations');
        } finally {
            setLocationsLoading(false);
        }
    }, [token]);

    const fetchAvailableStaff = useCallback(async () => {
        setAvailableStaffLoading(true);
        try {
            const startTime24 = convertTo24Hour(formData.startTime, formData.startAmPm);
            const endTime24 = convertTo24Hour(formData.endTime, formData.endAmPm);

            const params = new URLSearchParams({
                location: formData.location,
                startTime: startTime24,
                endTime: endTime24,
                workDays: formData.workDays.join(',')
            });

            const response = await fetch(`/api/staff/available?${params}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Failed to fetch available staff');
            const data = await response.json();
            setAvailableStaff(data.data || []);
            setStaffAvailabilityCount(data.data?.length || 0);
        } catch (err) {
            console.error('Error fetching available staff:', err);
            setError('Failed to load available staff');
        } finally {
            setAvailableStaffLoading(false);
        }
    }, [token, formData.location, formData.startTime, formData.startAmPm, formData.endTime, formData.endAmPm, formData.workDays]);

    // Fetch manager's locations
    useEffect(() => {
        if (isOpen && user?.role === 'manager') {
            fetchLocations();
        }
    }, [isOpen, user?.role, fetchLocations]);

    // Fetch available staff when location, time, or work days change
    useEffect(() => {
        if (
            currentStep >= 2 &&
            formData.location &&
            formData.startTime &&
            formData.endTime &&
            formData.workDays.length > 0
        ) {
            fetchAvailableStaff();
        }
    }, [currentStep, formData.location, formData.startTime, formData.endTime, formData.workDays, fetchAvailableStaff]);

    const handleLocationChange = (locationId: string) => {
        const selected = locations.find(l => l._id === locationId);
        setFormData(prev => ({
            ...prev,
            location: locationId,
            timezone: selected?.timezone || 'UTC'
        }));
    };

    const handleWorkDayToggle = (day: string) => {
        setFormData(prev => ({
            ...prev,
            workDays: prev.workDays.includes(day)
                ? prev.workDays.filter(d => d !== day)
                : [...prev.workDays, day]
        }));
    };

    const handleStaffToggle = (staffId: string) => {
        setFormData(prev => ({
            ...prev,
            assignedStaff: prev.assignedStaff.includes(staffId)
                ? prev.assignedStaff.filter(s => s !== staffId)
                : [...prev.assignedStaff, staffId]
        }));
    };

    const validateStep = (): boolean => {
        setError(null);

        if (currentStep === 1) {
            if (!formData.location) {
                setError('Please select a location');
                return false;
            }
            if (!formData.title.trim()) {
                setError('Please enter a shift title');
                return false;
            }
            if (!formData.designation) {
                setError('Please select a designation');
                return false;
            }
        }

        if (currentStep === 2) {
            if (!formData.startTime || !formData.endTime) {
                setError('Please enter start and end times');
                return false;
            }

            const startHour24 = convertTo24Hour(formData.startTime, formData.startAmPm);
            const endHour24 = convertTo24Hour(formData.endTime, formData.endAmPm);

            if (startHour24 >= endHour24) {
                setError('End time must be after start time');
                return false;
            }

            if (formData.workDays.length === 0) {
                setError('Please select at least one work day');
                return false;
            }

            if (!formData.headcount || formData.headcount < 1) {
                setError('Please enter a valid headcount');
                return false;
            }
        }

        if (currentStep === 3) {
            if (formData.assignedStaff.length === 0) {
                setError('Please select at least one staff member');
                return false;
            }
        }

        return true;
    };

    const handleNextStep = () => {
        if (validateStep()) {
            setCurrentStep(prev => Math.min(prev + 1, 3));
        }
    };

    const handlePrevStep = () => {
        setCurrentStep(prev => Math.max(prev - 1, 1));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateStep()) return;

        setLoading(true);
        try {
            const shiftData = {
                location: formData.location,
                title: formData.title,
                description: formData.description,
                designation: formData.designation,
                startTime: convertTo24Hour(formData.startTime, formData.startAmPm),
                endTime: convertTo24Hour(formData.endTime, formData.endAmPm),
                workDays: formData.workDays,
                timezone: formData.timezone,
                requiredSkills: formData.requiredSkills,
                headcount: formData.headcount,
                assignedStaff: formData.assignedStaff
            };

            const response = await fetch('/api/shift-schedules', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(shiftData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create shift');
            }

            showSuccess('Shift created successfully!');
            setFormData({
                location: '',
                title: '',
                description: '',
                designation: '',
                startTime: '',
                startAmPm: 'AM',
                endTime: '',
                endAmPm: 'PM',
                workDays: [],
                timezone: 'UTC',
                requiredSkills: [],
                headcount: 1,
                assignedStaff: []
            });
            setCurrentStep(1);
            onClose();
            onSuccess?.();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create shift';
            showError(message);
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-950/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 transition-all duration-300">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col transform transition-all animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-transparent">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Create Shift</h2>
                        <p className="text-sm text-gray-500 mt-1">Assign staff to a new shift for your location</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Progress Steps */}
                <div className="px-6 pt-6 pb-4">
                    <div className="flex items-center justify-between mb-4">
                        {[1, 2, 3].map((step) => (
                            <div key={step} className="flex items-center flex-1">
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${currentStep >= step
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-gray-100 text-gray-400'
                                        }`}
                                >
                                    {step}
                                </div>
                                {step < 3 && (
                                    <div
                                        className={`flex-1 h-1 mx-2 transition-all ${currentStep > step ? 'bg-indigo-600' : 'bg-gray-100'
                                            }`}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between text-xs font-medium text-gray-600">
                        <span>Basics</span>
                        <span>Schedule</span>
                        <span>Staff</span>
                    </div>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                    {error && (
                        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-red-700">{error}</span>
                        </div>
                    )}

                    {/* Step 1: Basics */}
                    {currentStep === 1 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            {/* Location */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-indigo-600" />
                                    Location *
                                </label>
                                {locationsLoading ? (
                                    <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg">
                                        <Loader className="h-5 w-5 animate-spin text-indigo-600" />
                                    </div>
                                ) : (
                                    <select
                                        value={formData.location}
                                        onChange={(e) => handleLocationChange(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent background-white"
                                    >
                                        <option value="">Select a location</option>
                                        {locations.map(loc => (
                                            <option key={loc._id} value={loc._id}>
                                                {loc.address} ({loc.city})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Shift Title */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Shift Title *
                                </label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="e.g., Morning Shift, Evening Support"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            {/* Designation */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Required Designation *
                                </label>
                                <select
                                    value={formData.designation}
                                    onChange={(e) => setFormData(prev => ({ ...prev, designation: e.target.value }))}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                >
                                    <option value="">Select a designation</option>
                                    {designations.map(des => (
                                        <option key={des} value={des}>{des}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Description (Optional)
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Add any additional notes or requirements..."
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                                    rows={3}
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 2: Schedule */}
                    {currentStep === 2 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            {/* Time Slots */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-indigo-600" />
                                        Start Time *
                                    </label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <input
                                                type="number"
                                                min="1"
                                                max="12"
                                                placeholder="HH"
                                                value={formData.startTime}
                                                onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                        </div>
                                        <select
                                            value={formData.startAmPm}
                                            onChange={(e) => setFormData(prev => ({ ...prev, startAmPm: e.target.value as 'AM' | 'PM' }))}
                                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        >
                                            <option value="AM">AM</option>
                                            <option value="PM">PM</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-indigo-600" />
                                        End Time *
                                    </label>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <input
                                                type="number"
                                                min="1"
                                                max="12"
                                                placeholder="HH"
                                                value={formData.endTime}
                                                onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                        </div>
                                        <select
                                            value={formData.endAmPm}
                                            onChange={(e) => setFormData(prev => ({ ...prev, endAmPm: e.target.value as 'AM' | 'PM' }))}
                                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        >
                                            <option value="AM">AM</option>
                                            <option value="PM">PM</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Work Days */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-3">
                                    Work Days *
                                </label>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {days.map(day => (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() => handleWorkDayToggle(day)}
                                            className={`px-3 py-2 rounded-lg font-medium text-sm transition-all text-center ${formData.workDays.includes(day)
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                        >
                                            {day.slice(0, 3)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Headcount */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                    <Users className="h-4 w-4 text-indigo-600" />
                                    Required Headcount *
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={formData.headcount}
                                    onChange={(e) => setFormData(prev => ({ ...prev, headcount: parseInt(e.target.value) || 1 }))}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                />
                            </div>

                            {/* Staff Availability Info */}
                            {availableStaffLoading && (
                                <div className="flex items-center justify-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                                    <Loader className="h-4 w-4 mr-2 animate-spin text-blue-600" />
                                    <span className="text-sm text-blue-700">Checking staff availability...</span>
                                </div>
                            )}
                            {!availableStaffLoading && staffAvailabilityCount > 0 && (
                                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                                    <p className="text-sm text-green-700 font-medium">
                                        ✓ {staffAvailabilityCount} staff member{staffAvailabilityCount !== 1 ? 's' : ''} available for this shift
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Staff Selection */}
                    {currentStep === 3 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                    <Users className="h-4 w-4 text-indigo-600" />
                                    Select Staff Members *
                                </label>
                                {availableStaffLoading ? (
                                    <div className="flex items-center justify-center p-8">
                                        <Loader className="h-5 w-5 animate-spin text-indigo-600" />
                                    </div>
                                ) : availableStaff.length === 0 ? (
                                    <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                                        <p className="text-sm text-amber-700">No staff available for the selected schedule. Please adjust your time slots or work days.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {availableStaff.map(staff => (
                                            <label
                                                key={staff._id}
                                                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-indigo-50 cursor-pointer transition-colors"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={formData.assignedStaff.includes(staff._id)}
                                                    onChange={() => handleStaffToggle(staff._id)}
                                                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <div className="flex-1">
                                                    <p className="font-medium text-gray-900">
                                                        {staff.user.firstName} {staff.user.lastName}
                                                    </p>
                                                    <p className="text-xs text-gray-600">{staff.designation}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Selected Count */}
                            {formData.assignedStaff.length > 0 && (
                                <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                                    <p className="text-sm text-indigo-700 font-medium">
                                        Selected: {formData.assignedStaff.length} / {formData.headcount} staff
                                        {formData.assignedStaff.length < formData.headcount && (
                                            <span className="text-amber-600"> (More needed)</span>
                                        )}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </form>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-100 bg-gray-50">
                    <button
                        type="button"
                        onClick={handlePrevStep}
                        disabled={currentStep === 1 || loading}
                        className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                        Back
                    </button>
                    {currentStep < 3 ? (
                        <button
                            type="button"
                            onClick={handleNextStep}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                        >
                            Next
                        </button>
                    ) : (
                        <button
                            type="submit"
                            onClick={handleSubmit}
                            disabled={loading}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
                        >
                            {loading && <Loader className="h-4 w-4 animate-spin" />}
                            Create Shift
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
