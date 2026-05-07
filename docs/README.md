# Charles Schwab Trading Platform

A full-stack cryptocurrency trading platform with user and admin interfaces, built with React, TypeScript, Node.js, Express, and MySQL.

## 🚀 Features

### Client Application
- User registration and JWT authentication
- Real-time market data and charts
- Cryptocurrency trading (buy/sell)
- Portfolio management
- Wallet management
- Transaction history
- Algorithmic trading bot
- Deposit/withdrawal system
- Responsive design

### Admin Dashboard
- User management
- Deposit/withdrawal approval
- Platform settings configuration
- Trading activity monitoring
- System analytics
- Admin action logging
- Platform account management

### Backend API
- RESTful API with Express.js
- JWT-based authentication
- MySQL database with connection pooling
- Input validation and sanitization
- Rate limiting
- Security headers (Helmet)
- CORS configuration
- Error handling middleware

## 📁 Project Structure

```
.
├── backend/              # Node.js/Express API server
│   ├── src/
│   │   ├── db/          # Database migrations and seeds
│   │   ├── middleware/  # Auth, validation, error handling
│   │   ├── routes/      # API endpoints
│   │   └── server.js    # Express app configuration
│   └── package.json
│
├── charles-schwab/       # Client React application
│   ├── src/
│   │   ├── api/         # API client and endpoints
│   │   ├── components/  # React components
│   │   ├── context/     # Auth context
│   │   ├── hooks/       # Custom React hooks
│   │   ├── pages/       # Page components
│   │   └── services/    # Business logic
│   └── package.json
│
├── schwab-admin/         # Admin React application
│   ├── src/
│   │   ├── api/         # API client and endpoints
│   │   ├── components/  # React components
│   │   ├── context/     # Auth context
│   │   ├── pages/       # Admin pages
│   │   └── services/    # Admin services
│   └── package.json
│
├── QUICKSTART.md         # Quick start guide
├── SETUP.md             # Detailed setup instructions
└── README-ADMIN.md      # Admin documentation
```

## 🏃 Quick Start

### Prerequisites
- Node.js v16+
- MySQL 8+
- npm or yarn

### Installation

1. **Install all dependencies:**
   ```bash
   npm run install:all
   ```

2. **Configure backend:**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Setup database:**
   ```bash
   cd backend
   npm run migrate
   npm run seed
   ```

4. **Start all services:**
   
   Open three terminals:
   
   ```bash
   # Terminal 1 - Backend
   cd backend && npm run dev
   
   # Terminal 2 - Client
   cd charles-schwab && npm run dev
   
   # Terminal 3 - Admin
   cd schwab-admin && npm run dev
   ```

5. **Access applications:**
   - Client: http://localhost:5173
   - Admin: http://localhost:5174
   - API: http://localhost:3001

For detailed instructions, see [QUICKSTART.md](./QUICKSTART.md)

## 🔐 Authentication

The platform uses JWT (JSON Web Tokens) for authentication:

- **Client users**: Register and login through the client interface
- **Admin users**: Login through the admin interface (requires Admin role)

### Default Admin Credentials
After seeding the database, create an admin user:
- Email: `admin@schwab.com`
- Password: `admin123`

⚠️ **Change these credentials in production!**

## 🛠️ Technology Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Recharts** - Data visualization
- **React Router** - Navigation

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **MySQL2** - Database driver
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **express-validator** - Input validation
- **express-rate-limit** - Rate limiting

## 📚 Documentation

- [QUICKSTART.md](./QUICKSTART.md) - Get started in minutes
- [SETUP.md](./SETUP.md) - Detailed setup and configuration
- [README-ADMIN.md](./README-ADMIN.md) - Admin dashboard guide

## 🔧 Development

### Available Scripts

From root directory:
```bash
npm run install:all    # Install all dependencies
npm run dev:backend    # Start backend server
npm run dev:client     # Start client app
npm run dev:admin      # Start admin app
npm run build:client   # Build client for production
npm run build:admin    # Build admin for production
npm run db:migrate     # Run database migrations
npm run db:seed        # Seed database with sample data
```

### Environment Variables

#### Backend (.env)
```env
PORT=3001
NODE_ENV=development
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
DB_HOST=localhost
DB_PORT=3306
DB_NAME=schwab_db
DB_USER=schwab_user
DB_PASSWORD=schwab_pass
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

#### Frontend (.env)
```env
VITE_API_URL=http://localhost:3001
```

## 🔒 Security Features

- JWT-based authentication
- Password hashing with bcrypt
- SQL injection prevention (parameterized queries)
- XSS protection (Helmet)
- CORS configuration
- Rate limiting
- Input validation and sanitization
- Secure HTTP headers

## 🚀 Deployment

### Backend
1. Set `NODE_ENV=production`
2. Use a process manager (PM2)
3. Setup reverse proxy (Nginx)
4. Enable SSL/TLS
5. Configure firewall

### Frontend
1. Build: `npm run build`
2. Serve `dist` folder
3. Configure production API URL
4. Enable SSL/TLS
5. Setup CDN (optional)

## 📝 API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `GET /auth/me` - Get current user

### Users
- `GET /users` - List users (admin)
- `GET /users/:id` - Get user
- `PATCH /users/:id` - Update user

### Wallets
- `GET /wallets` - Get wallets
- `POST /wallets` - Create wallet
- `PATCH /wallets/:id` - Update wallet

### Orders
- `GET /orders` - Get orders
- `POST /orders` - Create order
- `PATCH /orders/:id` - Update order

### Deposits
- `GET /deposits` - List deposits
- `POST /deposits` - Create deposit
- `PATCH /deposits/:id` - Update deposit

For complete API documentation, see [SETUP.md](./SETUP.md#api-endpoints)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## 📄 License

This project is licensed under the ISC License.

## 🐛 Troubleshooting

### Common Issues

**Port conflicts:**
- Change ports in respective `.env` or `package.json` files

**Database connection:**
- Verify MySQL is running
- Check credentials in `backend/.env`

**CORS errors:**
- Update `CORS_ORIGIN` in `backend/.env`

**Authentication issues:**
- Clear browser localStorage
- Verify JWT_SECRET is set
- Check token expiration

For more help, see [QUICKSTART.md](./QUICKSTART.md#common-issues)

## 📧 Support

For issues and questions:
1. Check documentation files
2. Review backend logs
3. Check browser console
4. Verify environment configuration

---

**Built with ❤️ for modern trading**
