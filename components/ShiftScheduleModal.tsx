'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AlertCircle, Calendar, Check, Clock, MapPin, Plus, Trash2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface Location {
    _id: string;
    city: string;
    address: string;
    timezone: string;
}

interface AvailableStaff {
    _id: string;
    user: {
        firstName: string;
        lastName: string;
    };
    designation: string;
    status?: "available" | "conflict" | "schedule_mismatch";
    reason?: string;
    conflictingAssignments?: Array<{
        locationName: string;
        startTime: string;
        endTime: string;
        workDays: string[];
    }>;
}

interface ShiftSlot {
    id: string;
    designation: string;
    startTime: string;
    startAmPm: 'AM' | 'PM';
    endTime: string;
    endAmPm: 'AM' | 'PM';
    workDays: string[];
    headcount: number;
    assignedStaff: string[];
    availableStaff: AvailableStaff[];
    unavailableStaff: AvailableStaff[];
    loadingAvailability: boolean;
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
    const [error, setError] = useState<string | null>(null);
    const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

    const [groupData, setGroupData] = useState({
        location: '',
        title: '',
        description: '',
        timezone: 'UTC',
        startDate: new Date().toISOString().split('T')[0],
        endDate: ''
    });

    const [slots, setSlots] = useState<ShiftSlot[]>([]);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const designationsList = ['bartender', 'line cook', 'host', 'waiter', 'security', 'janitor', 'accountant'];

    const convertTo24Hour = (time: string, period: 'AM' | 'PM'): string => {
        if (!time) return '';
        let hour = parseInt(time);
        if (period === 'PM' && hour !== 12) hour += 12;
        if (period === 'AM' && hour === 12) hour = 0;
        return `${String(hour).padStart(2, '0')}:00`;
    };

    const fetchLocations = useCallback(async () => {
        if (!token) return;
        setLocationsLoading(true);
        try {
            const response = await fetch('/api/locations', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to fetch locations');
            const data = await response.json();
            const locationData = data.data || [];
            setLocations(locationData);
            if (locationData.length > 0) {
                setGroupData(prev => ({
                    ...prev,
                    location: locationData[0]._id,
                    timezone: locationData[0].timezone || 'UTC'
                }));
            }
        } catch (err) {
            setError('Failed to load locations');
        } finally {
            setLocationsLoading(false);
        }
    }, [token]);

    const fetchAvailableStaffForSlot = async (slotId: string) => {
        const slot = slots.find(s => s.id === slotId);
        if (!slot || !token || !groupData.location) return;

        setSlots(prev => prev.map(s => s.id === slotId ? { ...s, loadingAvailability: true } : s));

        try {
            const startTime24 = convertTo24Hour(slot.startTime, slot.startAmPm);
            const endTime24 = convertTo24Hour(slot.endTime, slot.endAmPm);

            const params = new URLSearchParams({
                location: groupData.location,
                startTime: startTime24,
                endTime: endTime24,
                workDays: slot.workDays.join(','),
                designation: slot.designation
            });

            const response = await fetch(`/api/staff/available?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch available staff');
            const data = await response.json();

            setSlots(prev => prev.map(s => s.id === slotId ? {
                ...s,
                availableStaff: data.data?.available || [],
                unavailableStaff: data.data?.unavailable || [],
                loadingAvailability: false
            } : s));
        } catch (err) {
            console.error('Error fetching available staff:', err);
            setSlots(prev => prev.map(s => s.id === slotId ? { ...s, loadingAvailability: false } : s));
        }
    };

    useEffect(() => {
        if (isOpen && user?.role === 'manager' && token) {
            fetchLocations();
        }
    }, [isOpen, user?.role, token, fetchLocations]);

    const handleAddSlot = () => {
        const newSlot: ShiftSlot = {
            id: Math.random().toString(36).substr(2, 9),
            designation: designationsList[0],
            startTime: '09',
            startAmPm: 'AM',
            endTime: '05',
            endAmPm: 'PM',
            workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            headcount: 1,
            assignedStaff: [],
            availableStaff: [],
            unavailableStaff: [],
            loadingAvailability: false
        };
        setSlots(prev => [...prev, newSlot]);
    };

    const handleRemoveSlot = (id: string) => {
        setSlots(prev => prev.filter(s => s.id !== id));
    };

    const updateSlot = (id: string, updates: Partial<ShiftSlot>) => {
        setSlots(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const handleWorkDayToggle = (slotId: string, day: string) => {
        setSlots(prev => prev.map(s => {
            if (s.id !== slotId) return s;
            const newDays = s.workDays.includes(day)
                ? s.workDays.filter(d => d !== day)
                : [...s.workDays, day];
            return { ...s, workDays: newDays };
        }));
    };

    const handleStaffToggle = (slotId: string, staffId: string) => {
        setSlots(prev => prev.map(s => {
            if (s.id !== slotId) return s;
            const newAssigned = s.assignedStaff.includes(staffId)
                ? s.assignedStaff.filter(id => id !== staffId)
                : [...s.assignedStaff, staffId];
            return { ...s, assignedStaff: newAssigned };
        }));
    };

    const validateStep = (): boolean => {
        setError(null);
        if (currentStep === 1) {
            if (!groupData.location) {
                setError('Please select a location');
                return false;
            }
            if (!groupData.title.trim()) {
                setError('Please enter a group title');
                return false;
            }
        }
        if (currentStep === 2) {
            if (slots.length === 0) {
                setError('Please add at least one shift slot');
                return false;
            }
            for (const slot of slots) {
                if (!slot.startTime || !slot.endTime) {
                    setError(`Please set times for all slots`);
                    return false;
                }
                if (slot.workDays.length === 0) {
                    setError(`Please select work days for all slots`);
                    return false;
                }
            }
        }
        return true;
    };

    const handleNextStep = async () => {
        if (validateStep()) {
            if (currentStep === 2) {
                setLoading(true);
                await Promise.all(slots.map(slot => fetchAvailableStaffForSlot(slot.id)));
                setLoading(false);
                if (slots.length > 0) setActiveSlotId(slots[0].id);
                setCurrentStep(3);
            } else if (currentStep === 3) {
                await handleCreateAllShifts();
            } else {
                setCurrentStep(prev => prev + 1);
            }
        }
    };

    const handleCreateAllShifts = async () => {
        setLoading(true);
        try {
            for (const slot of slots) {
                const shiftData = {
                    location: groupData.location,
                    title: `${groupData.title} (${slot.designation})`,
                    description: groupData.description,
                    designation: slot.designation,
                    startTime: convertTo24Hour(slot.startTime, slot.startAmPm),
                    endTime: convertTo24Hour(slot.endTime, slot.endAmPm),
                    workDays: slot.workDays,
                    timezone: groupData.timezone,
                    headcount: slot.headcount,
                    startDate: groupData.startDate,
                    endDate: groupData.endDate || undefined
                };

                const res = await fetch('/api/shift-schedules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(shiftData)
                });
                if (!res.ok) throw new Error('Failed to create a shift slot');
                const result = await res.json();
                const shiftId = result.data._id;

                if (slot.assignedStaff.length > 0) {
                    await fetch(`/api/shift-schedules/${shiftId}/assign-staff`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ staffIds: slot.assignedStaff })
                    });
                }
            }
            showSuccess(`Successfully created ${slots.length} shift slots!`);
            onClose();
            onSuccess?.();
        } catch (err) {
            showError(err instanceof Error ? err.message : 'Failed to finalize shifts');
        } finally {
            setLoading(false);
        }
    };

    const activeSlot = slots.find(s => s.id === activeSlotId);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100">
                {/* Header */}
                <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-10">
                    <div className="flex items-center space-x-4">
                        <div className="bg-indigo-50 p-3 rounded-2xl">
                            <Clock className="h-6 w-6 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Create Weekly Shifts</h2>
                            <p className="text-sm text-gray-500 font-medium">Step {currentStep} of {3}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full transition-all duration-200">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="h-1 bg-gray-100 w-full overflow-hidden">
                    <div
                        className="h-full bg-indigo-600 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(79,70,229,0.5)]"
                        style={{ width: `${(currentStep / 3) * 100}%` }}
                    />
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#fcfcfd]">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center space-x-3 text-red-600 animate-in slide-in-from-top-2 duration-300">
                            <AlertCircle className="h-5 w-5 flex-shrink-0" />
                            <p className="text-sm font-semibold">{error}</p>
                        </div>
                    )}

                    {currentStep === 1 && (
                        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2 group">
                                    <label className="block text-sm font-bold text-gray-700 ml-1">Location</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                                        <select
                                            value={groupData.location}
                                            onChange={(e) => {
                                                const loc = locations.find(l => l._id === e.target.value);
                                                setGroupData(prev => ({ ...prev, location: e.target.value, timezone: loc?.timezone || 'UTC' }));
                                            }}
                                            className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all duration-300 font-medium text-gray-700 shadow-sm appearance-none outline-none"
                                        >
                                            {locationsLoading ? (
                                                <option>Loading locations...</option>
                                            ) : (
                                                locations.map(loc => (
                                                    <option key={loc._id} value={loc._id}>{loc.city} - {loc.address}</option>
                                                ))
                                            )}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-2 group">
                                    <label className="block text-sm font-bold text-gray-700 ml-1">Group Title</label>
                                    <input
                                        type="text"
                                        value={groupData.title}
                                        onChange={(e) => setGroupData(prev => ({ ...prev, title: e.target.value }))}
                                        placeholder="e.g., Weekend Peak Hours"
                                        className="w-full px-5 py-3.5 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all duration-300 font-medium text-gray-700 shadow-sm outline-none"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2 group">
                                <label className="block text-sm font-bold text-gray-700 ml-1">Shift Group Description (Optional)</label>
                                <textarea
                                    value={groupData.description}
                                    onChange={(e) => setGroupData(prev => ({ ...prev, description: e.target.value }))}
                                    className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all duration-300 font-medium text-gray-700 shadow-sm min-h-[120px] outline-none"
                                    placeholder="Provide notes for staff members..."
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2 group">
                                    <label className="block text-sm font-bold text-gray-700 ml-1">Start Date</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                                        <input
                                            type="date"
                                            value={groupData.startDate}
                                            onChange={(e) => setGroupData(prev => ({ ...prev, startDate: e.target.value }))}
                                            className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all duration-300 font-medium text-gray-700 shadow-sm outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2 group">
                                    <label className="block text-sm font-bold text-gray-700 ml-1">End Date (Optional)</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                                        <input
                                            type="date"
                                            value={groupData.endDate}
                                            onChange={(e) => setGroupData(prev => ({ ...prev, endDate: e.target.value }))}
                                            className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all duration-300 font-medium text-gray-700 shadow-sm outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-lg font-bold text-gray-900">Define Multiple Shift Slots</h3>
                                <button
                                    onClick={handleAddSlot}
                                    className="flex items-center px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all duration-300 text-sm font-bold shadow-md shadow-indigo-100 active:scale-95"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add New Slot
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-6">
                                {slots.length === 0 ? (
                                    <div className="text-center py-16 bg-white border-2 border-dashed border-gray-100 rounded-[2rem] animate-pulse">
                                        <Clock className="mx-auto h-12 w-12 text-gray-200 mb-4" />
                                        <p className="text-gray-400 font-medium">No slots added yet. Start by clicking "Add New Slot".</p>
                                    </div>
                                ) : (
                                    slots.map((slot) => (
                                        <div key={slot.id} className="p-6 bg-white border border-gray-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all duration-300 group relative">
                                            <button 
                                                onClick={() => handleRemoveSlot(slot.id)}
                                                className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all duration-200"
                                            >
                                                <Trash2 className="h-5 w-5" />
                                            </button>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Designation</label>
                                                    <select
                                                        value={slot.designation}
                                                        onChange={(e) => updateSlot(slot.id, { designation: e.target.value })}
                                                        className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 transition-all duration-300 font-semibold text-gray-700 outline-none"
                                                    >
                                                        {designationsList.map(d => (
                                                            <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Start Time</label>
                                                    <div className="flex space-x-2">
                                                        <input
                                                            type="text"
                                                            value={slot.startTime}
                                                            onChange={(e) => updateSlot(slot.id, { startTime: e.target.value })}
                                                            placeholder="09"
                                                            className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 transition-all duration-300 font-semibold text-gray-700 text-center outline-none"
                                                        />
                                                        <select
                                                            value={slot.startAmPm}
                                                            onChange={(e) => updateSlot(slot.id, { startAmPm: e.target.value as 'AM' | 'PM' })}
                                                            className="px-3 py-3 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 transition-all duration-300 font-bold text-indigo-600 outline-none"
                                                        >
                                                            <option value="AM">AM</option>
                                                            <option value="PM">PM</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">End Time</label>
                                                    <div className="flex space-x-2">
                                                        <input
                                                            type="text"
                                                            value={slot.endTime}
                                                            onChange={(e) => updateSlot(slot.id, { endTime: e.target.value })}
                                                            placeholder="05"
                                                            className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 transition-all duration-300 font-semibold text-gray-700 text-center outline-none"
                                                        />
                                                        <select
                                                            value={slot.endAmPm}
                                                            onChange={(e) => updateSlot(slot.id, { endAmPm: e.target.value as 'AM' | 'PM' })}
                                                            className="px-3 py-3 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-indigo-500 transition-all duration-300 font-bold text-indigo-600 outline-none"
                                                        >
                                                            <option value="AM">AM</option>
                                                            <option value="PM">PM</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Headcount</label>
                                                    <div className="flex items-center space-x-3 bg-gray-50 rounded-2xl p-1 px-2 border border-transparent">
                                                        <button 
                                                            onClick={() => updateSlot(slot.id, { headcount: Math.max(1, slot.headcount - 1) })}
                                                            className="p-2 text-indigo-600 hover:bg-white rounded-xl transition-all duration-200 shadow-sm disabled:opacity-30"
                                                            disabled={slot.headcount <= 1}
                                                        >
                                                            <div className="w-5 h-0.5 bg-current rounded-full" />
                                                        </button>
                                                        <input
                                                            type="number"
                                                            value={slot.headcount}
                                                            onChange={(e) => updateSlot(slot.id, { headcount: parseInt(e.target.value) || 1 })}
                                                            className="w-12 text-center bg-transparent font-bold text-gray-700 border-none outline-none"
                                                        />
                                                        <button 
                                                            onClick={() => updateSlot(slot.id, { headcount: slot.headcount + 1 })}
                                                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200"
                                                        >
                                                            <Plus className="h-5 w-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-6 pt-6 border-t border-gray-50">
                                                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1 mb-3 block">Work Days</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {days.map(day => (
                                                        <button
                                                            key={day}
                                                            onClick={() => handleWorkDayToggle(slot.id, day)}
                                                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${slot.workDays.includes(day)
                                                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                                                                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                                            }`}
                                                        >
                                                            {day.substring(0, 3)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-bold text-gray-900">Assign Available Staff</h3>
                                <div className="flex space-x-2">
                                    {slots.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => setActiveSlotId(s.id)}
                                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 border-2 ${activeSlotId === s.id
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100'
                                                : 'bg-white text-gray-500 border-gray-100 hover:border-indigo-100'
                                            }`}
                                        >
                                            {s.designation}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {activeSlot && (
                                <div className="space-y-6">
                                    <div className="bg-indigo-50/50 p-5 rounded-[2rem] border border-indigo-100/50 flex items-center justify-between">
                                        <div className="flex items-center space-x-4">
                                            <div className="bg-white p-3 rounded-2xl shadow-sm">
                                                <Users className="h-6 w-6 text-indigo-600" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-gray-900">{activeSlot.designation.charAt(0).toUpperCase() + activeSlot.designation.slice(1)} Slot</h4>
                                                <p className="text-sm text-gray-500 font-medium">
                                                    {activeSlot.startTime}{activeSlot.startAmPm} - {activeSlot.endTime}{activeSlot.endAmPm} | {activeSlot.headcount} needed
                                                </p>
                                            </div>
                                        </div>
                                        <div className="bg-white px-4 py-2 rounded-xl shadow-sm">
                                            <span className="text-sm font-bold text-indigo-600">{activeSlot.assignedStaff.length} / {activeSlot.headcount} Selected</span>
                                        </div>
                                    </div>

                                    {activeSlot.loadingAvailability ? (
                                        <div className="text-center py-20 bg-white rounded-[2rem] border border-gray-100">
                                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-4" />
                                            <p className="text-gray-500 font-bold">Checking staff availability...</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {activeSlot.availableStaff.length === 0 ? (
                                                <div className="md:col-span-2 text-center py-16 bg-white border-2 border-dashed border-gray-100 rounded-[2rem]">
                                                    <p className="text-gray-400 font-medium">No available staff found for this designation and time.</p>
                                                </div>
                                            ) : (
                                                activeSlot.availableStaff.map(staff => (
                                                    <div 
                                                        key={staff._id}
                                                        onClick={() => handleStaffToggle(activeSlot.id, staff._id)}
                                                        className={`p-4 border rounded-[2rem] cursor-pointer transition-all duration-300 flex items-center justify-between group ${
                                                            activeSlot.assignedStaff.includes(staff._id)
                                                            ? 'border-indigo-600 bg-indigo-50 shadow-md shadow-indigo-100/50'
                                                            : 'border-gray-100 bg-white hover:border-indigo-200'
                                                        }`}
                                                    >
                                                        <div className="flex items-center space-x-4">
                                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg transition-colors ${
                                                                activeSlot.assignedStaff.includes(staff._id) ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                                                            }`}>
                                                                {staff.user.firstName[0]}{staff.user.lastName[0]}
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-gray-900">{staff.user.firstName} {staff.user.lastName}</p>
                                                                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{staff.designation}</p>
                                                            </div>
                                                        </div>
                                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                                                            activeSlot.assignedStaff.includes(staff._id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-200'
                                                        }`}>
                                                            {activeSlot.assignedStaff.includes(staff._id) && <Check className="h-3 w-3 text-white" />}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}

                                    {/* Unavailable Section */}
                                    {activeSlot.unavailableStaff.length > 0 && (
                                        <div className="mt-10">
                                            <h5 className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1 mb-4">Unavailable Staff ({activeSlot.unavailableStaff.length})</h5>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {activeSlot.unavailableStaff.map(staff => (
                                                    <div key={staff._id} className="p-4 bg-gray-50/50 border border-gray-100 rounded-[2rem] opacity-60 flex items-center justify-between">
                                                        <div className="flex items-center space-x-4">
                                                            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center font-bold text-gray-400">
                                                                {staff.user.firstName[0]}{staff.user.lastName[0]}
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-gray-400">{staff.user.firstName} {staff.user.lastName}</p>
                                                                <p className="text-xs text-red-400 font-bold">{staff.reason || 'Scheduling Conflict'}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-8 border-t border-gray-50 bg-white sticky bottom-0 z-10">
                    <div className="flex items-center justify-between">
                        <button
                            disabled={currentStep === 1 || loading}
                            onClick={() => setCurrentStep(prev => prev - 1)}
                            className="px-8 py-3.5 border-2 border-gray-100 text-gray-600 rounded-2xl hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all duration-300 font-bold text-sm"
                        >
                            Back
                        </button>
                        <div className="flex items-center space-x-4">
                            <span className="text-sm font-bold text-gray-400">Step {currentStep} of 3</span>
                            <button
                                disabled={loading}
                                onClick={handleNextStep}
                                className="px-10 py-3.5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all duration-300 transform active:scale-95 disabled:opacity-50 font-bold flex items-center"
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-b-white mr-3" />
                                        Processing...
                                    </>
                                ) : (
                                    currentStep === 3 ? 'Finalize & Allocate' : 'Next Step'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
