# ShiftSync

A comprehensive Next.js application for shift scheduling and management with user authentication, role-based access control, timezone-aware scheduling, and modern UI/UX design.

## Features

- **Authentication System**: Complete login/logout with JWT tokens
- **Password Management**: Forgot password and reset functionality
- **Role-based Access Control**: Admin, Manager, and Staff roles
- **User Management**: Admin-only user creation and profile management with staff record auto-creation
- **Profile Management**: Image upload with Cloudinary integration
- **Advanced Shift Scheduling**:
  - Timezone-aware scheduling across different timezones
  - Recurring and one-off schedule support
  - Conflict detection between recurring and one-off schedules
  - 10-hour rest rule validation
  - Schedule publishing system
- **Staff Management**: Automatic staff record creation for staff/manager roles
- **Location Management**: Multiple location support
- **Time Entry Management**: Clock-in/clock-out functionality
- **Notification System**: Real-time notifications for schedule changes
- **Input Validation**: Comprehensive sanitization and validation
- **Responsive Design**: Mobile-first, accessible UI with Tailwind CSS
- **Security Features**: Password hashing, JWT authentication, CSRF protection

## Getting Started

### Environment Variables

Create a `.env` file in root directory with the following variables:

```env
# Database Configuration
MONGODB_URL=mongodb://localhost:27017/shiftsync

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

### Installation

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables as described above

3. Run development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Application Flow

### Initial Setup

1. Visit the root URL → redirects to login page
2. Create the first admin user (no authentication required)
3. Login as admin → access dashboard and user management

### User Management

- **First Admin**: Can be created without authentication (bootstrap)
- **Subsequent Users**: Only authenticated admins can create users
- **Roles**: Admin, Manager, Staff (first user must be admin)
- **Staff Records**: Automatically created for staff and manager roles

### Authentication Pages

- **Login** (`/auth/login`) - User authentication
- **Forgot Password** (`/auth/forgot-password`) - Password reset request
- **Reset Password** (`/auth/reset-password`) - Set new password with token

## API Endpoints

### Authentication

#### `POST /api/auth/login`

User login with email and password.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**

```json
{
  "message": "Login successful",
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "firstName": "John",
    "lastName": "Doe",
    "email": "user@example.com",
    "role": "staff",
    "profileImage": "image_url"
  }
}
```

#### `POST /api/auth/forgot-password`

Request password reset email.

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response:**

```json
{
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

#### `POST /api/auth/reset-password`

Reset password with token.

**Request:**

```json
{
  "token": "reset_token_here",
  "password": "new_password123"
}
```

**Response:**

```json
{
  "message": "Password reset successful"
}
```

### User Management (Admin Authentication Required)

#### `GET /api/users`

Get all users (admin only).

**Headers:**

```
Authorization: Bearer <admin_jwt_token>
```

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search term for name/email
- `role` (optional): Filter by role (admin/manager/staff)

**Response:**

```json
{
  "users": [
    {
      "id": "user_id",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "role": "staff",
      "profileImage": "image_url",
      "isArchived": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

#### `POST /api/users`

Create new user (admin only, or first admin without auth).

**Headers (if admin exists):**

```
Authorization: Bearer <admin_jwt_token>
```

**Request (JSON):**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "password": "SecurePassword123",
  "role": "staff",
  "designation": "bartender"
}
```

**Request (Multipart with image):**

```
firstName: John
lastName: Doe
email: john.doe@example.com
password: SecurePassword123
role: staff
designation: bartender
profileImage: [file]
```

**Response:**

```json
{
  "message": "User created successfully",
  "user": {
    "id": "user_id",
    "email": "john.doe@example.com",
    "role": "staff",
    "profileImage": "image_url"
  }
}
```

#### `PUT /api/users/[id]`

Update user (admin only).

**Headers:**

```
Authorization: Bearer <admin_jwt_token>
```

**Request:**

```json
{
  "firstName": "John Updated",
  "lastName": "Doe Updated",
  "email": "john.updated@example.com",
  "role": "manager",
  "designation": "line cook"
}
```

#### `DELETE /api/users/[id]`

Archive user (admin only).

**Headers:**

```
Authorization: Bearer <admin_jwt_token>
```

**Response:**

```json
{
  "message": "User archived successfully",
  "user": {
    "id": "user_id",
    "isArchived": true
  }
}
```

#### `PATCH /api/users/[id]/unarchive`

Unarchive user (admin only).

**Headers:**

```
Authorization: Bearer <admin_jwt_token>
```

**Response:**

```json
{
  "message": "User unarchived successfully",
  "user": {
    "id": "user_id",
    "isArchived": false
  }
}
```

### Staff Management

#### `GET /api/staff`

Get all staff members (admin/manager access).

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response:**

```json
{
  "staff": [
    {
      "id": "staff_id",
      "user": {
        "id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com"
      },
      "designation": "bartender",
      "status": "active",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `POST /api/staff`

Add user to staff (admin only).

**Headers:**

```
Authorization: Bearer <admin_jwt_token>
```

**Request:**

```json
{
  "userId": "user_id",
  "designation": "bartender",
  "status": "active"
}
```

#### `PUT /api/staff/[id]`

Update staff member (admin only).

**Headers:**

```
Authorization: Bearer <admin_jwt_token>
```

**Request:**

```json
{
  "designation": "line cook",
  "status": "active"
}
```

### Schedule Management

#### `GET /api/schedules`

Get schedules (role-based access).

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `startDate` (optional): Filter by start date
- `endDate` (optional): Filter by end date
- `timezone` (optional): Convert to local timezone
- `staffId` (optional): Filter by staff member (admin/manager only)

**Response:**

```json
{
  "success": true,
  "schedules": [
    {
      "_id": "schedule_id",
      "staff": {
        "_id": "staff_id",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com"
      },
      "startTime": "2024-01-01T08:00:00.000Z",
      "endTime": "2024-01-01T16:00:00.000Z",
      "workDays": ["Monday", "Wednesday", "Friday"],
      "isOneOff": false,
      "timezone": "EST",
      "notes": "Morning shift",
      "isPublished": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

#### `POST /api/schedules`

Create new schedule (admin/manager access, or staff for themselves).

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Request:**

```json
{
  "staff": "staff_id_or_user_id",
  "startTime": "2024-01-01T08:00:00.000Z",
  "endTime": "2024-01-01T16:00:00.000Z",
  "workDays": ["Monday", "Wednesday", "Friday"],
  "isOneOff": false,
  "timezone": "EST",
  "notes": "Morning shift"
}
```

**Request (One-off schedule):**

```json
{
  "staff": "staff_id_or_user_id",
  "startTime": "2024-01-01T08:00:00.000Z",
  "endTime": "2024-01-01T16:00:00.000Z",
  "isOneOff": true,
  "oneOffDate": "2024-01-01",
  "timezone": "EST",
  "notes": "Special event shift"
}
```

#### `GET /api/schedules/[id]`

Get single schedule.

**Headers:**

```
Authorization: Bearer <jwt_token>
```

#### `PUT /api/schedules/[id]`

Update schedule.

**Headers:**

```
Authorization: Bearer <jwt_token>
```

#### `DELETE /api/schedules/[id]`

Delete schedule.

**Headers:**

```
Authorization: Bearer <jwt_token>
```

#### `PUT /api/schedules/[id]/publish`

Publish schedule (make it visible to staff).

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response:**

```json
{
  "success": true,
  "message": "Schedule published successfully",
  "schedule": {
    "_id": "schedule_id",
    "isPublished": true
    // ... other schedule fields
  }
}
```

### Time Entry Management

#### `POST /api/time-entries/clock-in`

Clock in for a shift.

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Request:**

```json
{
  "notes": "Starting morning shift"
}
```

#### `POST /api/time-entries/clock-out`

Clock out from a shift.

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Request:**

```json
{
  "notes": "Completed morning shift"
}
```

#### `GET /api/my-shifts`

Get current user's shifts.

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `startDate` (optional): Filter by start date
- `endDate` (optional): Filter by end date
- `timezone` (optional): Convert to local timezone

### Location Management

#### `GET /api/locations`

Get all locations.

**Headers:**

```
Authorization: Bearer <jwt_token>
```

#### `POST /api/locations`

Create new location (admin only).

**Headers:**

```
Authorization: Bearer <admin_jwt_token>
```

**Request:**

```json
{
  "name": "Main Restaurant",
  "address": "123 Main St, City, State",
  "timezone": "EST",
  "capacity": 100
}
```

#### `PUT /api/locations/[id]`

Update location (admin only).

**Headers:**

```
Authorization: Bearer <admin_jwt_token>
```

#### `DELETE /api/locations/[id]`

Delete location (admin only).

**Headers:**

```
Authorization: Bearer <admin_jwt_token>
```

## Database Models

### User Model

```typescript
interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  role: "admin" | "manager" | "staff";
  designation?: string; // Required for staff role
  profileImage?: string;
  phone?: string;
  isArchived: boolean;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Staff Model

```typescript
interface IStaff {
  user: ObjectId; // Reference to User
  designation: string;
  status:
    | "active"
    | "inactive"
    | "on_leave"
    | "suspended"
    | "retrenched"
    | "resigned"
    | "retired";
  createdAt: Date;
  updatedAt: Date;
}
```

### Schedule Model

```typescript
interface ISchedule {
  staff: ObjectId; // Reference to Staff
  startTime: Date; // UTC
  endTime: Date; // UTC
  workDays: string[]; // ['Sunday', 'Monday', ...]
  isOneOff: boolean;
  oneOffDate?: Date;
  timezone: string; // 'UTC', 'GMT', 'EST', 'PST', etc.
  location?: ObjectId; // Reference to Location
  notes?: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Location Model

```typescript
interface ILocation {
  name: string;
  address: string;
  timezone: string;
  capacity?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

## Scheduling Features

### Timezone Support

- All schedules stored in UTC
- Automatic timezone conversion for display
- Conflict detection across different timezones
- 10-hour rest rule respected across timezone boundaries

### Conflict Detection

- **Recurring vs Recurring**: Prevents duplicate work days
- **One-off vs One-off**: Prevents overlapping shifts on same date
- **Recurring vs One-off**: Prevents one-off shifts on recurring work days
- **Timezone-aware**: All conflicts detected regardless of timezone

### Schedule Publishing

- Draft schedules (isPublished: false) - only visible to managers/admins
- Published schedules (isPublished: true) - visible to all staff
- Automatic notifications when schedules are published

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with salt rounds
- **Input Sanitization**: XSS protection and validation
- **Role-based Authorization**: Admin, Manager, Staff access levels
- **CSRF Protection**: Next.js built-in protections
- **Password Reset**: Secure token-based password recovery
- **Image Validation**: File type and size restrictions
- **Database Security**: MongoDB connection with validation

## UI/UX Features

- **Responsive Design**: Mobile-first approach
- **Accessibility**: ARIA labels, semantic HTML, keyboard navigation
- **Modern UI**: Tailwind CSS with consistent color scheme
- **Loading States**: Spinners and progress indicators
- **Error Handling**: User-friendly error messages
- **Form Validation**: Real-time validation feedback
- **Password Strength**: Visual strength indicators
- **Micro-interactions**: Hover effects and smooth transitions

## Technology Stack

- **Frontend**: Next.js 15+, React, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT with bcrypt
- **File Storage**: Cloudinary
- **Icons**: Lucide React
- **Validation**: Custom validation library

## Error Handling

All API endpoints include comprehensive error handling:

- **400**: Bad Request (validation errors, missing fields, scheduling conflicts)
- **401**: Unauthorized (no token, invalid token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found (resource doesn't exist)
- **409**: Conflict (duplicate resources, scheduling conflicts)
- **500**: Internal Server Error

## Development

### Running Tests

```bash
npm run test
```

### Building for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## Deployment

The easiest way to deploy is using the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
