# Quick Integration Guide

## Step-by-Step Integration

### Backend Integration (5 minutes)

1. **Run Database Migrations**
```bash
cd hrm-backend
npm run migrate
```

2. **Verify Server Startup**
```bash
npm run dev
```

You should see:
```
✅ Connected to MySQL database: hrm
✅ Server running on port 5001
✅ Cron jobs initialized
```

3. **Test Notification API**
```bash
# Get your notifications (replace with your token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5001/api/notifications
```

### Frontend Integration (10 minutes)

1. **Wrap Your App with SocketProvider**

Edit `app/(protected)/layout.tsx`:
```tsx
import { SocketProvider } from '@/context/SocketContext';

export default function ProtectedLayout({ children }) {
  return (
    <SocketProvider>
      {children}
    </SocketProvider>
  );
}
```

2. **Add Notification Bell to Header**

Edit `components/header.tsx`:
```tsx
import { NotificationBell } from '@/components/notifications/NotificationBell';

export function Header() {
  return (
    <header className="flex items-center justify-between p-4">
      <h1>HRM System</h1>
      <div className="flex items-center gap-4">
        <NotificationBell />
        {/* Other header items */}
      </div>
    </header>
  );
}
```

3. **Add Communication to Project Page**

Create or edit `app/(protected)/dashboard/projects/[id]/page.tsx`:
```tsx
'use client';

import { ProjectCommunication } from '@/components/communications/ProjectCommunication';
import { useEffect, useState } from 'react';

export default function ProjectDetailPage({ params }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
  }, []);

  if (!user) return <div>Loading...</div>;

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Project Details</h1>
      
      {/* Your existing project details */}
      
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Communication</h2>
        <ProjectCommunication 
          projectId={parseInt(params.id)} 
          userRole={user.role} 
        />
      </div>
    </div>
  );
}
```

4. **Test Real-time Notifications**

Open two browser windows:
- Window 1: Admin user
- Window 2: Client user

In Window 1 (Admin):
- Change a project status
- Upload a file to a project
- Complete a task

In Window 2 (Client):
- Watch the notification bell update in real-time
- Click the bell to see notifications
- Check the project communication

---

## Quick Test Checklist

### Backend Tests

- [ ] Migrations ran successfully
- [ ] Server starts without errors
- [ ] Socket.IO initialized
- [ ] Cron jobs initialized
- [ ] Can fetch notifications via API
- [ ] Can create project communication via API

### Frontend Tests

- [ ] Socket connects on login
- [ ] Notification bell appears in header
- [ ] Can see existing notifications
- [ ] Real-time notifications work
- [ ] Can mark notifications as read
- [ ] Project communication loads
- [ ] Can send messages
- [ ] Can upload files in messages
- [ ] Private notes work (admin only)

### Integration Tests

- [ ] Change project status → Client receives notification
- [ ] Complete task → Client receives notification
- [ ] Upload file → Client receives notification
- [ ] Send message → Other users see it in real-time
- [ ] Overdue task detection works (test manually)

---

## Common Issues & Solutions

### Issue: Socket not connecting
**Solution**: Check `.env.local` has correct `NEXT_PUBLIC_API_URL`

### Issue: Notifications not appearing
**Solution**: Verify user is logged in and token is valid

### Issue: CORS errors
**Solution**: Add your frontend URL to `allowedOrigins` in `server.js`

### Issue: File upload fails
**Solution**: Check AWS credentials in backend `.env`

### Issue: Cron job not running
**Solution**: Check server logs, test manually with trigger endpoint

---

## Manual Testing Commands

### Test Overdue Notifications
Add this route to `hrm-backend/routes/index.js`:
```javascript
router.get('/test/overdue', authenticate, async (req, res) => {
  const CronJobs = require('../utils/cronJobs');
  const io = req.app.get('io');
  const notifications = await CronJobs.triggerOverdueNotifications(io);
  res.json({ success: true, count: notifications.length });
});
```

Then call:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5001/api/test/overdue
```

### Test Socket Connection
Open browser console and run:
```javascript
// Check if socket is connected
const socket = window.io('http://localhost:5001');
socket.on('connect', () => console.log('Connected:', socket.id));
socket.on('notification', (data) => console.log('Notification:', data));
```

---

## Production Deployment

### Backend
1. Set production environment variables
2. Run migrations on production database
3. Ensure Socket.IO works with your hosting (Railway, Heroku, etc.)
4. Configure CORS for production frontend URL

### Frontend
1. Update `NEXT_PUBLIC_API_URL` to production backend URL
2. Build and deploy
3. Test Socket.IO connection in production

---

## Next Steps

1. ✅ Complete basic integration
2. ✅ Test all notification types
3. ✅ Test project communication
4. 📝 Customize notification messages
5. 📝 Add email notifications (optional)
6. 📝 Customize UI colors and styles
7. 📝 Add notification preferences

---

## Support Resources

- **Documentation**: `CLIENT_NOTIFICATION_SYSTEM.md`
- **API Endpoints**: Check routes files
- **Models**: Check models directory
- **Components**: Check components directory
- **Socket.IO Docs**: https://socket.io/docs/v4/

---

## Quick Reference

### Notification Types
- `status_change` - Blue
- `task_completed` - Green
- `overdue` - Red
- `file_upload` - Purple
- `task_assigned` - Yellow
- `general` - Gray

### User Roles
- `admin` - Full access, can create private notes
- `manager` - Can manage projects, cannot see private notes
- `client` - Can view their projects and communicate
- `employee` - Can view assigned tasks

### Socket Events
- `notification` - New notification
- `new_message` - New project message
- `join` - Join user room

---

Congratulations! Your Client Notification & Communication System is now integrated. 🎉
