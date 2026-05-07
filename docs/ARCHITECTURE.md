# System Architecture

## Overview

The Charles Schwab Trading Platform consists of three main components that communicate via REST API with JWT authentication.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                          │
├─────────────────────────────────┬───────────────────────────────┤
│                                 │                               │
│  ┌───────────────────────────┐  │  ┌───────────────────────┐   │
│  │   Client Application      │  │  │  Admin Application    │   │
│  │   (charles-schwab)        │  │  │  (schwab-admin)       │   │
│  │                           │  │  │                       │   │
│  │  • React + TypeScript     │  │  │  • React + TypeScript │   │
│  │  • Vite                   │  │  │  • Vite               │   │
│  │  • Tailwind CSS           │  │  │  • Tailwind CSS       │   │
│  │  • Port: 5173             │  │  │  • Port: 5174         │   │
│  │                           │  │  │                       │   │
│  │  Token: cs_token          │  │  │  Token: admin_token   │   │
│  └───────────┬───────────────┘  │  └───────────┬───────────┘   │
│              │                  │              │               │
└──────────────┼──────────────────┴──────────────┼───────────────┘
               │                                 │
               │  HTTP + JWT                     │  HTTP + JWT
               │  Authorization: Bearer <token>  │
               │                                 │
               └─────────────┬───────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND LAYER                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Express.js API Server                        │  │
│  │              (backend)                                    │  │
│  │                                                           │  │
│  │  • Node.js + Express                                     │  │
│  │  • JWT Authentication                                    │  │
│  │  • Port: 3001                                            │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────┐    │  │
│  │  │           Middleware Stack                      │    │  │
│  │  │  • Helmet (Security Headers)                    │    │  │
│  │  │  • CORS (Cross-Origin)                          │    │  │
│  │  │  • Rate Limiting                                │    │  │
│  │  │  • JWT Validation                               │    │  │
│  │  │  • Input Validation                             │    │  │
│  │  │  • Error Handler                                │    │  │
│  │  └─────────────────────────────────────────────────┘    │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────┐    │  │
│  │  │              API Routes                         │    │  │
│  │  │  • /auth          - Authentication              │    │  │
│  │  │  • /users         - User management             │    │  │
│  │  │  • /wallets       - Wallet operations           │    │  │
│  │  │  • /orders        - Trading orders              │    │  │
│  │  │  • /deposits      - Deposits/Withdrawals        │    │  │
│  │  │  • /holdings      - Portfolio holdings          │    │  │
│  │  │  • /transactions  - Transaction history         │    │  │
│  │  │  • /botTrades     - Algorithmic trading         │    │  │
│  │  │  • /marketStats   - Market data                 │    │  │
│  │  │  • /platformSettings - Platform config          │    │  │
│  │  │  • /adminActions  - Admin audit log             │    │  │
│  │  └─────────────────────────────────────────────────┘    │  │
│  └───────────────────────────┬───────────────────────────────┘  │
└────────────────────────────────┼─────────────────────────────────┘
                                 │
                                 │  MySQL Protocol
                                 │  Connection Pool
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATABASE LAYER                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    MySQL Database                         │  │
│  │                    (schwab_db)                            │  │
│  │                                                           │  │
│  │  Tables:                                                  │  │
│  │  • users              - User accounts                     │  │
│  │  • wallets            - User wallets                      │  │
│  │  • orders             - Trading orders                    │  │
│  │  • transactions       - Transaction history               │  │
│  │  • deposits           - Deposit records                   │  │
│  │  • holdings           - Portfolio holdings                │  │
│  │  • bot_settings       - Bot configurations                │  │
│  │  • bot_trades         - Bot trade history                 │  │
│  │  • trade_history      - All trades                        │  │
│  │  • market_stats       - Market data                       │  │
│  │  • platform_settings  - Platform config                   │  │
│  │  • platform_accounts  - Platform accounts                 │  │
│  │  • admin_actions      - Admin audit log                   │  │
│  │  • notifications      - System notifications              │  │
│  │  • user_notifications - User notifications                │  │
│  │  • profit_overview    - Profit/loss data                  │  │
│  │  • purchases          - Purchase history                  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Authentication Flow

```
┌──────────┐                                    ┌──────────┐
│  Client  │                                    │  Backend │
│    or    │                                    │   API    │
│  Admin   │                                    │          │
└────┬─────┘                                    └────┬─────┘
     │                                               │
     │  1. POST /auth/login                          │
     │     { email, password }                       │
     ├──────────────────────────────────────────────>│
     │                                               │
     │                                          2. Validate
     │                                          credentials
     │                                          (bcrypt)
     │                                               │
     │  3. Return JWT token                          │
     │     { success: true, token: "..." }           │
     │<──────────────────────────────────────────────┤
     │                                               │
     │  4. Store token in localStorage               │
     │     (cs_token or admin_token)                 │
     │                                               │
     │  5. Subsequent requests include token         │
     │     Authorization: Bearer <token>             │
     ├──────────────────────────────────────────────>│
     │                                               │
     │                                          6. Validate
     │                                          JWT token
     │                                               │
     │  7. Return requested data                     │
     │<──────────────────────────────────────────────┤
     │                                               │
```

## Request Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client/Admin Request                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CORS Check                              │
│  • Verify origin is allowed                                     │
│  • Check request method                                         │
│  • Validate headers                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Rate Limiting                              │
│  • Check request count per IP                                   │
│  • Enforce limits (100 req/15min)                               │
│  • Stricter limits for /auth (20 req/15min)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    JWT Authentication                           │
│  • Extract token from Authorization header                      │
│  • Verify token signature                                       │
│  • Check expiration                                             │
│  • Attach user data to request                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Role Authorization                            │
│  • Check user role (Member/Admin)                               │
│  • Verify permissions for endpoint                              │
│  • Admin-only routes require Admin role                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Input Validation                             │
│  • Validate request body                                        │
│  • Sanitize inputs                                              │
│  • Check required fields                                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Route Handler                                │
│  • Execute business logic                                       │
│  • Query database                                               │
│  • Process data                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Database Query                               │
│  • Execute SQL query (parameterized)                            │
│  • Use connection pool                                          │
│  • Handle transactions                                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Response                                     │
│  • Format response                                              │
│  • Add security headers                                         │
│  • Return JSON                                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Error Handler                                │
│  • Catch any errors                                             │
│  • Log error details                                            │
│  • Return safe error message                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### User Registration

```
Client                    Backend                   Database
  │                         │                          │
  │  POST /auth/register    │                          │
  ├────────────────────────>│                          │
  │  { firstName,           │                          │
  │    lastName,            │                          │
  │    email,               │  Check if email exists   │
  │    password }           ├─────────────────────────>│
  │                         │                          │
  │                         │<─────────────────────────┤
  │                         │  Email available         │
  │                         │                          │
  │                         │  Hash password (bcrypt)  │
  │                         │                          │
  │                         │  Insert user             │
  │                         ├─────────────────────────>│
  │                         │                          │
  │                         │<─────────────────────────┤
  │                         │  User created            │
  │                         │                          │
  │                         │  Generate JWT token      │
  │                         │                          │
  │  { success: true,       │                          │
  │    token: "...",        │                          │
  │    userId: 123 }        │                          │
  │<────────────────────────┤                          │
  │                         │                          │
  │  Store token            │                          │
  │  Fetch user details     │                          │
  │                         │                          │
```

### Trading Order

```
Client                    Backend                   Database
  │                         │                          │
  │  POST /orders           │                          │
  ├────────────────────────>│                          │
  │  Authorization: Bearer  │                          │
  │  { userId,              │  Validate JWT            │
  │    symbol,              │                          │
  │    type,                │  Validate input          │
  │    amount,              │                          │
  │    price }              │  Check user balance      │
  │                         ├─────────────────────────>│
  │                         │                          │
  │                         │<─────────────────────────┤
  │                         │  Balance sufficient      │
  │                         │                          │
  │                         │  Create order            │
  │                         ├─────────────────────────>│
  │                         │                          │
  │                         │  Update balance          │
  │                         ├─────────────────────────>│
  │                         │                          │
  │                         │  Create transaction      │
  │                         ├─────────────────────────>│
  │                         │                          │
  │                         │<─────────────────────────┤
  │                         │  All updates complete    │
  │                         │                          │
  │  { success: true,       │                          │
  │    order: {...} }       │                          │
  │<────────────────────────┤                          │
  │                         │                          │
```

### Admin User Management

```
Admin                     Backend                   Database
  │                         │                          │
  │  GET /users             │                          │
  ├────────────────────────>│                          │
  │  Authorization: Bearer  │  Validate JWT            │
  │                         │                          │
  │                         │  Check Admin role        │
  │                         │                          │
  │                         │  Query all users         │
  │                         ├─────────────────────────>│
  │                         │                          │
  │                         │<─────────────────────────┤
  │                         │  User list               │
  │                         │                          │
  │  { success: true,       │                          │
  │    data: [...] }        │                          │
  │<────────────────────────┤                          │
  │                         │                          │
  │  PATCH /users/123       │                          │
  ├────────────────────────>│                          │
  │  { balance: 5000 }      │  Validate JWT            │
  │                         │                          │
  │                         │  Check Admin role        │
  │                         │                          │
  │                         │  Update user             │
  │                         ├─────────────────────────>│
  │                         │                          │
  │                         │  Log admin action        │
  │                         ├─────────────────────────>│
  │                         │                          │
  │                         │<─────────────────────────┤
  │                         │  Update complete         │
  │                         │                          │
  │  { success: true }      │                          │
  │<────────────────────────┤                          │
  │                         │                          │
```

## Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Network Security                                      │
│  • HTTPS/TLS encryption                                         │
│  • Firewall rules                                               │
│  • DDoS protection                                              │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: Application Security                                  │
│  • CORS configuration                                           │
│  • Security headers (Helmet)                                    │
│  • Rate limiting                                                │
│  • Input validation                                             │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Authentication                                        │
│  • JWT tokens                                                   │
│  • Token expiration                                             │
│  • Secure token storage                                         │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4: Authorization                                         │
│  • Role-based access control                                    │
│  • Resource ownership validation                                │
│  • Admin-only endpoints                                         │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 5: Data Security                                         │
│  • Password hashing (bcrypt)                                    │
│  • SQL injection prevention                                     │
│  • XSS protection                                               │
│  • Encrypted database connections                               │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Load Balancer                              │
│                      (Optional)                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Reverse Proxy (Nginx)                        │
│  • SSL/TLS termination                                          │
│  • Static file serving                                          │
│  • Request routing                                              │
│  • Caching                                                      │
└────────────┬───────────────┬────────────────┬───────────────────┘
             │               │                │
             ▼               ▼                ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │   Client   │  │   Admin    │  │  Backend   │
    │   (Static) │  │  (Static)  │  │   API      │
    │            │  │            │  │            │
    │  Nginx/    │  │  Nginx/    │  │  PM2       │
    │  CDN       │  │  CDN       │  │  Node.js   │
    └────────────┘  └────────────┘  └─────┬──────┘
                                          │
                                          ▼
                                  ┌────────────┐
                                  │   MySQL    │
                                  │  Database  │
                                  │            │
                                  │  Backups   │
                                  └────────────┘
```

## Technology Stack Summary

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Charts**: Recharts
- **Routing**: React Router
- **State**: Context API

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Authentication**: JWT (jsonwebtoken)
- **Password**: bcrypt
- **Database**: MySQL2
- **Validation**: express-validator
- **Security**: Helmet, CORS
- **Rate Limiting**: express-rate-limit
- **Logging**: Morgan

### Database
- **DBMS**: MySQL 8+
- **Connection**: Connection pooling
- **Migrations**: Custom scripts
- **Backups**: Automated (recommended)

### DevOps
- **Process Manager**: PM2 (recommended)
- **Reverse Proxy**: Nginx (recommended)
- **SSL/TLS**: Let's Encrypt (recommended)
- **Monitoring**: Custom (to be implemented)

---

**Architecture designed for security, scalability, and maintainability.**
