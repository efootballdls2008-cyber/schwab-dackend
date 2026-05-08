# Testing Notification System

## Quick Test Guide

### 1. Test Welcome Notification (Registration)

**Steps:**
1. Start the backend server:
   ```bash
   cd /Users/mac/Sites/tee-sites/dart/project/schwab-dackend
   npm start
   ```

2. Register a new user via API or frontend:
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "testuser@example.com",
       "password": "password123",
       "firstName": "John",
       "lastName": "Doe"
     }'
   ```

3. Expected notifications for the new user:
   - ✅ "Welcome to Charles Schwab Trading Platform! 🎉"
   - ✅ "Starting Balance Credited" (if enabled in platform settings)
   - ✅ "Welcome Bonus Received" (if enabled in platform settings)

4. Expected admin notification:
   - ✅ "New User Registered" - John Doe (testuser@example.com) just created an account.

### 2. Test Welcome Back Notification (Login)

**Steps:**
1. Login with an existing user:
   ```bash
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "testuser@example.com",
       "password": "password123"
     }'
   ```

2. Expected user notification:
   - ✅ "Welcome Back! 👋" - Hi John! You've successfully logged in...

3. Expected admin notification (for non-admin users):
   - ✅ "User Login" - John Doe (testuser@example.com) logged in.

### 3. Test Deposit Notifications

**Steps:**
1. Submit a deposit request (requires authentication token):
   ```bash
   curl -X POST http://localhost:5000/api/deposits \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     -d '{
       "userId": 1,
       "type": "deposit",
       "method": "Bank Transfer",
       "amount": 1000,
       "txId": "TXN123456"
     }'
   ```

2. Expected user notification:
   - ✅ "Deposit Request Submitted"

3. Expected admin notification:
   - ✅ "New Deposit Request"

4. Admin approves the deposit:
   ```bash
   curl -X PATCH http://localhost:5000/api/deposits/1 \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer ADMIN_TOKEN_HERE" \
     -d '{
       "status": "completed"
     }'
   ```

5. Expected user notification:
   - ✅ "Deposit Approved"

### 4. Check Notifications via API

**Get user notifications:**
```bash
curl -X GET "http://localhost:5000/api/notifications?userId=1" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Get unread count:**
```bash
curl -X GET "http://localhost:5000/api/notifications/unread-count?userId=1" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Get admin notifications:**
```bash
curl -X GET "http://localhost:5000/api/adminNotifications" \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

### 5. Test Real-Time Updates (Socket.io)

**Frontend Test:**
1. Open the frontend application
2. Open browser console
3. Register or login
4. Watch for real-time notification updates in the UI
5. Check the notification bell icon for unread count

**Socket Events to Monitor:**
- `notification:new` - New notification received
- `notification:updated` - Notification marked as read
- `notification:allRead` - All notifications marked as read
- `notification:deleted` - Notification deleted

### 6. Test Mark as Read

**Mark single notification as read:**
```bash
curl -X PATCH http://localhost:5000/api/notifications/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "isRead": true
  }'
```

**Mark all as read:**
```bash
curl -X PATCH "http://localhost:5000/api/notifications/mark-all-read?userId=1" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 7. Test Delete Notification

```bash
curl -X DELETE http://localhost:5000/api/notifications/1 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Verification Checklist

### User Notifications
- [ ] Welcome notification on registration
- [ ] Welcome back notification on login
- [ ] Starting balance notification (if applicable)
- [ ] Welcome bonus notification (if applicable)
- [ ] Deposit request submitted
- [ ] Deposit approved/rejected
- [ ] Withdrawal request submitted
- [ ] Withdrawal approved/rejected
- [ ] Order placed
- [ ] Order filled/cancelled
- [ ] Trade executed
- [ ] Bot trade opened/closed
- [ ] Balance updated
- [ ] KYC submitted/approved/rejected

### Admin Notifications
- [ ] New user registered
- [ ] User login
- [ ] New deposit request
- [ ] New withdrawal request
- [ ] New buy order
- [ ] KYC submission

### Real-Time Features
- [ ] Notifications appear instantly without page refresh
- [ ] Unread count updates in real-time
- [ ] Mark as read updates immediately
- [ ] Delete removes notification instantly
- [ ] Multiple tabs/windows stay in sync

### UI/UX
- [ ] Notification bell icon shows unread count
- [ ] Notifications panel displays all notifications
- [ ] Newest notifications appear first
- [ ] Unread notifications are visually distinct
- [ ] Click to mark as read works
- [ ] Delete button works
- [ ] Mark all as read works
- [ ] Notification types have appropriate icons/colors

## Troubleshooting

### Notifications not appearing?
1. Check backend logs for errors
2. Verify Socket.io connection is established
3. Check browser console for WebSocket errors
4. Verify user is authenticated
5. Check database for notification records

### Real-time updates not working?
1. Verify Socket.io server is running
2. Check CORS settings
3. Verify JWT token is valid
4. Check Socket.io connection in browser DevTools
5. Verify user is in correct socket room

### Database issues?
1. Check if notification tables exist:
   ```sql
   SHOW TABLES LIKE '%notification%';
   ```
2. Verify table structure:
   ```sql
   DESCRIBE user_notifications;
   DESCRIBE admin_notifications;
   ```

## Performance Notes

- Notifications are created asynchronously (non-blocking)
- Failed notification creation doesn't crash the main request
- Socket.io rooms ensure notifications only go to intended recipients
- Database queries are optimized with proper indexes
- Old notifications can be archived/deleted periodically

## Security Notes

- Authentication required for all notification endpoints
- Users can only access their own notifications
- Admin role required for admin notifications
- Proper authorization checks prevent unauthorized access
- SQL injection protection via parameterized queries
