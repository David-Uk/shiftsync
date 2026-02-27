# ShiftSync

A Next.js application for shift management with user authentication and profile management.

## Features

- User authentication with JWT tokens
- Role-based access control (admin, manager, user)
- User profile management with image upload
- Input sanitization and validation
- Database connection optimization
- Cloudinary image integration

## Environment Variables

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

## Installation

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables as described above

3. Run development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login

### Users (Admin only)

- `GET /api/users` - Get all users
- `POST /api/users` - Create new user (supports multipart/form-data for image upload)
- `PUT /api/users/[id]` - Update user (supports multipart/form-data for image upload)
- `DELETE /api/users/[id]` - Archive user
- `PATCH /api/users/[id]/unarchive` - Unarchive user

## Image Upload

Profile images are automatically uploaded to Cloudinary when creating or updating users with `multipart/form-data` requests. The API accepts:

- `profileImage` (File) - Image file (JPG, PNG, GIF, WebP, max 5MB)
- Other user fields as form data

## Security Features

- Input sanitization for all user inputs
- JWT-based authentication
- Role-based authorization
- Password hashing with bcrypt
- Image validation and processing
- Database connection optimization

## Database Schema

The User model includes:

- Basic user information (name, email, password)
- Role-based permissions
- Profile image URL (Cloudinary)
- Archive status
- Timestamps

## Development

The application uses:

- Next.js 16 with TypeScript
- MongoDB with Mongoose
- Cloudinary for image storage
- JWT for authentication
- bcrypt for password hashing

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
