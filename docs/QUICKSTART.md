# Quick Start Guide

Get the Charles Schwab Trading Platform up and running in minutes.

## Prerequisites

- Node.js v16+ installed
- MySQL 8+ installed and running
- Terminal/Command prompt

## Step 1: Install All Dependencies

From the root directory:

```bash
npm run install:all
```

Or manually:

```bash
# Backend
cd backend
npm install

# Client
cd ../charles-schwab
npm install

# Admin
cd ../schwab-admin
npm install
```

## Step 2: Configure Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and update:
- `JWT_SECRET` - Set a secure random string
- `DB_*` - Update MySQL credentials if needed

## Step 3: Setup Database

```bash
cd backend

# Create database and tables
npm run migrate

# Seed with sample data (optional)
npm run seed
```

## Step 4: Create Admin User

Connect to MySQL and create an admin account:

```sql
mysql -u schwab_user -p schwab_db

INSERT INTO users (email, password, first_name, last_name, role, account_status, member_since)
VALUES (
  'admin@schwab.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIeWEgKK3q',
  'Admin',
  'User',
  'Admin',
  'active',
  'Jan 2024'
);
```

**Default Admin Credentials:**
- Email: `admin@schwab.com`
- Password: `admin123`

⚠️ **Change this password in production!**

## Step 5: Start All Services

Open **three separate terminals**:

### Terminal 1 - Backend API
```bash
cd backend
npm run dev
```
✅ Backend running at `http://localhost:3001`

### Terminal 2 - Client Application
```bash
cd charles-schwab
npm run dev
```
✅ Client running at `http://localhost:5173`

### Terminal 3 - Admin Dashboard
```bash
cd schwab-admin
npm run dev
```
✅ Admin running at `http://localhost:5174`

## Step 6: Access the Applications

### Client Application
- URL: http://localhost:5173
- Register a new user account or login
- Explore trading features

### Admin Dashboard
- URL: http://localhost:5174
- Login with admin credentials
- Manage users, deposits, settings

## Verify Everything Works

### Test Client Registration
1. Go to http://localhost:5173
2. Click "Sign Up"
3. Create a new account
4. You should be logged in automatically

### Test Admin Login
1. Go to http://localhost:5174
2. Login with `admin@schwab.com` / `admin123`
3. You should see the admin dashboard

### Test API
```bash
# Health check
curl http://localhost:3001/health

# Should return: {"success":true,"status":"ok","timestamp":"..."}
```

## Common Issues

### Port Already in Use
If ports 3001, 5173, or 5174 are in use:

**Backend:**
```bash
# Edit backend/.env
PORT=3002
```

**Client:**
```bash
# Edit charles-schwab/package.json
"dev": "vite --port 5175"
```

**Admin:**
```bash
# Edit schwab-admin/package.json
"dev": "vite --port 5176"
```

### Database Connection Failed
```bash
# Check MySQL is running
mysql --version

# Test connection
mysql -u schwab_user -p

# If user doesn't exist, create it:
mysql -u root -p
CREATE DATABASE schwab_db;
CREATE USER 'schwab_user'@'localhost' IDENTIFIED BY 'schwab_pass';
GRANT ALL PRIVILEGES ON schwab_db.* TO 'schwab_user'@'localhost';
FLUSH PRIVILEGES;
```

### CORS Errors
Make sure backend `.env` has:
```
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

### Authentication Not Working
1. Clear browser localStorage:
   ```javascript
   // In browser console
   localStorage.clear()
   ```
2. Check JWT_SECRET is set in `backend/.env`
3. Restart backend server

## Next Steps

- Read [SETUP.md](./SETUP.md) for detailed configuration
- Explore API endpoints in [SETUP.md](./SETUP.md#api-endpoints)
- Customize platform settings in admin dashboard
- Configure email notifications (if needed)
- Setup production deployment

## Development Tips

### Hot Reload
All three services support hot reload:
- Backend: Uses nodemon
- Client: Uses Vite HMR
- Admin: Uses Vite HMR

### Database Reset
```bash
cd backend
npm run migrate  # Recreates all tables
npm run seed     # Adds sample data
```

### View Logs
- Backend: Logs appear in terminal
- Client: Check browser console (F12)
- Admin: Check browser console (F12)

### API Testing
Use tools like:
- Postman
- Insomnia
- curl
- Browser DevTools Network tab

## Need Help?

Check the following files:
- [SETUP.md](./SETUP.md) - Detailed setup instructions
- [README-ADMIN.md](./README-ADMIN.md) - Admin documentation
- Backend logs in terminal
- Browser console for frontend errors

---

**Happy Trading! 🚀**
