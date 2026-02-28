'use client';

// import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Calendar,
  Users,
  Clock,
  Settings,
  BarChart3,
  UserCheck,
  MapPin,
  LogOut
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[]; // If specified, only show to these roles
}

export function DashboardSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const sidebarItems: SidebarItem[] = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: <Home className="h-5 w-5" />,
    },
    {
      label: 'My Shifts',
      href: '/shifts',
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      label: 'Schedule',
      href: '/schedule',
      icon: <Clock className="h-5 w-5" />,
    },
    {
      label: 'Team',
      href: '/team',
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: 'Locations',
      href: '/locations',
      icon: <MapPin className="h-5 w-5" />,
      roles: ['admin', 'manager'],
    },
    {
      label: 'User Management',
      href: '/users',
      icon: <UserCheck className="h-5 w-5" />,
      roles: ['admin'],
    },
    {
      label: 'Reports',
      href: '/reports',
      icon: <BarChart3 className="h-5 w-5" />,
      roles: ['admin', 'manager'],
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  const filteredItems = sidebarItems.filter(item =>
    !item.roles || item.roles.includes(user?.role || '')
  );

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-30 lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed top-0 left-0 h-screen w-64 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-40
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:z-10
      `}>
        <div className="flex flex-col h-full pt-20">
          {/* Logo/Brand */}
          <div className="hidden lg:flex items-center justify-between h-20 px-6 border-b border-gray-100 absolute top-0 left-0 right-0 bg-white/90 backdrop-blur-md z-10 transition-colors">
            <div className="flex items-center">
              <div className="shrink-0 group cursor-pointer">
                <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 tracking-tight group-hover:from-indigo-500 group-hover:to-purple-500 transition-all duration-300">ShiftSync</h1>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
            {filteredItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`
                  group flex items-center px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200
                  ${isActive(item.href)
                    ? 'bg-gradient-to-r from-indigo-50 to-indigo-100/50 text-indigo-700 shadow-sm shadow-indigo-100/50'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:shadow-sm'
                  }
                `}
              >
                <div className={`${isActive(item.href) ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'} transition-colors duration-200`}>
                  {item.icon}
                </div>
                <span className="ml-3">{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* User info and logout */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center mb-4">
              <div className="shrink-0">
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-indigo-600">
                    {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                  </span>
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <LogOut className="h-4 w-4 mr-3" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
