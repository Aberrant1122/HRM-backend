# Authentication System Documentation

This document outlines the authentication system implemented in the HRM application.

## Features

- Role-based access control (Admin, Manager, Employee)
- Secure password hashing with bcrypt
- JWT-based authentication
- Email invitation system for new employees
- Password reset functionality
- Account activation flow
- Protected routes with role-based middleware

## Setup

1. Copy `.env.example` to `.env` and update the values:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   npm install bcryptjs jsonwebtoken nodemailer
   ```

3. Run database migrations:
   ```bash
   npx sequelize-cli db:migrate
   ```

4. Seed the database with an admin user:
   ```bash
   npx sequelize-cli db:seed:all
   ```

## Authentication Flow

### Admin User Creation
1. The first admin is created via database seed
2. Default admin credentials:
   - Email: admin@company.com
   - Password: Admin@123

### Employee Invitation Flow
1. Admin invites an employee by providing their email and role
2. System sends an invitation email with a secure link
3. Employee clicks the link and sets their password
4. Account is activated and can be used to log in

### Password Reset Flow
1. User requests a password reset with their email
2. System sends a reset link to the email
3. User clicks the link and sets a new password
4. Password is updated and user can log in with new credentials

## API Endpoints

### Public Endpoints

- `POST /api/auth/login` - User login
- `POST /api/auth/request-password-reset` - Request password reset
- `POST /api/auth/set-password` - Set new password (with valid token)

### Protected Endpoints (Require Authentication)

#### Employee & Admin
- `GET /api/employee/*` - Employee dashboard routes

#### Admin Only
- `POST /api/auth/invite-employee` - Invite a new employee
- `GET /api/admin/*` - Admin dashboard routes

## Security Considerations

- Passwords are hashed using bcrypt
- JWT tokens expire after 8 hours
- Password reset tokens expire after 1 hour
- Account activation links expire after 24 hours
- Sensitive routes are protected by role-based middleware
- Rate limiting should be implemented on authentication endpoints
- All API responses follow a consistent error format

## Environment Variables

See `.env.example` for all required environment variables.

## Testing

To test the authentication flow:

1. Log in as admin
2. Invite a new employee
3. Check the email (or console logs) for the invitation link
4. Set a password for the new user
5. Log in with the new user credentials
