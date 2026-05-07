# Charles Schwab Admin Panel - Complete Implementation Guide

## ✅ What's Been Built

### 1. Project Structure
```
schwab-admin/
├── src/
│   ├── api/
│   │   ├── client.ts ✅
│   │   └── endpoints.ts ✅
│   ├── services/
│   │   ├── authService.ts ✅
│   │   ├── userService.ts ✅
│   │   ├── depositService.ts ✅
│   │   ├── purchaseService.ts ✅
│   │   └── platformService.ts ✅
│   ├── context/
│   │   └── AuthContext.tsx ✅
│   ├── components/
│   │   └── layout/
│   │       ├── AdminSidebar.tsx ✅
│   │       ├── AdminHeader.tsx ✅
│   │       └── AdminLayout.tsx ✅
│   ├── types/
│   │   └── index.ts ✅
│   ├── pages/ (TO BUILD)
│   ├── main.tsx ✅
│   ├── index.css ✅
│   └── App.tsx (TO BUILD)
├── package.json ✅
├── vite.config.ts ✅
├── tailwind.config.js ✅
└── tsconfig.json ✅
```

### 2. Shared Server
- **Location:** `/server/db.json`
- **Port:** 3001
- **Extended Schema:**
  - Added banking fields to users
  - Added `platformAccounts` collection
  - Added `adminActions` audit log
  - Added `platformSettings` collection
  - Changed deposits/withdrawals/purchases to `status: "pending"`
  - Added `rejectionReason` field

### 3. Admin Services (All Complete)
- **authService**: Admin login with role check
- **userService**: Get all users, update user, adjust balance, suspend/activate
- **depositService**: Approve/reject deposits and withdrawals with balance updates
- **purchaseService**: Approve/reject buy orders with holdings management
- **platformService**: Manage platform bank accounts and settings

---

## 📋 What Needs to Be Built

### Pages (8 files)

**1. Login Page** (`schwab-admin/src/pages/Login.tsx`)
- Email/password form
- Admin role validation
- Redirect to dashboard on success

**2. Dashboard** (`schwab-admin/src/pages/Dashboard.tsx`)
- Stats cards: Total Users, Pending Deposits, Pending Withdrawals, Pending Orders, Total Platform Balance
- Recent activity feed (last 10 admin actions)
- Quick links to approval queues

**3. Users Page** (`schwab-admin/src/pages/Users.tsx`)
- Table: ID, Name, Email, Role, Balance, Status, Actions
- Search by name/email
- Click row → User Detail modal
- Actions: View, Suspend, Activate

**4. User Detail Modal** (`schwab-admin/src/pages/UserDetail.tsx`)
- User info + banking details
- Balance adjustment form
- Holdings table
- Transaction history
- Suspend/Activate button

**5. Deposits Page** (`schwab-admin/src/pages/Deposits.tsx`)
- Filter: All / Pending / Completed / Rejected
- Table: Deposit ID, User, Amount, Method, Date, Status, Actions
- Click pending row → Approval modal showing:
  - User's deposit account info
  - Platform account info (where they send TO)
  - Approve/Reject buttons

**6. Withdrawals Page** (`schwab-admin/src/pages/Withdrawals.tsx`)
- Same structure as Deposits
- Approval modal shows user's withdrawal account (where to send TO)
- Approve deducts balance, Reject keeps balance

**7. Orders Page** (`schwab-admin/src/pages/Orders.tsx`)
- Filter: All / Pending / Completed / Cancelled
- Table: Order ID, User, Asset, Type, Quantity, Total Cost, Date, Status, Actions
- Approval modal shows asset details + user balance
- Approve creates holding + deducts balance

**8. Platform Accounts Page** (`schwab-admin/src/pages/PlatformAccounts.tsx`)
- Table of admin's bank accounts
- Add/Edit/Delete accounts
- Set default account

**9. Settings Page** (`schwab-admin/src/pages/Settings.tsx`)
- Form to edit platform settings:
  - Min/max deposit amounts
  - Min/max withdrawal amounts
  - Trading fee %
  - Enable/disable deposits, withdrawals, trading
  - KYC requirement toggle
  - Maintenance mode toggle

**10. App.tsx** (`schwab-admin/src/App.tsx`)
- Routes:
  - `/admin/login` → Login
  - `/admin/dashboard` → Dashboard (protected)
  - `/admin/users` → Users (protected)
  - `/admin/deposits` → Deposits (protected)
  - `/admin/withdrawals` → Withdrawals (protected)
  - `/admin/orders` → Orders (protected)
  - `/admin/accounts` → PlatformAccounts (protected)
  - `/admin/settings` → Settings (protected)
- Auth guard: redirect to login if not authenticated

---

## 🔄 User App Updates Needed

### 1. Update Deposit Service (`charles-schwab/src/services/depositService.ts`)
Change `status: 'completed'` to `status: 'pending'` in both `createDeposit` and `createWithdraw`.
Remove the balance update logic (admin will do it on approval).

### 2. Update Buy Service (`charles-schwab/src/services/holdingService.ts`)
Change `status: 'completed'` to `status: 'pending'` in `buyAsset`.
Remove the balance deduction and holding creation logic (admin will do it on approval).

### 3. Update Deposit/Withdraw Modal (`charles-schwab/src/components/dashboard/DepositWithdrawModal.tsx`)
After successful submission, show:
- "Your deposit request has been submitted for approval."
- "Please transfer funds to: [Platform Account Details]"
- "Reference: [Deposit TX ID]"

### 4. Update Buy Modal (`charles-schwab/src/components/dashboard/BuyModal.tsx`)
After successful submission, show:
- "Your buy order has been submitted for approval."
- "You will be notified once approved."

### 5. Add Banking Info Form to Settings (`charles-schwab/src/pages/user/Settings.tsx`)
Add a "Banking" tab with forms for:
- Deposit Account (where they send FROM)
- Withdrawal Account (where they want money TO)

---

## 🚀 How to Run

### Terminal 1: Start JSON Server
```bash
cd server
npm install
npm start
```
Server runs on http://localhost:3001

### Terminal 2: Start User App
```bash
cd charles-schwab
npm install
npm run dev
```
User app runs on http://localhost:5173

### Terminal 3: Start Admin Panel
```bash
cd schwab-admin
npm install
npm run dev
```
Admin panel runs on http://localhost:5174

---

## 🔐 Login Credentials

**User App:**
- Email: `demo@schwab.com`
- Password: `demo1234`
- Role: Admin (can access both user and admin panels)

**Admin Panel:**
- Email: `admin@schwab.com`
- Password: `admin1234`
- Role: Admin

---

## 📊 Complete Flow

### Deposit Flow
1. **User:** Submits deposit request → status "pending"
2. **User:** Sees message: "Transfer $X to [Platform Account]. Reference: DEP-12345"
3. **Admin:** Sees pending deposit in queue
4. **Admin:** Clicks Approve → balance credited, status "completed"
5. **User:** Balance updates, gets notification

### Withdrawal Flow
1. **User:** Submits withdrawal request → status "pending", balance NOT deducted
2. **Admin:** Sees pending withdrawal with user's bank account details
3. **Admin:** Clicks Approve → balance deducted, status "completed"
4. **Admin:** Manually sends money to user's bank
5. **User:** Gets notification

### Buy Flow
1. **User:** Submits buy order → status "pending", balance NOT deducted
2. **Admin:** Sees pending order in queue
3. **Admin:** Clicks Approve → holding created/updated, balance deducted, status "completed"
4. **User:** Sees asset in portfolio, gets notification

---

## 🎯 Next Steps

1. Build the 10 pages listed above
2. Update user app services to use "pending" status
3. Update user app modals to show pending messages
4. Add banking info form to user Settings
5. Test the complete flow end-to-end

---

## 📝 Notes

- All admin actions are logged in `adminActions` collection
- Platform accounts are stored in `platformAccounts` collection
- Platform settings are stored in `platformSettings` collection
- Admin panel uses same tech stack as user app (Vite + React + TypeScript + Tailwind)
- Both apps share the same JSON server on port 3001
