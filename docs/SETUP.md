# Charles Schwab Trading Platform - Setup Guide

This project consists of three main components:
1. **Backend** - Node.js/Express/MySQL API server
2. **Client** - React/TypeScript user-facing application
3. **Admin** - React/TypeScript admin dashboard

## Prerequisites

- Node.js (v16 or higher)
- MySQL (v8 or higher)
- npm or yarn

## Backend Setup

### 1. Configure Environment Variables

```bash
cd backend
cp .env.example .env
```

Edit `.env` and update the following:
- `JWT_SECRET` - Change to a secure random string
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - MySQL credentials

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Database

```bash
# Run migrations to create tables
npm run migrate

# Seed initial data (optional)
npm run seed
```

### 4. Start Backend Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The backend will run on `http://localhost:3001`

## Client Setup

### 1. Install Dependencies

```bash
cd charles-schwab
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

The client will run on `http://localhost:5173`

### 3. Build for Production

```bash
npm run build
```

## Admin Setup

### 1. Install Dependencies

```bash
cd schwab-admin
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

The admin panel will run on `http://localhost:5174`

### 3. Build for Production

```bash
npm run build
```

## Authentication

Both the client and admin applications now use JWT-based authentication with the backend.

### Client Authentication
- **Register**: POST `/auth/register` with `{ firstName, lastName, email, password }`
- **Login**: POST `/auth/login` with `{ email, password }`
- **Get User**: GET `/auth/me` (requires JWT token)
- Token stored in localStorage as `cs_token`

### Admin Authentication
- **Login**: POST `/auth/login` with `{ email, password }` (must be Admin role)
- Token stored in localStorage as `admin_token`

### Creating an Admin User

After seeding the database, you can create an admin user by running:

```sql
-- Connect to MySQL
mysql -u schwab_user -p schwab_db

-- Create admin user
INSERT INTO users (email, password, first_name, last_name, role, account_status, member_since)
VALUES (
  'admin@schwab.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIeWEgKK3q', -- password: admin123
  'Admin',
  'User',
  'Admin',
  'active',
  'Jan 2024'
);
```

Or use bcrypt to hash your own password:
```javascript
const bcrypt = require('bcryptjs');
const hashed = await bcrypt.hash('your_password', 12);
console.log(hashed);
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `GET /auth/me` - Get current user (authenticated)

### Users
- `GET /users` - List all users (admin only)
- `GET /users/:id` - Get user by ID
- `PATCH /users/:id` - Update user

### Wallets
- `GET /wallets?userId=:id` - Get user wallets
- `POST /wallets` - Create wallet
- `PATCH /wallets/:id` - Update wallet

### Orders
- `GET /orders?userId=:id&type=:type` - Get user orders
- `POST /orders` - Create order
- `PATCH /orders/:id` - Update order

### Deposits
- `GET /deposits` - List all deposits (admin)
- `GET /deposits?userId=:id` - Get user deposits
- `POST /deposits` - Create deposit
- `PATCH /deposits/:id` - Update deposit status

### Holdings
- `GET /holdings` - List all holdings (admin)
- `GET /holdings?userId=:id` - Get user holdings
- `POST /holdings` - Create holding
- `PATCH /holdings/:id` - Update holding

### Platform Settings
- `GET /platformSettings` - Get platform settings
- `PATCH /platformSettings/:id` - Update settings (admin)

### Platform Accounts
- `GET /platformAccounts` - List platform accounts (admin)
- `POST /platformAccounts` - Create account (admin)
- `PATCH /platformAccounts/:id` - Update account (admin)

### Admin Actions
- `GET /adminActions` - List admin actions (admin)
- `POST /adminActions` - Log admin action (admin)

## Running All Services

You can run all three services simultaneously in separate terminals:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Client
cd charles-schwab
npm run dev

# Terminal 3 - Admin
cd schwab-admin
npm run dev
```

## Troubleshooting

### Database Connection Issues
- Ensure MySQL is running
- Verify credentials in `backend/.env`
- Check if database exists: `SHOW DATABASES;`

### CORS Issues
- Backend CORS is configured to allow all origins in development
- Update `CORS_ORIGIN` in `.env` for production

### Authentication Issues
- Clear localStorage: `localStorage.clear()`
- Check JWT_SECRET is set in backend `.env`
- Verify token is being sent in Authorization header

### Port Conflicts
- Backend: Change `PORT` in `backend/.env`
- Client: Change port in `charles-schwab/package.json` dev script
- Admin: Change port in `schwab-admin/package.json` dev script

## Production Deployment

### Backend
1. Set `NODE_ENV=production` in `.env`
2. Use a process manager like PM2: `pm2 start src/server.js`
3. Setup reverse proxy with Nginx
4. Enable SSL/TLS

### Frontend (Client & Admin)
1. Build: `npm run build`
2. Serve `dist` folder with Nginx or similar
3. Configure environment-specific API URLs
4. Enable SSL/TLS

## Security Notes

- Change `JWT_SECRET` to a strong random string in production
- Use strong database passwords
- Enable HTTPS in production
- Implement rate limiting (already configured)
- Regular security updates for dependencies
- Never commit `.env` files to version control
