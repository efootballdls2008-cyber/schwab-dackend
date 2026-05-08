# Testing Script for Error Fixes

This document provides step-by-step testing procedures to verify all error fixes are working correctly.

---

## Prerequisites

1. Backend server running on `http://localhost:3001`
2. Database running and connected
3. Valid user token and admin token
4. Tools: `curl` or Postman

### Get Tokens

```bash
# Login as user
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
# Save the token as USER_TOKEN

# Login as admin
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
# Save the token as ADMIN_TOKEN
```

---

## Test 1: Health Check with Database Status

### Test Case: Database Connected
```bash
curl http://localhost:3001/health
```

**Expected Response:**
```json
{
  "success": true,
  "status": "ok",
  "db": "connected",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Test Case: Database Disconnected
```bash
# Stop database
docker-compose stop mysql

# Test health endpoint
curl http://localhost:3001/health
```

**Expected Response:**
```json
{
  "success": false,
  "status": "error",
  "db": "disconnected",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status:** ✅ Pass / ❌ Fail

---

## Test 2: Deposit Creation and Approval (Critical Fix)

### Test Case: Create Deposit
```bash
curl -X POST http://localhost:3001/deposits \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "type": "deposit",
    "method": "Bank Transfer",
    "amount": 1000,
    "currency": "USD",
    "txId": "TEST-TX-001"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "user_id": 1,
    "type": "deposit",
    "amount": 1000,
    "status": "pending",
    ...
  }
}
```

### Test Case: Approve Deposit (Tests Missing Imports Fix)
```bash
# Use the deposit ID from previous response
curl -X PATCH http://localhost:3001/deposits/123 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "status": "completed",
    ...
  }
}
```

**Expected Behavior:**
- ✅ No crash (previously would crash with "createUserNotification is not defined")
- ✅ User balance updated
- ✅ Notification created
- ✅ Email sent (check logs for "[Email Error]" if email service is down)

**Status:** ✅ Pass / ❌ Fail

---

## Test 3: Withdrawal with Insufficient Balance

### Test Case: Attempt Withdrawal > Balance
```bash
# Assuming user has $1000 balance
curl -X POST http://localhost:3001/deposits \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "type": "withdraw",
    "method": "Bank Transfer",
    "amount": 5000,
    "txId": "TEST-TX-002"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Insufficient balance for withdrawal"
}
```

**Status:** ✅ Pass / ❌ Fail

---

## Test 4: Withdrawal with Sufficient Balance

### Test Case: Valid Withdrawal
```bash
curl -X POST http://localhost:3001/deposits \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "type": "withdraw",
    "method": "Bank Transfer",
    "amount": 100,
    "txId": "TEST-TX-003"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": 124,
    "type": "withdraw",
    "amount": 100,
    "status": "pending",
    ...
  }
}
```

### Test Case: Approve Withdrawal
```bash
curl -X PATCH http://localhost:3001/deposits/124 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed"
  }'
```

**Expected Behavior:**
- ✅ Balance deducted correctly
- ✅ No crash
- ✅ Notification sent

**Status:** ✅ Pass / ❌ Fail

---

## Test 5: Concurrent Balance Updates (Race Condition Test)

### Test Case: Simultaneous Deposit Approvals

**Setup:**
```bash
# Create 3 deposits
for i in {1..3}; do
  curl -X POST http://localhost:3001/deposits \
    -H "Authorization: Bearer $USER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": 1,
      \"type\": \"deposit\",
      \"method\": \"Test\",
      \"amount\": 100,
      \"txId\": \"RACE-TEST-$i\"
    }"
done
```

**Test:**
```bash
# Approve all 3 simultaneously (run in parallel)
curl -X PATCH http://localhost:3001/deposits/125 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}' &

curl -X PATCH http://localhost:3001/deposits/126 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}' &

curl -X PATCH http://localhost:3001/deposits/127 \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}' &

wait
```

**Verification:**
```bash
# Check user balance
curl http://localhost:3001/users/1 \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Expected Behavior:**
- ✅ Balance increased by exactly $300 (not more, not less)
- ✅ All 3 deposits marked as completed
- ✅ No database errors

**Status:** ✅ Pass / ❌ Fail

---

## Test 6: Admin Role Checking (Case Insensitive)

### Test Case: Admin with 'Admin' role
```bash
# Login with role='Admin'
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Use token to access admin endpoint
curl http://localhost:3001/users \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [...]
}
```

### Test Case: Admin with 'admin' role (lowercase)
```bash
# If you have a user with lowercase 'admin' role, test with that token
curl http://localhost:3001/users \
  -H "Authorization: Bearer $LOWERCASE_ADMIN_TOKEN"
```

**Expected Behavior:**
- ✅ Both 'Admin' and 'admin' roles work
- ✅ No 403 Forbidden errors

**Status:** ✅ Pass / ❌ Fail

---

## Test 7: Email Service Failure Handling

### Test Case: Email Service Down

**Setup:**
```bash
# Temporarily break email service by setting wrong credentials in .env
# Or mock the email service to throw errors
```

**Test:**
```bash
# Register new user (triggers welcome email)
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User"
  }'
```

**Expected Behavior:**
- ✅ User created successfully (status 201)
- ✅ Token returned
- ✅ No crash
- ✅ Error logged: `[Email Error]` in console
- ✅ Request completes normally

**Status:** ✅ Pass / ❌ Fail

---

## Test 8: Socket Service Failure Handling

### Test Case: Socket Service Down

**Setup:**
```bash
# Stop socket service or disconnect socket.io
```

**Test:**
```bash
# Mark notification as read (triggers socket emission)
curl -X PATCH http://localhost:3001/notifications/1 \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isRead": true}'
```

**Expected Behavior:**
- ✅ Notification updated successfully
- ✅ No crash
- ✅ Error logged: `[Socket Error]` in console
- ✅ Request completes normally

**Status:** ✅ Pass / ❌ Fail

---

## Test 9: Notification Creation Failure

### Test Case: Notification Service Error

**Test:**
```bash
# Create order (triggers notification)
curl -X POST http://localhost:3001/orders \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "type": "buy",
    "coin": "BTC",
    "price": 50000,
    "amount": 0.1,
    "total": 5000
  }'
```

**Expected Behavior:**
- ✅ Order created successfully
- ✅ If notification fails, error logged: `[Notification Error]`
- ✅ Request completes normally

**Status:** ✅ Pass / ❌ Fail

---

## Test 10: Input Validation

### Test Case: Missing Required Fields
```bash
curl -X POST http://localhost:3001/deposits \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "type": "deposit"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [...]
}
```

### Test Case: Invalid Data Types
```bash
curl -X POST http://localhost:3001/deposits \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "not-a-number",
    "type": "deposit",
    "method": "Test",
    "amount": -100,
    "txId": "TEST"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [...]
}
```

**Status:** ✅ Pass / ❌ Fail

---

## Test 11: Authorization Checks

### Test Case: No Token
```bash
curl http://localhost:3001/users
```

**Expected Response:**
```json
{
  "success": false,
  "message": "No token provided"
}
```

### Test Case: Invalid Token
```bash
curl http://localhost:3001/users \
  -H "Authorization: Bearer invalid-token-123"
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

### Test Case: User Accessing Admin Endpoint
```bash
curl http://localhost:3001/users \
  -H "Authorization: Bearer $USER_TOKEN"
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Admin access required"
}
```

**Status:** ✅ Pass / ❌ Fail

---

## Test 12: Error Response Format

### Test Case: All Errors Return Consistent Format

**Test various error scenarios and verify response format:**

```bash
# 401 Unauthorized
curl http://localhost:3001/users
# Expected: { "success": false, "message": "..." }

# 403 Forbidden
curl http://localhost:3001/users -H "Authorization: Bearer $USER_TOKEN"
# Expected: { "success": false, "message": "..." }

# 404 Not Found
curl http://localhost:3001/users/99999 -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: { "success": false, "message": "..." }

# 422 Validation Error
curl -X POST http://localhost:3001/deposits \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": 1}'
# Expected: { "success": false, "message": "...", "errors": [...] }

# 500 Internal Error
# (Trigger by causing database error)
# Expected: { "success": false, "message": "..." }
```

**Expected Behavior:**
- ✅ All errors have `success: false`
- ✅ All errors have `message` field
- ✅ No sensitive information exposed
- ✅ Consistent JSON format

**Status:** ✅ Pass / ❌ Fail

---

## Summary Checklist

After running all tests, verify:

- [ ] Health check includes database status
- [ ] Deposit approval works without crashes
- [ ] Withdrawal validation prevents overdraft
- [ ] Concurrent operations don't cause race conditions
- [ ] Admin role checking is case-insensitive
- [ ] Email service failures don't crash requests
- [ ] Socket service failures don't crash requests
- [ ] Notification failures don't crash requests
- [ ] Input validation works correctly
- [ ] Authorization checks work correctly
- [ ] Error responses are consistent
- [ ] All errors are logged with context
- [ ] No sensitive information in error responses

---

## Automated Test Script

Save this as `test-fixes.sh`:

```bash
#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3001"
USER_EMAIL="user@example.com"
USER_PASSWORD="password123"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="admin123"

# Get tokens
echo "Getting tokens..."
USER_TOKEN=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}" \
  | jq -r '.token')

ADMIN_TOKEN=$(curl -s -X POST $API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | jq -r '.token')

# Test 1: Health Check
echo -e "\n${GREEN}Test 1: Health Check${NC}"
HEALTH=$(curl -s $API_URL/health | jq -r '.db')
if [ "$HEALTH" = "connected" ]; then
  echo -e "${GREEN}✓ Database connected${NC}"
else
  echo -e "${RED}✗ Database not connected${NC}"
fi

# Test 2: Withdrawal Validation
echo -e "\n${GREEN}Test 2: Withdrawal Validation${NC}"
RESPONSE=$(curl -s -X POST $API_URL/deposits \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "type": "withdraw",
    "method": "Test",
    "amount": 999999,
    "txId": "TEST-OVERDRAFT"
  }')
MESSAGE=$(echo $RESPONSE | jq -r '.message')
if [[ "$MESSAGE" == *"Insufficient balance"* ]]; then
  echo -e "${GREEN}✓ Withdrawal validation working${NC}"
else
  echo -e "${RED}✗ Withdrawal validation failed${NC}"
fi

# Test 3: Admin Access
echo -e "\n${GREEN}Test 3: Admin Access${NC}"
RESPONSE=$(curl -s $API_URL/users \
  -H "Authorization: Bearer $ADMIN_TOKEN")
SUCCESS=$(echo $RESPONSE | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo -e "${GREEN}✓ Admin access working${NC}"
else
  echo -e "${RED}✗ Admin access failed${NC}"
fi

# Test 4: User Cannot Access Admin Endpoint
echo -e "\n${GREEN}Test 4: User Authorization${NC}"
RESPONSE=$(curl -s $API_URL/users \
  -H "Authorization: Bearer $USER_TOKEN")
SUCCESS=$(echo $RESPONSE | jq -r '.success')
if [ "$SUCCESS" = "false" ]; then
  echo -e "${GREEN}✓ User authorization working${NC}"
else
  echo -e "${RED}✗ User authorization failed${NC}"
fi

echo -e "\n${GREEN}Tests completed!${NC}"
```

**Usage:**
```bash
chmod +x test-fixes.sh
./test-fixes.sh
```

---

## Monitoring in Production

After deployment, monitor for these log patterns:

```bash
# Check for errors
tail -f logs/app.log | grep -E "\[Email Error\]|\[Socket Error\]|\[Notification Error\]"

# Check for crashes
tail -f logs/app.log | grep -E "ReferenceError|TypeError|UnhandledPromiseRejection"

# Check health endpoint
watch -n 10 'curl -s http://localhost:3001/health | jq'
```

---

## Rollback Plan

If issues are found after deployment:

1. **Immediate:** Revert to previous version
2. **Check logs:** Identify specific error
3. **Fix locally:** Test fix thoroughly
4. **Deploy fix:** With additional monitoring
5. **Verify:** Run all tests again
