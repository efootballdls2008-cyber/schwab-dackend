# Deployment Checklist

Use this checklist to ensure everything is properly configured before deploying.

## Pre-Deployment

### Backend Configuration
- [ ] `.env` file created from `.env.example`
- [ ] `JWT_SECRET` set to a strong random string (min 32 characters)
- [ ] `NODE_ENV` set to `production`
- [ ] Database credentials configured
- [ ] `CORS_ORIGIN` set to production URLs
- [ ] Rate limiting configured appropriately
- [ ] All dependencies installed (`npm install`)

### Database Setup
- [ ] MySQL server running
- [ ] Database created
- [ ] Migrations run (`npm run migrate`)
- [ ] Seed data loaded (if needed) (`npm run seed`)
- [ ] Admin user created (`npm run create-admin`)
- [ ] Database backups configured
- [ ] Connection pooling tested

### Client Application
- [ ] `.env` file created with production API URL
- [ ] All dependencies installed (`npm install`)
- [ ] Build successful (`npm run build`)
- [ ] Environment variables correct
- [ ] Assets optimized
- [ ] Service worker configured (if using PWA)

### Admin Application
- [ ] `.env` file created with production API URL
- [ ] All dependencies installed (`npm install`)
- [ ] Build successful (`npm run build`)
- [ ] Environment variables correct
- [ ] Assets optimized

## Security Checklist

### Backend Security
- [ ] JWT_SECRET is strong and unique
- [ ] Passwords hashed with bcrypt (12+ rounds)
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS protection enabled (Helmet)
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints
- [ ] Error messages don't leak sensitive info
- [ ] HTTPS enabled
- [ ] Security headers configured

### Frontend Security
- [ ] API URL uses HTTPS
- [ ] No sensitive data in localStorage
- [ ] XSS prevention in place
- [ ] CSRF protection (if needed)
- [ ] Content Security Policy configured
- [ ] Secure cookies (if using)

### Database Security
- [ ] Strong database passwords
- [ ] Database user has minimal privileges
- [ ] Remote access restricted
- [ ] Backups encrypted
- [ ] Connection uses SSL/TLS

## Testing Checklist

### Backend Tests
- [ ] Health endpoint responds (`/health`)
- [ ] Authentication endpoints work
  - [ ] Register new user
  - [ ] Login with valid credentials
  - [ ] Login fails with invalid credentials
  - [ ] JWT token validation works
  - [ ] Token expiration works
- [ ] Protected endpoints require authentication
- [ ] Admin endpoints require Admin role
- [ ] Rate limiting triggers correctly
- [ ] Error handling works
- [ ] Database queries execute correctly

### Client Tests
- [ ] Registration flow works
- [ ] Login flow works
- [ ] Logout clears tokens
- [ ] Protected routes redirect to login
- [ ] API calls include Authorization header
- [ ] 401 errors handled (redirect to login)
- [ ] Token refresh works (if implemented)
- [ ] All pages load correctly
- [ ] Forms validate input
- [ ] Error messages display properly

### Admin Tests
- [ ] Admin login works
- [ ] Non-admin users cannot access
- [ ] All admin pages load
- [ ] User management works
- [ ] Deposit approval works
- [ ] Settings update works
- [ ] Admin actions logged
- [ ] Data displays correctly

### Integration Tests
- [ ] Client can communicate with backend
- [ ] Admin can communicate with backend
- [ ] CORS allows both origins
- [ ] WebSocket connections work (if using)
- [ ] File uploads work (if using)
- [ ] Email notifications work (if using)

## Performance Checklist

### Backend Performance
- [ ] Database queries optimized
- [ ] Indexes created on frequently queried columns
- [ ] Connection pooling configured
- [ ] Response times acceptable (<200ms for most endpoints)
- [ ] Memory usage monitored
- [ ] CPU usage monitored
- [ ] Logging configured (not too verbose)

### Frontend Performance
- [ ] Bundle size optimized (<500KB initial)
- [ ] Code splitting implemented
- [ ] Images optimized
- [ ] Lazy loading implemented
- [ ] Caching configured
- [ ] CDN configured (if using)
- [ ] Lighthouse score >90

## Monitoring & Logging

### Backend Monitoring
- [ ] Error logging configured
- [ ] Access logging configured
- [ ] Performance monitoring setup
- [ ] Uptime monitoring configured
- [ ] Alert system configured
- [ ] Log rotation configured
- [ ] Database monitoring setup

### Frontend Monitoring
- [ ] Error tracking configured (e.g., Sentry)
- [ ] Analytics configured (if needed)
- [ ] Performance monitoring setup
- [ ] User session tracking (if needed)

## Deployment Steps

### Backend Deployment
1. [ ] Build/prepare application
2. [ ] Upload to server
3. [ ] Install dependencies
4. [ ] Configure environment variables
5. [ ] Run database migrations
6. [ ] Start application with process manager (PM2)
7. [ ] Configure reverse proxy (Nginx)
8. [ ] Enable SSL/TLS
9. [ ] Configure firewall
10. [ ] Test all endpoints
11. [ ] Monitor logs for errors

### Frontend Deployment
1. [ ] Build application (`npm run build`)
2. [ ] Upload `dist` folder to server/CDN
3. [ ] Configure web server (Nginx)
4. [ ] Enable SSL/TLS
5. [ ] Configure caching headers
6. [ ] Test all pages
7. [ ] Verify API connectivity
8. [ ] Check browser console for errors

## Post-Deployment

### Immediate Checks
- [ ] All services running
- [ ] Health checks passing
- [ ] SSL certificates valid
- [ ] DNS configured correctly
- [ ] Monitoring active
- [ ] Backups running
- [ ] Logs being written

### User Acceptance Testing
- [ ] Create test user account
- [ ] Test complete user flow
- [ ] Test admin functions
- [ ] Test on multiple browsers
- [ ] Test on mobile devices
- [ ] Test error scenarios
- [ ] Verify email notifications (if using)

### Documentation
- [ ] API documentation updated
- [ ] User guide updated
- [ ] Admin guide updated
- [ ] Deployment notes documented
- [ ] Known issues documented
- [ ] Rollback plan documented

## Rollback Plan

If deployment fails:

1. [ ] Identify the issue
2. [ ] Check logs for errors
3. [ ] Revert to previous version if needed
4. [ ] Restore database backup if needed
5. [ ] Notify users of downtime
6. [ ] Document what went wrong
7. [ ] Fix issues before redeploying

## Maintenance Schedule

### Daily
- [ ] Check error logs
- [ ] Monitor uptime
- [ ] Check disk space
- [ ] Verify backups completed

### Weekly
- [ ] Review performance metrics
- [ ] Check for security updates
- [ ] Review user feedback
- [ ] Test backup restoration

### Monthly
- [ ] Update dependencies
- [ ] Review and rotate logs
- [ ] Security audit
- [ ] Performance optimization
- [ ] Database maintenance

## Emergency Contacts

Document key contacts:
- [ ] DevOps team
- [ ] Database administrator
- [ ] Security team
- [ ] Hosting provider support
- [ ] Domain registrar support

## Production URLs

Document all production URLs:
- [ ] Backend API: `https://api.yourdomain.com`
- [ ] Client App: `https://app.yourdomain.com`
- [ ] Admin Panel: `https://admin.yourdomain.com`
- [ ] Database: `db.yourdomain.com:3306`

## Credentials Storage

Ensure all credentials are securely stored:
- [ ] Database passwords in secure vault
- [ ] JWT secrets in secure vault
- [ ] API keys in secure vault
- [ ] SSL certificates backed up
- [ ] Admin passwords documented securely

---

## Sign-off

- [ ] Developer sign-off
- [ ] QA sign-off
- [ ] Security sign-off
- [ ] Product owner sign-off
- [ ] Operations sign-off

**Deployment Date:** _______________

**Deployed By:** _______________

**Version:** _______________

---

**Ready for production! 🚀**
