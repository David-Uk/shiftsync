# ShiftSync

A comprehensive Next.js application for shift scheduling and management with user authentication, role-based access control, and modern UI/UX design.

## Features

- **Authentication System**: Complete login/logout with JWT tokens
- **Password Management**: Forgot password and reset functionality
- **Role-based Access Control**: Admin, Manager, and Staff roles
- **User Management**: Admin-only user creation and profile management
- **Profile Management**: Image upload with Cloudinary integration
- **Shift Scheduling**: Advanced shift management with timezone support
- **Input Validation**: Comprehensive sanitization and validation
- **Responsive Design**: Mobile-first, accessible UI with Tailwind CSS
- **Security Features**: Password hashing, JWT authentication, CSRF protection

## Getting Started

### Environment Variables

Create a `.env` file in root directory with the following variables:

```env
# Database Configuration
MONGO_URL=mongodb://localhost:27017/shiftsync

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
  ]
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
  "role": "staff"
}
```

**Request (Multipart with image):**

```
firstName: John
lastName: Doe
email: john.doe@example.com
password: SecurePassword123
role: staff
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
  "role": "manager"
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

### Shift Management

#### `GET /api/shifts`

Get all shift schedules (admin/manager access).

#### `POST /api/shifts`

Create new shift schedule (admin/manager access).

**Request:**

```json
{
  "location": "location_id",
  "manager": "manager_id",
  "title": "Morning Shift",
  "description": "Early morning shift",
  "startTime": "2024-01-01T08:00:00.000Z",
  "endTime": "2024-01-01T16:00:00.000Z",
  "workDays": ["Monday", "Wednesday", "Friday"],
  "timezone": "EST",
  "requiredSkills": ["Customer Service", "Cash Handling"],
  "headcount": 3,
  "assignedStaff": ["staff_id_1", "staff_id_2"],
  "startDate": "2024-01-01T00:00:00.000Z",
  "endDate": "2024-12-31T23:59:59.999Z"
}
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
  profileImage?: string;
  isArchived: boolean;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### ShiftSchedule Model

```typescript
interface IShiftSchedule {
  location: ObjectId; // Reference to Location
  manager: ObjectId; // Reference to User (manager)
  title: string;
  description?: string;
  startTime: Date; // UTC
  endTime: Date; // UTC
  workDays: string[]; // ['Sunday', 'Monday', ...]
  timezone: string; // 'UTC', 'GMT', 'EST', 'PST', etc.
  requiredSkills: string[];
  headcount: number;
  assignedStaff: ObjectId[]; // Reference to Staff
  isActive: boolean;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

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

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT with bcrypt
- **File Storage**: Cloudinary
- **Icons**: Lucide React
- **Validation**: Custom validation library

## Error Handling

All API endpoints include comprehensive error handling:

- **400**: Bad Request (validation errors, missing fields)
- **401**: Unauthorized (no token, invalid token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found (resource doesn't exist)
- **409**: Conflict (duplicate resources)
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
