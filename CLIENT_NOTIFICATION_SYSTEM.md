# Client Notification & Communication System

## Overview

A comprehensive real-time notification and communication system for clients in the HRM application. This system enables seamless communication between admins, managers, and clients with real-time updates via Socket.IO.

---

## Features Implemented

### 1. Client Notifications

#### Notification Types:
- **Status Change** - When project status changes (e.g., Planning → Active → Completed)
- **Task Completed** - When a task is marked as completed
- **Overdue Alerts** - Automatic detection of overdue tasks
- **File Upload** - When files are uploaded to projects
- **Task Assigned** - When tasks are assigned to users
- **General** - Generic notifications

#### Notification Triggers:
- Project status updates
- Task completion
- File uploads to projects
- Automated daily cron job for overdue tasks (runs at 9:00 AM)

### 2. Project Communication

#### Features:
- Real-time messaging within projects
- File attachments support (multiple files)
- Private notes (Admin ↔ Client only)
- Role-based access control
- Real-time updates via Socket.IO

#### Access Control:
- **Admin**: Full access, can create private notes
- **Manager**: Can comment, cannot see private notes
- **Client**: Can view and comment on their projects, cannot see private notes

---

## Backend Implementation

### Database Schema

#### Enhanced Notifications Table
```sql
- id (INTEGER, PRIMARY KEY)
- userId (INTEGER, FOREIGN KEY → users.id)
- projectId (INTEGER, FOREIGN KEY → projects.id, NULLABLE)
- taskId (INTEGER, FOREIGN KEY → tasks.id, NULLABLE)
- type (ENUM: status_change, task_completed, overdue, file_upload, task_assigned, general)
- message (STRING)
- metadata (JSON) - Additional data like old/new status, file names
- isRead (BOOLEAN, DEFAULT false)
- createdAt (TIMESTAMP)
- updatedAt (TIMESTAMP)
```

#### ProjectCommunications Table
```sql
- id (INTEGER, PRIMARY KEY)
- projectId (INTEGER, FOREIGN KEY → projects.id)
- senderId (INTEGER, FOREIGN KEY → users.id)
- message (TEXT)
- attachments (JSON) - Array of file objects
- isPrivate (BOOLEAN, DEFAULT false)
- isActive (BOOLEAN, DEFAULT true)
- createdAt (TIMESTAMP)
- updatedAt (TIMESTAMP)
```

### API Endpoints

#### Notifications
```
GET    /api/notifications                    - Get user's notifications
GET    /api/notifications/unread-count       - Get unread count
POST   /api/notifications                    - Create notification (admin)
PATCH  /api/notifications/:id/read           - Mark as read
PATCH  /api/notifications/read-all           - Mark all as read
DELETE /api/notifications/:id                - Delete notification
```

#### Project Communications
```
POST   /api/project-communications                      - Create message
GET    /api/project-communications/project/:projectId   - Get project messages
GET    /api/project-communications/project/:projectId/unread-count
PATCH  /api/project-communications/:id                  - Update message
DELETE /api/project-communications/:id                  - Delete message
```

### Models

#### Notification Model
Location: `hrm-backend/models/notification.js`
- Enhanced with projectId, type, and metadata fields
- Associations: User, Task, Project

#### ProjectCommunication Model
Location: `hrm-backend/models/projectCommunication.js`
- Handles project-level messaging
- Associations: Project, User (sender)

### Controllers

#### NotificationController
Location: `hrm-backend/controllers/notificationController.js`
- Manages CRUD operations for notifications
- Handles read/unread status

#### ProjectCommunicationController
Location: `hrm-backend/controllers/projectCommunicationController.js`
- Manages project messages
- Handles file attachments
- Enforces access control

### Services

#### NotificationService
Location: `hrm-backend/utils/notificationService.js`

Key Methods:
- `createNotification(data, io)` - Create and emit notification
- `notifyProjectStatusChange(projectId, oldStatus, newStatus, io)`
- `notifyTaskCompletion(task, io)`
- `notifyOverdueTask(task, io)`
- `notifyFileUpload(projectId, fileName, uploadedBy, io)`
- `notifyOverdueTasks(io)` - Batch notify for all overdue tasks

#### CronJobs
Location: `hrm-backend/utils/cronJobs.js`

Scheduled Tasks:
- Daily at 9:00 AM: Check and notify overdue tasks
- Can be manually triggered for testing

### Socket.IO Integration

Real-time events:
- `notification` - New notification received
- `new_message` - New project message received

User rooms: `user_{userId}` for targeted notifications

---

## Frontend Implementation

### Components

#### NotificationBell
Location: `human-resource-management/components/notifications/NotificationBell.tsx`

Features:
- Bell icon with unread count badge
- Dropdown with notification list
- Mark as read / Mark all as read
- Auto-refresh on new notifications

#### NotificationItem
Location: `human-resource-management/components/notifications/NotificationItem.tsx`

Features:
- Color-coded by notification type
- Click to navigate to related project/task
- Time ago display
- Unread indicator

#### ProjectCommunication
Location: `human-resource-management/components/communications/ProjectCommunication.tsx`

Features:
- Real-time messaging
- File attachments (multiple)
- Private notes toggle (admin only)
- Auto-scroll to latest message
- Sender info with role badge

### Context & Hooks

#### SocketContext
Location: `human-resource-management/context/SocketContext.tsx`

Provides:
- Socket.IO connection management
- Auto-reconnection
- User room joining

#### useNotifications Hook
Location: `human-resource-management/hooks/useNotifications.ts`

Provides:
- `notifications` - Array of notifications
- `unreadCount` - Number of unread notifications
- `loading` - Loading state
- `markAsRead(id)` - Mark single notification as read
- `markAllAsRead()` - Mark all as read
- `refetch()` - Manually refresh notifications

Real-time features:
- Listens for Socket.IO events
- Shows toast on new notification
- Auto-updates notification list

---

## Installation & Setup

### Backend

1. **Install Dependencies**
```bash
cd hrm-backend
npm install node-cron
```

2. **Run Migrations**
```bash
npm run migrate
```

This will create:
- Enhanced Notifications table
- ProjectCommunications table

3. **Environment Variables**
Ensure these are set in `.env`:
```env
PORT=5001
FRONTEND_URL=http://localhost:3000
AWS_S3_BUCKET=your-bucket
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
```

4. **Start Server**
```bash
npm run dev
```

Socket.IO will be available on the same port as Express.

### Frontend

1. **Install Dependencies** (already installed)
```bash
cd human-resource-management
# socket.io-client is already in package.json
```

2. **Environment Variables**
Create/update `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5001
```

3. **Integrate Components**

Add SocketProvider to your layout:
```tsx
// app/layout.tsx or app/(protected)/layout.tsx
import { SocketProvider } from '@/context/SocketContext';

export default function Layout({ children }) {
  return (
    <SocketProvider>
      {children}
    </SocketProvider>
  );
}
```

Add NotificationBell to your header:
```tsx
// components/header.tsx
import { NotificationBell } from '@/components/notifications/NotificationBell';

export function Header() {
  return (
    <header>
      {/* ... other header content ... */}
      <NotificationBell />
    </header>
  );
}
```

Add ProjectCommunication to project detail page:
```tsx
// app/(protected)/dashboard/projects/[id]/page.tsx
import { ProjectCommunication } from '@/components/communications/ProjectCommunication';

export default function ProjectDetailPage({ params }) {
  const user = // get user from context/session
  
  return (
    <div>
      {/* ... project details ... */}
      <ProjectCommunication 
        projectId={params.id} 
        userRole={user.role} 
      />
    </div>
  );
}
```

---

## Usage Examples

### Creating Notifications Programmatically

```javascript
const NotificationService = require('./utils/notificationService');

// In your controller
const io = req.app.get('io');

// Notify project status change
await NotificationService.notifyProjectStatusChange(
  projectId, 
  'planning', 
  'active', 
  io
);

// Notify task completion
await NotificationService.notifyTaskCompletion(task, io);

// Notify file upload
await NotificationService.notifyFileUpload(
  projectId, 
  'document.pdf', 
  'John Doe', 
  io
);
```

### Manual Overdue Check

```javascript
const CronJobs = require('./utils/cronJobs');

// Trigger manually (e.g., in a route for testing)
const notifications = await CronJobs.triggerOverdueNotifications(io);
console.log(`Sent ${notifications.length} notifications`);
```

### Frontend Usage

```tsx
// Using the notification hook
import { useNotifications } from '@/hooks/useNotifications';

function MyComponent() {
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead 
  } = useNotifications();

  return (
    <div>
      <p>Unread: {unreadCount}</p>
      {notifications.map(n => (
        <div key={n.id} onClick={() => markAsRead(n.id)}>
          {n.message}
        </div>
      ))}
    </div>
  );
}
```

---

## Security Considerations

1. **Authentication**: All endpoints require valid JWT token
2. **Authorization**: 
   - Clients can only see their own notifications
   - Clients can only access their project communications
   - Managers cannot see private admin-client notes
3. **File Uploads**: Validated and stored in S3 with proper access controls
4. **Socket.IO**: Authenticated connections with user-specific rooms

---

## Testing

### Test Notification Creation
```bash
# Using curl or Postman
POST http://localhost:5001/api/notifications
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "userId": 5,
  "message": "Test notification",
  "type": "general"
}
```

### Test Project Communication
```bash
POST http://localhost:5001/api/project-communications
Authorization: Bearer <token>
Content-Type: multipart/form-data

projectId: 1
message: "Hello from the API"
files: [file1.pdf, file2.jpg]
```

### Test Overdue Notifications
```bash
# Add a route in your server for testing:
GET http://localhost:5001/api/test/overdue-notifications
```

---

## Troubleshooting

### Socket.IO Not Connecting
1. Check CORS settings in `server.js`
2. Verify `NEXT_PUBLIC_API_URL` in frontend `.env.local`
3. Check browser console for connection errors
4. Ensure Socket.IO is initialized before server starts

### Notifications Not Appearing
1. Check if user is logged in and token is valid
2. Verify Socket.IO connection in browser dev tools
3. Check if user has joined their room (`user_{userId}`)
4. Verify notification was created in database

### Cron Job Not Running
1. Check server logs for cron initialization message
2. Verify cron schedule syntax
3. Test manually using `CronJobs.triggerOverdueNotifications(io)`

### File Uploads Failing
1. Verify AWS credentials in `.env`
2. Check S3 bucket permissions
3. Verify multer-s3 middleware is configured
4. Check file size limits

---

## Future Enhancements

1. **Email Notifications**: Send email for critical notifications
2. **Push Notifications**: Browser push notifications
3. **Notification Preferences**: Let users customize notification types
4. **Read Receipts**: Track when messages are read
5. **Typing Indicators**: Show when someone is typing
6. **Message Reactions**: Add emoji reactions to messages
7. **Search**: Search through messages and notifications
8. **Pagination**: Implement infinite scroll for messages
9. **Message Editing**: Allow users to edit their messages
10. **Notification Grouping**: Group similar notifications

---

## Support

For issues or questions:
1. Check this documentation
2. Review server logs
3. Check browser console
4. Verify database migrations ran successfully
5. Test API endpoints with Postman/curl

---

## License

This feature is part of the HRM system and follows the same license.
