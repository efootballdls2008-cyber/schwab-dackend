# Charles Schwab — Node.js / Express / MySQL Backend

## Stack
- **Node.js** + **Express** — REST API
- **MySQL 8** — persistent storage
- **Docker Compose** — containerised dev environment
- **bcryptjs** — password hashing
- **jsonwebtoken** — JWT auth
- **express-validator** — input validation
- **helmet** + **cors** + **rate-limit** — security

---

## Quick Start (Docker)

```bash
cd backend

# 1. Copy env
cp .env.example .env          # edit values if needed

# 2. Start MySQL + API containers
docker-compose up --build

# 3. Seed initial data (first run only)
docker exec schwab_api node src/db/seed.js
```

API is available at **http://localhost:3001**

---

## Quick Start (Local)

```bash
cd backend
npm install

# Make sure MySQL is running and matches .env values
node src/db/migrate.js   # create tables
node src/db/seed.js      # seed data

npm run dev              # nodemon hot-reload
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Server port |
| `NODE_ENV` | `development` | Environment |
| `JWT_SECRET` | — | **Change in production** |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `schwab_db` | Database name |
| `DB_USER` | `schwab_user` | DB user |
| `DB_PASSWORD` | `schwab_pass` | DB password |
| `DB_ROOT_PASSWORD` | `rootpassword` | MySQL root (Docker) |
| `RATE_LIMIT_MAX` | `100` | Requests per window |

---

## API Endpoints

All endpoints return `{ success: true, data: ... }` or `{ success: false, message: "..." }`.

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register new user |
| POST | `/auth/login` | — | Login, returns JWT |
| GET | `/auth/me` | ✅ | Current user profile |

### Users
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users` | Admin | All users |
| GET | `/users/:id` | ✅ | Get user |
| PATCH | `/users/:id` | ✅ | Update user |
| DELETE | `/users/:id` | Admin | Delete user |

### Wallets
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/wallets?userId=` | ✅ | User wallets |
| POST | `/wallets` | ✅ | Create wallet |
| PATCH | `/wallets/:id` | ✅ | Update wallet |

### Orders
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/orders?userId=&type=` | ✅ | User orders |
| POST | `/orders` | ✅ | Create order |
| PATCH | `/orders/:id` | ✅ | Update status |

### Transactions
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/transactions?userId=` | ✅ | User transactions |
| POST | `/transactions` | ✅ | Create transaction |

### Trade History
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tradeHistory?userId=` | ✅ | Trade history |
| POST | `/tradeHistory` | ✅ | Add trade |

### Bot Trades
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/botTrades?userId=` | ✅ | Bot trades |
| GET | `/botTrades/:id` | ✅ | Single bot trade |
| POST | `/botTrades` | ✅ | Create bot trade |
| PATCH | `/botTrades/:id` | ✅ | Update bot trade |

### Bot Settings
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/botSettings?userId=` | ✅ | Bot settings |
| GET | `/botSettings/:id` | ✅ | Single setting |
| PATCH | `/botSettings/:id` | ✅ | Update settings |

### Market Stats
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/marketStats` | ✅ | Market data |

### Deposits / Withdrawals
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/deposits` | Admin | All deposits |
| GET | `/deposits?userId=` | ✅ | User deposits |
| POST | `/deposits` | ✅ | Create deposit/withdrawal |
| PATCH | `/deposits/:id` | Admin | Approve / reject |

### Holdings
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/holdings` | Admin | All holdings |
| GET | `/holdings?userId=` | ✅ | User holdings |
| GET | `/holdings/:id` | ✅ | Single holding |
| POST | `/holdings` | ✅ | Create holding |
| PATCH | `/holdings/:id` | ✅ | Update holding |

### Profit Overview
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/profitOverview?userId=` | ✅ | Profit data |
| POST | `/profitOverview` | ✅ | Add profit data |

### Purchases
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/purchases` | Admin | All purchases |
| GET | `/purchases?userId=` | ✅ | User purchases |
| POST | `/purchases` | ✅ | Create purchase |
| PATCH | `/purchases/:id` | Admin | Approve / reject |

### Notifications
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/notifications?userId=` | ✅ | Notifications |
| GET | `/notifications/:id` | ✅ | Single notification |
| POST | `/notifications` | Admin | Create notification |
| PATCH | `/notifications/:id` | ✅ | Mark read |
| GET | `/userNotifications?userId=` | ✅ | User notifications |
| GET | `/userNotifications/:id` | ✅ | Single |
| POST | `/userNotifications` | Admin | Create |
| PATCH | `/userNotifications/:id` | ✅ | Mark read |

### Platform Settings
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/platformSettings` | ✅ | Get settings |
| PATCH | `/platformSettings` | Admin | Update settings |

### Platform Accounts
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/platformAccounts` | ✅ | All accounts |
| POST | `/platformAccounts` | Admin | Create account |
| PATCH | `/platformAccounts/:id` | Admin | Update account |
| DELETE | `/platformAccounts/:id` | Admin | Delete account |

### Admin Actions
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/adminActions` | Admin | Audit log |
| POST | `/adminActions` | Admin | Log action |

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Server health check |

---

## Authentication

Include the JWT in every protected request:

```
Authorization: Bearer <token>
```

---

## Default Credentials (after seed)

| Email | Password | Role |
|---|---|---|
| admin@schwab.com | admin1234 | Admin |
| demo@schwab.com | demo1234 | Member |
