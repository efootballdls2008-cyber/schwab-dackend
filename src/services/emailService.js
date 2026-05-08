/**
 * Email Service
 * Handles all email notifications for the platform using Resend
 */
const { Resend } = require('resend');
const pool = require('../db/pool');

class EmailService {
  constructor() {
    this.resend = null;
    this.initialized = false;
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@schwab-trading.com';
    this.fromName = process.env.EMAIL_FROM_NAME || 'Charles Schwab Trading Platform';
    this.adminEmail = process.env.ADMIN_EMAIL || 'admin@schwab-trading.com';
  }

  /**
   * Initialize Resend client
   */
  initialize() {
    if (this.initialized) return;

    const emailEnabled = process.env.EMAIL_ENABLED === 'true';
    if (!emailEnabled) {
      console.log('[EmailService] Email notifications disabled');
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[EmailService] RESEND_API_KEY is not set — email will not be sent');
      return;
    }

    try {
      this.resend = new Resend(apiKey);
      this.initialized = true;
      console.log('[EmailService] Resend email service initialized successfully');
    } catch (error) {
      console.error('[EmailService] Failed to initialize Resend:', error.message);
    }
  }

  /**
   * Send email via Resend
   */
  async sendEmail({ to, subject, html, text }) {
    if (!this.initialized || !this.resend) {
      console.log('[EmailService] Email not sent - service not initialized');
      return { success: false, error: 'Email service not initialized' };
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to,
        subject,
        html,
        text: text || this.stripHtml(html),
      });

      if (error) {
        throw new Error(error.message || JSON.stringify(error));
      }

      await this.logEmail({
        recipient: to,
        subject,
        status: 'sent',
        messageId: data.id,
      });

      return { success: true, messageId: data.id };
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error.message);

      await this.logEmail({
        recipient: to,
        subject,
        status: 'failed',
        error: error.message,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Log email to database
   */
  async logEmail({ recipient, subject, status, messageId = null, error = null }) {
    try {
      await pool.query(
        `INSERT INTO email_logs (recipient, subject, status, message_id, error_message)
         VALUES (?, ?, ?, ?, ?)`,
        [recipient, subject, status, messageId, error]
      );
    } catch (err) {
      console.error('[EmailService] Failed to log email:', err.message);
    }
  }

  /**
   * Strip HTML tags for plain text version
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Get user email and preferences
   */
  async getUserEmailInfo(userId) {
    try {
      const [[user]] = await pool.query(
        `SELECT email, first_name, last_name, email_notifications_enabled 
         FROM users WHERE id = ?`,
        [userId]
      );
      return user;
    } catch (error) {
      console.error('[EmailService] Failed to get user info:', error.message);
      return null;
    }
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(userId, userEmail = null, firstName = null) {
    const user = userEmail ? { email: userEmail, first_name: firstName } : await this.getUserEmailInfo(userId);
    if (!user || !user.email) return;

    const html = this.getWelcomeEmailTemplate(user.first_name);

    return await this.sendEmail({
      to: user.email,
      subject: 'Welcome to Charles Schwab Trading Platform! 🎉',
      html,
    });
  }

  /**
   * Send deposit notification
   */
  async sendDepositNotification(userId, amount, status, method, rejectionReason = null) {
    const user = await this.getUserEmailInfo(userId);
    if (!user || !user.email || user.email_notifications_enabled === false) return;

    let subject, html;
    const formattedAmount = `$${parseFloat(amount).toFixed(2)}`;

    if (status === 'pending') {
      subject = 'Deposit Request Received';
      html = this.getDepositPendingTemplate(user.first_name, formattedAmount, method);
    } else if (status === 'completed') {
      subject = 'Deposit Approved - Funds Available';
      html = this.getDepositApprovedTemplate(user.first_name, formattedAmount, method);
    } else if (status === 'rejected') {
      subject = 'Deposit Request Rejected';
      html = this.getDepositRejectedTemplate(user.first_name, formattedAmount, method, rejectionReason);
    }

    return await this.sendEmail({ to: user.email, subject, html });
  }

  /**
   * Send withdrawal notification
   */
  async sendWithdrawalNotification(userId, amount, status, method, rejectionReason = null) {
    const user = await this.getUserEmailInfo(userId);
    if (!user || !user.email || user.email_notifications_enabled === false) return;

    let subject, html;
    const formattedAmount = `$${parseFloat(amount).toFixed(2)}`;

    if (status === 'pending') {
      subject = 'Withdrawal Request Received';
      html = this.getWithdrawalPendingTemplate(user.first_name, formattedAmount, method);
    } else if (status === 'completed') {
      subject = 'Withdrawal Approved - Processing';
      html = this.getWithdrawalApprovedTemplate(user.first_name, formattedAmount, method);
    } else if (status === 'rejected') {
      subject = 'Withdrawal Request Rejected';
      html = this.getWithdrawalRejectedTemplate(user.first_name, formattedAmount, method, rejectionReason);
    }

    return await this.sendEmail({ to: user.email, subject, html });
  }

  /**
   * Send buy order notification
   */
  async sendBuyOrderNotification(userId, coin, amount, price, total, status) {
    const user = await this.getUserEmailInfo(userId);
    if (!user || !user.email || user.email_notifications_enabled === false) return;

    let subject, html;
    const formattedPrice = `$${parseFloat(price).toFixed(2)}`;
    const formattedTotal = `$${parseFloat(total).toFixed(2)}`;

    if (status === 'open') {
      subject = `Buy Order Placed - ${coin}`;
      html = this.getBuyOrderPlacedTemplate(user.first_name, coin, amount, formattedPrice, formattedTotal);
    } else if (status === 'filled') {
      subject = `Buy Order Filled - ${coin}`;
      html = this.getBuyOrderFilledTemplate(user.first_name, coin, amount, formattedPrice, formattedTotal);
    } else if (status === 'cancelled') {
      subject = `Buy Order Cancelled - ${coin}`;
      html = this.getBuyOrderCancelledTemplate(user.first_name, coin, amount, formattedPrice, formattedTotal);
    }

    return await this.sendEmail({ to: user.email, subject, html });
  }

  /**
   * Send admin notification
   */
  async sendAdminNotification(title, message, type, relatedId = null) {
    const html = this.getAdminNotificationTemplate(title, message, type, relatedId);

    return await this.sendEmail({
      to: this.adminEmail,
      subject: `[Admin Alert] ${title}`,
      html,
    });
  }

  // ============ EMAIL TEMPLATES ============

  getEmailWrapper(content) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #0066cc 0%, #004999 100%); color: #ffffff; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .content { padding: 30px 20px; }
    .content h2 { color: #0066cc; margin-top: 0; font-size: 20px; }
    .content p { margin: 15px 0; color: #555; }
    .highlight-box { background: #f8f9fa; border-left: 4px solid #0066cc; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .button { display: inline-block; padding: 12px 30px; background: #0066cc; color: #ffffff; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: 600; }
    .button:hover { background: #0052a3; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #e0e0e0; }
    .footer a { color: #0066cc; text-decoration: none; }
    .amount { font-size: 24px; font-weight: bold; color: #0066cc; }
    .status-badge { display: inline-block; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .status-success { background: #d4edda; color: #155724; }
    .status-pending { background: #fff3cd; color: #856404; }
    .status-error { background: #f8d7da; color: #721c24; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Charles Schwab Trading Platform</h1>
    </div>
    ${content}
    <div class="footer">
      <p>This is an automated message from Charles Schwab Trading Platform.</p>
      <p>If you have any questions, please contact our support team.</p>
      <p><a href="#">Unsubscribe</a> | <a href="#">Privacy Policy</a> | <a href="#">Terms of Service</a></p>
      <p>&copy; ${new Date().getFullYear()} Charles Schwab Trading Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
  }

  getWelcomeEmailTemplate(firstName) {
    const content = `
    <div class="content">
      <h2>Welcome Aboard, ${firstName}! 🎉</h2>
      <p>Thank you for joining Charles Schwab Trading Platform. We're thrilled to have you as part of our trading community!</p>
      
      <div class="highlight-box">
        <strong>Get Started:</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Complete your profile and KYC verification</li>
          <li>Explore our market overview and trading tools</li>
          <li>Make your first deposit to start trading</li>
          <li>Enable our AI-powered trading bot for automated trading</li>
        </ul>
      </div>

      <p>Our platform offers:</p>
      <ul style="color: #555;">
        <li>Real-time market data and analytics</li>
        <li>Secure and fast transactions</li>
        <li>24/7 customer support</li>
        <li>Advanced trading tools and features</li>
      </ul>

      <center>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" class="button">Go to Dashboard</a>
      </center>

      <p>If you need any assistance, our support team is available 24/7 to help you.</p>
      <p>Happy Trading!</p>
    </div>`;
    return this.getEmailWrapper(content);
  }

  getDepositPendingTemplate(firstName, amount, method) {
    const content = `
    <div class="content">
      <h2>Deposit Request Received</h2>
      <p>Hi ${firstName},</p>
      <p>We've received your deposit request and it's currently being reviewed by our team.</p>
      
      <div class="highlight-box">
        <p style="margin: 5px 0;"><strong>Amount:</strong> <span class="amount">${amount}</span></p>
        <p style="margin: 5px 0;"><strong>Method:</strong> ${method}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span class="status-badge status-pending">Pending Review</span></p>
      </div>

      <p>Your deposit will be processed within 24 hours. You'll receive another email once it's approved and the funds are available in your account.</p>
      
      <center>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/wallet" class="button">View Wallet</a>
      </center>
    </div>`;
    return this.getEmailWrapper(content);
  }

  getDepositApprovedTemplate(firstName, amount, method) {
    const content = `
    <div class="content">
      <h2>Deposit Approved! ✅</h2>
      <p>Hi ${firstName},</p>
      <p>Great news! Your deposit has been approved and the funds are now available in your account.</p>
      
      <div class="highlight-box">
        <p style="margin: 5px 0;"><strong>Amount:</strong> <span class="amount">${amount}</span></p>
        <p style="margin: 5px 0;"><strong>Method:</strong> ${method}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span class="status-badge status-success">Completed</span></p>
      </div>

      <p>You can now use these funds to start trading or invest in your favorite assets.</p>
      
      <center>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" class="button">Start Trading</a>
      </center>
    </div>`;
    return this.getEmailWrapper(content);
  }

  getDepositRejectedTemplate(firstName, amount, method, reason) {
    const content = `
    <div class="content">
      <h2>Deposit Request Rejected</h2>
      <p>Hi ${firstName},</p>
      <p>Unfortunately, your deposit request could not be processed.</p>
      
      <div class="highlight-box">
        <p style="margin: 5px 0;"><strong>Amount:</strong> <span class="amount">${amount}</span></p>
        <p style="margin: 5px 0;"><strong>Method:</strong> ${method}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span class="status-badge status-error">Rejected</span></p>
        ${reason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${reason}</p>` : ''}
      </div>

      <p>If you believe this is an error or need assistance, please contact our support team.</p>
      
      <center>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/support" class="button">Contact Support</a>
      </center>
    </div>`;
    return this.getEmailWrapper(content);
  }

  getWithdrawalPendingTemplate(firstName, amount, method) {
    const content = `
    <div class="content">
      <h2>Withdrawal Request Received</h2>
      <p>Hi ${firstName},</p>
      <p>We've received your withdrawal request and it's currently being reviewed by our team.</p>
      
      <div class="highlight-box">
        <p style="margin: 5px 0;"><strong>Amount:</strong> <span class="amount">${amount}</span></p>
        <p style="margin: 5px 0;"><strong>Method:</strong> ${method}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span class="status-badge status-pending">Pending Review</span></p>
      </div>

      <p>Your withdrawal will be processed within 24-48 hours. You'll receive another email once it's approved.</p>
      
      <center>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/wallet" class="button">View Wallet</a>
      </center>
    </div>`;
    return this.getEmailWrapper(content);
  }

  getWithdrawalApprovedTemplate(firstName, amount, method) {
    const content = `
    <div class="content">
      <h2>Withdrawal Approved! ✅</h2>
      <p>Hi ${firstName},</p>
      <p>Your withdrawal request has been approved and is being processed.</p>
      
      <div class="highlight-box">
        <p style="margin: 5px 0;"><strong>Amount:</strong> <span class="amount">${amount}</span></p>
        <p style="margin: 5px 0;"><strong>Method:</strong> ${method}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span class="status-badge status-success">Approved</span></p>
      </div>

      <p>The funds will be transferred to your account within 2-5 business days depending on your payment method.</p>
      
      <center>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/wallet" class="button">View Wallet</a>
      </center>
    </div>`;
    return this.getEmailWrapper(content);
  }

  getWithdrawalRejectedTemplate(firstName, amount, method, reason) {
    const content = `
    <div class="content">
      <h2>Withdrawal Request Rejected</h2>
      <p>Hi ${firstName},</p>
      <p>Unfortunately, your withdrawal request could not be processed.</p>
      
      <div class="highlight-box">
        <p style="margin: 5px 0;"><strong>Amount:</strong> <span class="amount">${amount}</span></p>
        <p style="margin: 5px 0;"><strong>Method:</strong> ${method}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span class="status-badge status-error">Rejected</span></p>
        ${reason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${reason}</p>` : ''}
      </div>

      <p>If you believe this is an error or need assistance, please contact our support team.</p>
      
      <center>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/support" class="button">Contact Support</a>
      </center>
    </div>`;
    return this.getEmailWrapper(content);
  }

  getBuyOrderPlacedTemplate(firstName, coin, amount, price, total) {
    const content = `
    <div class="content">
      <h2>Buy Order Placed - ${coin}</h2>
      <p>Hi ${firstName},</p>
      <p>Your buy order has been successfully placed and is now open.</p>
      
      <div class="highlight-box">
        <p style="margin: 5px 0;"><strong>Asset:</strong> ${coin}</p>
        <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount}</p>
        <p style="margin: 5px 0;"><strong>Price:</strong> ${price}</p>
        <p style="margin: 5px 0;"><strong>Total:</strong> <span class="amount">${total}</span></p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span class="status-badge status-pending">Open</span></p>
      </div>

      <p>Your order is being processed and will be executed shortly. You'll receive another notification once it's filled.</p>
      
      <center>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/orders" class="button">View Orders</a>
      </center>
    </div>`;
    return this.getEmailWrapper(content);
  }

  getBuyOrderFilledTemplate(firstName, coin, amount, price, total) {
    const content = `
    <div class="content">
      <h2>Buy Order Filled - ${coin} ✅</h2>
      <p>Hi ${firstName},</p>
      <p>Congratulations! Your buy order has been successfully filled.</p>
      
      <div class="highlight-box">
        <p style="margin: 5px 0;"><strong>Asset:</strong> ${coin}</p>
        <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount}</p>
        <p style="margin: 5px 0;"><strong>Price:</strong> ${price}</p>
        <p style="margin: 5px 0;"><strong>Total:</strong> <span class="amount">${total}</span></p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span class="status-badge status-success">Filled</span></p>
      </div>

      <p>The ${coin} has been added to your portfolio. You can view your holdings in your dashboard.</p>
      
      <center>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/portfolio" class="button">View Portfolio</a>
      </center>
    </div>`;
    return this.getEmailWrapper(content);
  }

  getBuyOrderCancelledTemplate(firstName, coin, amount, price, total) {
    const content = `
    <div class="content">
      <h2>Buy Order Cancelled - ${coin}</h2>
      <p>Hi ${firstName},</p>
      <p>Your buy order has been cancelled.</p>
      
      <div class="highlight-box">
        <p style="margin: 5px 0;"><strong>Asset:</strong> ${coin}</p>
        <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount}</p>
        <p style="margin: 5px 0;"><strong>Price:</strong> ${price}</p>
        <p style="margin: 5px 0;"><strong>Total:</strong> <span class="amount">${total}</span></p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span class="status-badge status-error">Cancelled</span></p>
      </div>

      <p>If you didn't cancel this order or have any questions, please contact our support team.</p>
      
      <center>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/orders" class="button">View Orders</a>
      </center>
    </div>`;
    return this.getEmailWrapper(content);
  }

  getAdminNotificationTemplate(title, message, type, relatedId) {
    const content = `
    <div class="content">
      <h2>🔔 Admin Alert: ${title}</h2>
      <p>${message}</p>
      
      <div class="highlight-box">
        <p style="margin: 5px 0;"><strong>Type:</strong> ${type}</p>
        <p style="margin: 5px 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        ${relatedId ? `<p style="margin: 5px 0;"><strong>Related ID:</strong> ${relatedId}</p>` : ''}
      </div>

      <center>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/dashboard" class="button">Go to Admin Dashboard</a>
      </center>
    </div>`;
    return this.getEmailWrapper(content);
  }
}

// Create singleton instance
const emailService = new EmailService();
emailService.initialize();

module.exports = emailService;
