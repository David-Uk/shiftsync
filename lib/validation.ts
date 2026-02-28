// Simple HTML tag removal function
function removeHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

// Sanitize string input
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  
  // Remove HTML tags and sanitize
  return removeHtmlTags(input.trim());
}

// Sanitize email
export function sanitizeEmail(email: string): string {
  const sanitized = sanitizeString(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(sanitized)) {
    throw new Error('Invalid email format');
  }
  
  return sanitized.toLowerCase();
}

// Sanitize name (first and last name)
export function sanitizeName(name: string): string {
  const sanitized = sanitizeString(name);
  
  // Only allow letters, spaces, hyphens, and apostrophes
  const nameRegex = /^[a-zA-Z\s\-']+$/;
  
  if (!nameRegex.test(sanitized)) {
    throw new Error('Name can only contain letters, spaces, hyphens, and apostrophes');
  }
  
  if (sanitized.length < 2 || sanitized.length > 50) {
    throw new Error('Name must be between 2 and 50 characters');
  }
  
  return sanitized;
}

// Sanitize role
export function sanitizeRole(role: string): 'admin' | 'manager' | 'staff' {
  const sanitized = sanitizeString(role);
  const validRoles = ['admin', 'manager', 'staff'];
  
  if (!validRoles.includes(sanitized)) {
    throw new Error('Invalid role. Must be admin, manager, or staff');
  }
  
  return sanitized as 'admin' | 'manager' | 'staff';
}

// Sanitize password (basic validation, actual hashing done separately)
export function sanitizePassword(password: string): string {
  if (typeof password !== 'string') {
    throw new Error('Password must be a string');
  }
  
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  
  if (password.length > 128) {
    throw new Error('Password must be less than 128 characters');
  }
  
  return password;
}

// Validate ObjectId format
export function validateObjectId(id: string): string {
  const sanitized = sanitizeString(id);
  const objectIdRegex = /^[0-9a-fA-F]{24}$/;
  
  if (!objectIdRegex.test(sanitized)) {
    throw new Error('Invalid ID format');
  }
  
  return sanitized;
}

// Sanitize designation
export function sanitizeDesignation(designation: string): string {
  const sanitized = sanitizeString(designation);
  
  // Allow letters, numbers, spaces, hyphens, and common punctuation
  const designationRegex = /^[a-zA-Z0-9\s\-\.,&()]+$/;
  
  if (!designationRegex.test(sanitized)) {
    throw new Error('Designation contains invalid characters');
  }
  
  if (sanitized.length < 2 || sanitized.length > 100) {
    throw new Error('Designation must be between 2 and 100 characters');
  }
  
  return sanitized;
}

// Sanitize staff status
export function sanitizeStaffStatus(status: string): 'active' | 'inactive' | 'on_leave' | 'suspended' | 'retrenched' | 'resigned' | 'retired' {
  const sanitized = sanitizeString(status);
  const validStatuses = ['active', 'inactive', 'on_leave', 'suspended', 'retrenched', 'resigned', 'retired'];
  
  if (!validStatuses.includes(sanitized)) {
    throw new Error('Invalid staff status');
  }
  
  return sanitized as 'active' | 'inactive' | 'on_leave' | 'suspended' | 'retrenched' | 'resigned' | 'retired';
}

// Sanitize user creation data
export function sanitizeUserCreation(data: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  profileImage?: string;
}) {
  return {
    firstName: sanitizeName(data.firstName),
    lastName: sanitizeName(data.lastName),
    email: sanitizeEmail(data.email),
    password: sanitizePassword(data.password),
    role: sanitizeRole(data.role),
    profileImage: data.profileImage ? sanitizeString(data.profileImage) : undefined,
  };
}

// Sanitize user update data
export function sanitizeUserUpdate(data: {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: string;
  profileImage?: string;
}) {
  const sanitized: Record<string, string | undefined> = {};
  
  if (data.firstName !== undefined) sanitized.firstName = sanitizeName(data.firstName);
  if (data.lastName !== undefined) sanitized.lastName = sanitizeName(data.lastName);
  if (data.email !== undefined) sanitized.email = sanitizeEmail(data.email);
  if (data.password !== undefined) sanitized.password = sanitizePassword(data.password);
  if (data.role !== undefined) sanitized.role = sanitizeRole(data.role);
  if (data.profileImage !== undefined) {
    sanitized.profileImage = data.profileImage ? sanitizeString(data.profileImage) : undefined;
  }
  
  return sanitized;
}

// Sanitize staff creation data
export function sanitizeStaffCreation(data: {
  userId: string;
  designation: string;
  status?: string;
}) {
  return {
    userId: validateObjectId(data.userId),
    designation: sanitizeDesignation(data.designation),
    status: data.status ? sanitizeStaffStatus(data.status) : 'active',
  };
}

// Sanitize staff update data
export function sanitizeStaffUpdate(data: {
  designation?: string;
  status?: string;
}) {
  const sanitized: Record<string, string | undefined> = {};
  
  if (data.designation !== undefined) sanitized.designation = sanitizeDesignation(data.designation);
  if (data.status !== undefined) sanitized.status = sanitizeStaffStatus(data.status);
  
  return sanitized;
}
