# API Usage Examples

Complete examples for using the Client Notification & Communication System APIs.

---

## Authentication

All requests require a valid JWT token in the Authorization header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Notifications API

### 1. Get My Notifications

**Endpoint**: `GET /api/notifications`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "userId": 5,
      "projectId": 10,
      "taskId": null,
      "type": "status_change",
      "message": "Project \"Website Redesign\" status changed from planning to active",
      "metadata": {
        "oldStatus": "planning",
        "newStatus": "active"
      },
      "isRead": false,
      "createdAt": "2026-02-12T10:30:00.000Z",
      "updatedAt": "2026-02-12T10:30:00.000Z"
    }
  ]
}
```

### 2. Get Unread Count

**Endpoint**: `GET /api/notifications/unread-count`

**Response**:
```json
{
  "success": true,
  "count": 5
}
```

### 3. Mark Notification as Read

**Endpoint**: `PATCH /api/notifications/:id/read`

**Example**: `PATCH /api/notifications/1/read`

**Response**:
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

### 4. Mark All as Read

**Endpoint**: `PATCH /api/notifications/read-all`

**Response**:
```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

### 5. Create Notification (Admin Only)

**Endpoint**: `POST /api/notifications`

**Request Body**:
```json
{
  "userId": 5,
  "message": "Your project has been approved",
  "type": "general",
  "projectId": 10,
  "metadata": {
    "customField": "value"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 15,
    "userId": 5,
    "message": "Your project has been approved",
    "type": "general",
    "projectId": 10,
    "isRead": false,
    "createdAt": "2026-02-12T11:00:00.000Z"
  }
}
```

### 6. Delete Notification

**Endpoint**: `DELETE /api/notifications/:id`

**Example**: `DELETE /api/notifications/1`

**Response**:
```json
{
  "success": true,
  "message": "Notification deleted"
}
```

---

## Project Communications API

### 1. Send Message (Text Only)

**Endpoint**: `POST /api/project-communications`

**Request Body** (JSON):
```json
{
  "projectId": 10,
  "message": "Hello team, the project is progressing well!",
  "isPrivate": false
}
```

**Response**:
```json
{
  "success": true,
  "message": "Message created successfully",
  "data": {
    "id": 25,
    "projectId": 10,
    "senderId": 3,
    "message": "Hello team, the project is progressing well!",
    "attachments": [],
    "isPrivate": false,
    "createdAt": "2026-02-12T11:15:00.000Z",
    "sender": {
      "id": 3,
      "fullName": "John Doe",
      "email": "john@example.com",
      "role": "admin"
    }
  }
}
```

### 2. Send Message with Files

**Endpoint**: `POST /api/project-communications`

**Request** (multipart/form-data):
```
projectId: 10
message: "Here are the design mockups"
isPrivate: false
files: [file1.pdf, file2.jpg]
```

**cURL Example**:
```bash
curl -X POST http://localhost:5001/api/project-communications \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "projectId=10" \
  -F "message=Here are the design mockups" \
  -F "isPrivate=false" \
  -F "files=@/path/to/file1.pdf" \
  -F "files=@/path/to/file2.jpg"
```

**Response**:
```json
{
  "success": true,
  "message": "Message created successfully",
  "data": {
    "id": 26,
    "projectId": 10,
    "senderId": 3,
    "message": "Here are the design mockups",
    "attachments": [
      {
        "filename": "file1.pdf",
        "key": "communications/1707738900000-file1.pdf",
        "url": "https://s3.amazonaws.com/bucket/communications/1707738900000-file1.pdf",
        "size": 245678,
        "mimetype": "application/pdf",
        "uploadedAt": "2026-02-12T11:15:00.000Z"
      },
      {
        "filename": "file2.jpg",
        "key": "communications/1707738900001-file2.jpg",
        "url": "https://s3.amazonaws.com/bucket/communications/1707738900001-file2.jpg",
        "size": 123456,
        "mimetype": "image/jpeg",
        "uploadedAt": "2026-02-12T11:15:00.000Z"
      }
    ],
    "isPrivate": false,
    "createdAt": "2026-02-12T11:15:00.000Z",
    "sender": {
      "id": 3,
      "fullName": "John Doe",
      "email": "john@example.com",
      "role": "admin"
    }
  }
}
```

### 3. Send Private Note (Admin Only)

**Endpoint**: `POST /api/project-communications`

**Request Body**:
```json
{
  "projectId": 10,
  "message": "Private note: Client requested additional features",
  "isPrivate": true
}
```

**Response**: Same as regular message, but `isPrivate: true`

**Note**: Only admin and the client can see private notes. Managers cannot see them.

### 4. Get Project Messages

**Endpoint**: `GET /api/project-communications/project/:projectId`

**Example**: `GET /api/project-communications/project/10?page=1&limit=50`

**Query Parameters**:
- `page` (optional, default: 1)
- `limit` (optional, default: 50)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 25,
      "projectId": 10,
      "senderId": 3,
      "message": "Hello team!",
      "attachments": [],
      "isPrivate": false,
      "createdAt": "2026-02-12T11:15:00.000Z",
      "sender": {
        "id": 3,
        "fullName": "John Doe",
        "email": "john@example.com",
        "role": "admin"
      }
    },
    {
      "id": 26,
      "projectId": 10,
      "senderId": 5,
      "message": "Thanks for the update!",
      "attachments": [],
      "isPrivate": false,
      "createdAt": "2026-02-12T11:20:00.000Z",
      "sender": {
        "id": 5,
        "fullName": "Jane Client",
        "email": "jane@client.com",
        "role": "client"
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalItems": 2,
    "itemsPerPage": 50
  }
}
```

### 5. Update Message

**Endpoint**: `PATCH /api/project-communications/:id`

**Example**: `PATCH /api/project-communications/25`

**Request Body**:
```json
{
  "message": "Updated message content"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Message updated successfully",
  "data": {
    "id": 25,
    "message": "Updated message content",
    "updatedAt": "2026-02-12T11:30:00.000Z"
  }
}
```

**Note**: Only the sender can edit their own messages.

### 6. Delete Message

**Endpoint**: `DELETE /api/project-communications/:id`

**Example**: `DELETE /api/project-communications/25`

**Response**:
```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

**Note**: Only the sender or admin can delete messages.

### 7. Get Unread Message Count

**Endpoint**: `GET /api/project-communications/project/:projectId/unread-count`

**Example**: `GET /api/project-communications/project/10/unread-count`

**Response**:
```json
{
  "success": true,
  "count": 3
}
```

---

## Programmatic Usage (Backend)

### Trigger Notifications from Controllers

```javascript
const NotificationService = require('../utils/notificationService');

// In your controller method
async function updateProjectStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  
  const project = await Project.findByPk(id);
  const oldStatus = project.status;
  
  await project.update({ status });
  
  // Trigger notification
  const io = req.app.get('io');
  await NotificationService.notifyProjectStatusChange(
    id, 
    oldStatus, 
    status, 
    io
  );
  
  res.json({ success: true, data: project });
}
```

### Trigger Task Completion Notification

```javascript
async function completeTask(req, res) {
  const { id } = req.params;
  
  const task = await Task.findByPk(id);
  await task.update({ status: 'completed' });
  
  // Notify client
  const io = req.app.get('io');
  await NotificationService.notifyTaskCompletion(task, io);
  
  res.json({ success: true, data: task });
}
```

### Trigger File Upload Notification

```javascript
async function uploadProjectFile(req, res) {
  const { projectId } = req.body;
  const file = req.file;
  
  // Save file info to project
  const project = await Project.findByPk(projectId);
  await project.update({ attachment: file.location });
  
  // Notify client
  const io = req.app.get('io');
  const uploaderName = req.user.fullName;
  await NotificationService.notifyFileUpload(
    projectId, 
    file.originalname, 
    uploaderName, 
    io
  );
  
  res.json({ success: true });
}
```

### Manual Overdue Check

```javascript
const CronJobs = require('../utils/cronJobs');

// In a test route or admin endpoint
router.get('/admin/trigger-overdue-check', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  
  const io = req.app.get('io');
  const notifications = await CronJobs.triggerOverdueNotifications(io);
  
  res.json({ 
    success: true, 
    message: `Sent ${notifications.length} overdue notifications` 
  });
});
```

---

## Socket.IO Events

### Client-Side (Frontend)

```javascript
import { io } from 'socket.io-client';

// Connect to server
const socket = io('http://localhost:5001', {
  auth: {
    token: localStorage.getItem('token')
  }
});

// Join user room
socket.on('connect', () => {
  const user = JSON.parse(localStorage.getItem('user'));
  socket.emit('join', user.id);
});

// Listen for notifications
socket.on('notification', (data) => {
  console.log('New notification:', data);
  // Update UI, show toast, etc.
});

// Listen for new messages
socket.on('new_message', (data) => {
  console.log('New message in project:', data.projectId);
  // Refresh messages if on project page
});

// Handle disconnect
socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

### Server-Side (Backend)

```javascript
// Emit to specific user
io.to(`user_${userId}`).emit('notification', {
  id: 1,
  message: 'New notification',
  type: 'general',
  createdAt: new Date()
});

// Emit to multiple users
const userIds = [1, 2, 3];
userIds.forEach(userId => {
  io.to(`user_${userId}`).emit('notification', data);
});

// Broadcast to all connected clients
io.emit('system_announcement', {
  message: 'System maintenance in 1 hour'
});
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Project ID and message are required"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "You do not have access to this project"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Project not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Failed to create message",
  "error": "Detailed error message"
}
```

---

## Testing with Postman

### Setup

1. Create a new Postman collection: "HRM Notifications"
2. Add environment variables:
   - `base_url`: `http://localhost:5001`
   - `token`: Your JWT token

### Example Requests

#### Get Notifications
```
GET {{base_url}}/api/notifications
Headers:
  Authorization: Bearer {{token}}
```

#### Send Message
```
POST {{base_url}}/api/project-communications
Headers:
  Authorization: Bearer {{token}}
Body (JSON):
{
  "projectId": 10,
  "message": "Test message from Postman"
}
```

#### Upload Files
```
POST {{base_url}}/api/project-communications
Headers:
  Authorization: Bearer {{token}}
Body (form-data):
  projectId: 10
  message: "Files attached"
  files: [select files]
```

---

## Rate Limiting Recommendations

For production, consider adding rate limiting:

```javascript
const rateLimit = require('express-rate-limit');

const notificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later'
});

router.use('/api/notifications', notificationLimiter);
router.use('/api/project-communications', rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20 // 20 messages per minute
}));
```

---

## Best Practices

1. **Always check user permissions** before sending notifications
2. **Use metadata field** to store additional context
3. **Batch notifications** when possible to avoid spam
4. **Clean up old notifications** periodically
5. **Validate file uploads** (size, type, virus scan)
6. **Use transactions** for critical operations
7. **Log all notification events** for debugging
8. **Handle Socket.IO disconnections** gracefully
9. **Implement retry logic** for failed notifications
10. **Monitor notification delivery rates**

---

## Performance Tips

1. **Index database columns** used in queries (userId, projectId, isRead)
2. **Paginate results** for large datasets
3. **Cache frequently accessed data** (unread counts)
4. **Use connection pooling** for database
5. **Compress Socket.IO messages** for large payloads
6. **Implement message queues** for high-volume notifications
7. **Use CDN** for file attachments
8. **Optimize queries** with proper joins and selects

---

Happy coding! 🚀
