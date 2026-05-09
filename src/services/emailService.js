/**
 * Email Service
 * Handles all email notifications for the platform using Resend
 * Brand: Charles Schwab Trading Platform
 * Colors: #0d0824 bg | #a28539 gold | #4ade80 green | #f59e0b amber | #f87171 red
 */
const { Resend } = require('resend');
const pool = require('../db/pool');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const SUPPORT_URL  = `${FRONTEND_URL}/support`;
const DASHBOARD_URL = `${FRONTEND_URL}/dashboard`;
const YEAR = new Date().getFullYear();

class EmailService {
  constructor() {
    this.resend = null;
    this.initialized = false;
    this.fromEmail  = process.env.EMAIL_FROM      || 'onboarding@resend.dev';
    this.fromName   = process.env.EMAIL_FROM_NAME || 'Charles Schwab Trading Platform';
    this.adminEmail = process.env.ADMIN_EMAIL     || 'admin@schwab-trading.com';
  }

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────
  initialize() {
    if (this.initialized) return;
    if (process.env.EMAIL_ENABLED !== 'true') {
      console.log('[EmailService] Email notifications disabled');
      return;
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[EmailService] RESEND_API_KEY not set — emails will not be sent');
      return;
    }
    try {
      this.resend = new Resend(apiKey);
      this.initialized = true;
      console.log('[EmailService] Resend initialized successfully');
    } catch (err) {
      console.error('[EmailService] Failed to initialize Resend:', err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Core send
  // ─────────────────────────────────────────────────────────────
  async sendEmail({ to, subject, html, text }) {
    if (!this.initialized || !this.resend) {
      console.log('[EmailService] Email not sent — service not initialized');
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
      if (error) throw new Error(error.message || JSON.stringify(error));
      await this.logEmail({ recipient: to, subject, status: 'sent', messageId: data.id });
      return { success: true, messageId: data.id };
    } catch (err) {
      console.error('[EmailService] Failed to send email:', err.message);
      await this.logEmail({ recipient: to, subject, status: 'failed', error: err.message });
      return { success: false, error: err.message };
    }
  }

  async logEmail({ recipient, subject, status, messageId = null, error = null }) {
    try {
      await pool.query(
        `INSERT INTO email_logs (recipient, subject, status, message_id, error_message) VALUES (?,?,?,?,?)`,
        [recipient, subject, status, messageId, error]
      );
    } catch (err) {
      console.warn('[EmailService] Could not log email:', err.message);
    }
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  async getUserEmailInfo(userId) {
    try {
      const [[user]] = await pool.query(
        `SELECT email, first_name, last_name, email_notifications_enabled FROM users WHERE id = ?`,
        [userId]
      );
      return user;
    } catch (err) {
      console.error('[EmailService] Failed to get user info:', err.message);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Shared layout helpers
  // ─────────────────────────────────────────────────────────────
  _header(subtitle = 'Smart Trading • Crypto • Stocks • Automated Bot Trading') {
    return `
    <div style="background-color:#0d0824;padding:30px 25px;text-align:center;border-radius:10px 10px 0 0;">
      <h1 style="color:#a28539;margin:0;font-size:28px;font-family:Arial,sans-serif;letter-spacing:2px;font-weight:700;">
        CHARLES SCHWAB
      </h1>
      <p style="color:#cbd5e1;margin-top:6px;font-size:13px;font-family:Arial,sans-serif;letter-spacing:0.5px;">
        ${subtitle}
      </p>
    </div>`;
  }

  _footer() {
    return `
    <div style="background-color:#0d0824;padding:25px;text-align:center;font-family:Arial,sans-serif;border-radius:0 0 10px 10px;margin-top:0;">
      <p style="color:#a28539;font-size:15px;margin-bottom:6px;font-weight:700;letter-spacing:1px;">CHARLES SCHWAB</p>
      <p style="color:#cbd5e1;font-size:12px;margin:4px 0;">Trade Stocks, Crypto &amp; Automated Bot Strategies Securely</p>
      <p style="color:#64748b;font-size:11px;margin-top:14px;">&copy; ${YEAR} Charles Schwab Trading Platform. All rights reserved.</p>
      <p style="margin-top:14px;">
        <a href="${FRONTEND_URL}" style="color:#4ade80;text-decoration:none;margin:0 10px;font-size:12px;">Website</a>
        <a href="${SUPPORT_URL}"  style="color:#4ade80;text-decoration:none;margin:0 10px;font-size:12px;">Support</a>
        <a href="${DASHBOARD_URL}" style="color:#4ade80;text-decoration:none;margin:0 10px;font-size:12px;">Dashboard</a>
      </p>
    </div>`;
  }

  _wrap(bodyHtml) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:20px;background-color:#0f172a;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.5);">
    ${this._header()}
    <div style="background-color:#ffffff;padding:35px 30px;color:#1e293b;line-height:1.75;font-size:15px;">
      ${bodyHtml}
    </div>
    ${this._footer()}
  </div>
</body></html>`;
  }

  /** Coloured badge pill */
  _badge(text, color = '#4ade80', bg = '#052e16') {
    return `<span style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;background:${bg};color:${color};letter-spacing:0.5px;">${text}</span>`;
  }

  /** Info row inside a highlight box */
  _row(label, value) {
    return `<tr>
      <td style="padding:7px 12px;color:#64748b;font-size:13px;white-space:nowrap;font-weight:600;">${label}</td>
      <td style="padding:7px 12px;color:#1e293b;font-size:13px;">${value}</td>
    </tr>`;
  }

  /** Table-based detail box */
  _detailBox(rows) {
    return `
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin:20px 0;overflow:hidden;">
      <tbody>${rows}</tbody>
    </table>`;
  }

  /** CTA button */
  _button(label, url, color = '#a28539') {
    return `
    <div style="text-align:center;margin:28px 0 10px;">
      <a href="${url}" style="display:inline-block;padding:13px 36px;background:${color};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;letter-spacing:0.5px;">${label}</a>
    </div>`;
  }

  /** Section divider */
  _divider() {
    return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">`;
  }

  /** Alert banner (for admin emails) */
  _alertBanner(text, color = '#f59e0b') {
    return `
    <div style="background:${color}18;border-left:4px solid ${color};padding:14px 18px;border-radius:0 6px 6px 0;margin-bottom:22px;">
      <p style="margin:0;color:${color};font-weight:700;font-size:14px;">${text}</p>
    </div>`;
  }

  // ─────────────────────────────────────────────────────────────
  // USER EMAILS
  // ─────────────────────────────────────────────────────────────

  /** 1. Welcome */
  async sendWelcomeEmail(userId, userEmail = null, firstName = null) {
    const user = userEmail
      ? { email: userEmail, first_name: firstName }
      : await this.getUserEmailInfo(userId);
    if (!user?.email) return;

    const html = this._wrap(`
      <h2 style="color:#0d0824;margin-top:0;">Welcome to Charles Schwab, ${user.first_name}! 🎉</h2>
      <p>Your trading account has been successfully created and is now active.</p>
      ${this._detailBox(
        this._row('Full Name', user.first_name) +
        this._row('Email Address', user.email) +
        this._row('Registration Date', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })) +
        this._row('Account Status', this._badge('Active', '#4ade80', '#052e16'))
      )}
      <p>You can now log in to your dashboard, fund your wallet, and start trading stocks, crypto, and automated bot strategies.</p>
      <ul style="color:#475569;padding-left:20px;">
        <li>Complete your profile and KYC verification</li>
        <li>Explore real-time market data and analytics</li>
        <li>Make your first deposit to start trading</li>
        <li>Enable AI-powered bot trading for automated strategies</li>
      </ul>
      ${this._button('Go to Dashboard', DASHBOARD_URL)}
      ${this._divider()}
      <p style="color:#94a3b8;font-size:13px;margin:0;">Thank you for choosing Charles Schwab Trading Platform. Our support team is available 24/7.</p>
    `);

    return this.sendEmail({
      to: user.email,
      subject: 'Welcome to Charles Schwab — Your Account Has Been Created',
      html,
    });
  }

  /** 2. Deposit notifications (pending / completed / rejected) */
  async sendDepositNotification(userId, amount, status, method, rejectionReason = null) {
    const user = await this.getUserEmailInfo(userId);
    if (!user?.email || user.email_notifications_enabled === false) return;

    const fmt = `$${parseFloat(amount).toFixed(2)}`;
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    let subject, headline, badge, note;

    if (status === 'pending') {
      subject  = 'Deposit Pending Review — Charles Schwab';
      headline = 'Deposit Request Received';
      badge    = this._badge('Pending Review', '#f59e0b', '#451a03');
      note     = 'Your deposit is currently pending review. You will be notified once it is approved.';
    } else if (status === 'completed') {
      subject  = 'Deposit Approved Successfully — Charles Schwab';
      headline = 'Deposit Approved ✅';
      badge    = this._badge('Completed', '#4ade80', '#052e16');
      note     = 'Your wallet balance has been updated. You can now start trading.';
    } else {
      subject  = 'Deposit Rejected — Charles Schwab';
      headline = 'Deposit Rejected';
      badge    = this._badge('Rejected', '#f87171', '#450a0a');
      note     = rejectionReason
        ? `Your deposit was rejected. Reason: <strong>${rejectionReason}</strong>`
        : 'Your deposit was rejected. Please contact support for assistance.';
    }

    const html = this._wrap(`
      <h2 style="color:#0d0824;margin-top:0;">${headline}</h2>
      <p>Hello ${user.first_name},</p>
      <p>${note}</p>
      ${this._detailBox(
        this._row('Amount', `<strong style="color:#a28539;font-size:16px;">${fmt}</strong>`) +
        this._row('Payment Method', method) +
        this._row('Status', badge) +
        this._row('Date', date)
      )}
      ${this._button('View Wallet', `${DASHBOARD_URL}/wallet`)}
      ${this._divider()}
      <p style="color:#94a3b8;font-size:13px;margin:0;">If you have any questions, please <a href="${SUPPORT_URL}" style="color:#a28539;">contact support</a>.</p>
    `);

    return this.sendEmail({ to: user.email, subject, html });
  }

  /** 3. Withdrawal notifications (pending / completed / rejected) */
  async sendWithdrawalNotification(userId, amount, status, method, rejectionReason = null) {
    const user = await this.getUserEmailInfo(userId);
    if (!user?.email || user.email_notifications_enabled === false) return;

    const fmt  = `$${parseFloat(amount).toFixed(2)}`;
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    let subject, headline, badge, note;

    if (status === 'pending') {
      subject  = 'Withdrawal Request Submitted — Charles Schwab';
      headline = 'Withdrawal Request Received';
      badge    = this._badge('Pending', '#f59e0b', '#451a03');
      note     = 'Your withdrawal request has been submitted. Our finance team is currently reviewing it.';
    } else if (status === 'completed') {
      subject  = 'Withdrawal Approved — Charles Schwab';
      headline = 'Withdrawal Approved ✅';
      badge    = this._badge('Approved', '#4ade80', '#052e16');
      note     = 'Your withdrawal has been approved. Funds will reflect shortly depending on your payment provider.';
    } else {
      subject  = 'Withdrawal Rejected — Charles Schwab';
      headline = 'Withdrawal Rejected';
      badge    = this._badge('Rejected', '#f87171', '#450a0a');
      note     = rejectionReason
        ? `Your withdrawal was rejected. Reason: <strong>${rejectionReason}</strong>`
        : 'Your withdrawal was rejected. Please contact support for further assistance.';
    }

    const html = this._wrap(`
      <h2 style="color:#0d0824;margin-top:0;">${headline}</h2>
      <p>Hello ${user.first_name},</p>
      <p>${note}</p>
      ${this._detailBox(
        this._row('Amount', `<strong style="color:#a28539;font-size:16px;">${fmt}</strong>`) +
        this._row('Withdrawal Method', method) +
        this._row('Status', badge) +
        this._row('Date', date)
      )}
      ${this._button('View Wallet', `${DASHBOARD_URL}/wallet`)}
      ${this._divider()}
      <p style="color:#94a3b8;font-size:13px;margin:0;">If you have any questions, please <a href="${SUPPORT_URL}" style="color:#a28539;">contact support</a>.</p>
    `);

    return this.sendEmail({ to: user.email, subject, html });
  }

  /** 4. Buy order notifications (open / filled / cancelled) */
  async sendBuyOrderNotification(userId, coin, amount, price, total, status) {
    const user = await this.getUserEmailInfo(userId);
    if (!user?.email || user.email_notifications_enabled === false) return;

    const fmtPrice = `$${parseFloat(price).toFixed(2)}`;
    const fmtTotal = `$${parseFloat(total).toFixed(2)}`;
    const date     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    let subject, headline, badge, note;

    if (status === 'open') {
      subject  = `Buy Order Placed — ${coin} | Charles Schwab`;
      headline = `Buy Order Placed — ${coin}`;
      badge    = this._badge('Open', '#f59e0b', '#451a03');
      note     = 'Your buy order has been placed and is now open. You will be notified once it is filled.';
    } else if (status === 'filled') {
      subject  = `Buy Order Filled — ${coin} | Charles Schwab`;
      headline = `Buy Order Filled — ${coin} ✅`;
      badge    = this._badge('Filled', '#4ade80', '#052e16');
      note     = `Congratulations! Your buy order for ${coin} has been successfully filled and added to your portfolio.`;
    } else {
      subject  = `Buy Order Cancelled — ${coin} | Charles Schwab`;
      headline = `Buy Order Cancelled — ${coin}`;
      badge    = this._badge('Cancelled', '#f87171', '#450a0a');
      note     = 'Your buy order has been cancelled. If you did not request this, please contact support.';
    }

    const html = this._wrap(`
      <h2 style="color:#0d0824;margin-top:0;">${headline}</h2>
      <p>Hello ${user.first_name},</p>
      <p>${note}</p>
      ${this._detailBox(
        this._row('Asset', `<strong>${coin}</strong>`) +
        this._row('Amount', amount) +
        this._row('Purchase Price', fmtPrice) +
        this._row('Total Amount', `<strong style="color:#a28539;font-size:16px;">${fmtTotal}</strong>`) +
        this._row('Status', badge) +
        this._row('Date', date)
      )}
      ${this._button('View Portfolio', `${DASHBOARD_URL}/portfolio`)}
      ${this._divider()}
      <p style="color:#94a3b8;font-size:13px;margin:0;">If you have any questions, please <a href="${SUPPORT_URL}" style="color:#a28539;">contact support</a>.</p>
    `);

    return this.sendEmail({ to: user.email, subject, html });
  }

  /** 5. Bot activated */
  async sendBotActivationEmail(userId, botData = {}) {
    const user = await this.getUserEmailInfo(userId);
    if (!user?.email || user.email_notifications_enabled === false) return;

    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = this._wrap(`
      <h2 style="color:#0d0824;margin-top:0;">Bot Trading Activated 🤖</h2>
      <p>Hello ${user.first_name},</p>
      <p>Your automated trading bot has been activated successfully. It will now begin monitoring and executing trades automatically based on your selected settings.</p>
      ${this._detailBox(
        this._row('Bot Name', botData.name || 'AI Trading Bot') +
        this._row('Strategy', botData.strategy || 'Auto') +
        this._row('Status', this._badge('Active', '#4ade80', '#052e16')) +
        this._row('Activated On', date)
      )}
      ${this._button('View Bot Dashboard', `${DASHBOARD_URL}/bot`)}
      ${this._divider()}
      <p style="color:#94a3b8;font-size:13px;margin:0;">You can adjust your bot settings anytime from your dashboard.</p>
    `);

    return this.sendEmail({
      to: user.email,
      subject: 'Bot Trading Activated — Charles Schwab',
      html,
    });
  }

  /** 6. Bot position opened */
  async sendBotPositionOpenedEmail(userId, tradeData = {}) {
    const user = await this.getUserEmailInfo(userId);
    if (!user?.email || user.email_notifications_enabled === false) return;

    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = this._wrap(`
      <h2 style="color:#0d0824;margin-top:0;">Bot Opened a Trade 📈</h2>
      <p>Hello ${user.first_name},</p>
      <p>Your trading bot has opened a new market position. You can monitor this trade live from your dashboard.</p>
      ${this._detailBox(
        this._row('Asset', tradeData.pair || tradeData.asset || '—') +
        this._row('Position Type', tradeData.side ? tradeData.side.toUpperCase() : '—') +
        this._row('Entry Price', tradeData.entry_price ? `$${parseFloat(tradeData.entry_price).toFixed(2)}` : '—') +
        this._row('Trade Size', tradeData.amount || '—') +
        this._row('Status', this._badge('Open', '#f59e0b', '#451a03')) +
        this._row('Open Time', date)
      )}
      ${this._button('Monitor Trade', `${DASHBOARD_URL}/bot`)}
      ${this._divider()}
      <p style="color:#94a3b8;font-size:13px;margin:0;">Your bot is actively managing this position based on your strategy settings.</p>
    `);

    return this.sendEmail({
      to: user.email,
      subject: `Bot Trade Opened — ${tradeData.pair || 'Charles Schwab'}`,
      html,
    });
  }

  /** 7. Bot position closed */
  async sendBotPositionClosedEmail(userId, tradeData = {}) {
    const user = await this.getUserEmailInfo(userId);
    if (!user?.email || user.email_notifications_enabled === false) return;

    const pnl      = parseFloat(tradeData.pnl || 0);
    const isProfit = pnl >= 0;
    const pnlStr   = `${isProfit ? '+' : ''}$${Math.abs(pnl).toFixed(2)}`;
    const date     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const closeReason = tradeData.close_reason || (isProfit ? 'Take Profit' : 'Stop Loss');

    const html = this._wrap(`
      <h2 style="color:#0d0824;margin-top:0;">Bot Trade Closed ${isProfit ? '💰' : '📉'}</h2>
      <p>Hello ${user.first_name},</p>
      <p>Your trading bot has successfully closed a position.</p>
      ${this._detailBox(
        this._row('Asset', tradeData.pair || tradeData.asset || '—') +
        this._row('Position Type', tradeData.side ? tradeData.side.toUpperCase() : '—') +
        this._row('Entry Price', tradeData.entry_price ? `$${parseFloat(tradeData.entry_price).toFixed(2)}` : '—') +
        this._row('Exit Price', tradeData.exit_price ? `$${parseFloat(tradeData.exit_price).toFixed(2)}` : '—') +
        this._row('Close Reason', closeReason) +
        this._row('Profit / Loss', `<strong style="color:${isProfit ? '#4ade80' : '#f87171'};font-size:16px;">${pnlStr}</strong>`) +
        this._row('Closed Time', date)
      )}
      ${this._button('View Portfolio', `${DASHBOARD_URL}/portfolio`)}
      ${this._divider()}
      <p style="color:#94a3b8;font-size:13px;margin:0;">Your bot continues to monitor the market for new opportunities.</p>
    `);

    return this.sendEmail({
      to: user.email,
      subject: `Bot Trade Closed — ${isProfit ? 'Profit' : 'Loss'} | Charles Schwab`,
      html,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // ADMIN EMAILS
  // ─────────────────────────────────────────────────────────────

  async sendAdminNotification(title, message, type, relatedId = null, extraData = {}) {
    const date = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });

    const typeColors = {
      user_registration:  '#4ade80',
      user_deposit:       '#a28539',
      user_withdrawal:    '#f59e0b',
      buy_stocks:         '#38bdf8',
      buy_crypto:         '#818cf8',
      bot_activation:     '#4ade80',
      bot_position_open:  '#f59e0b',
      bot_position_close: '#f87171',
    };
    const accentColor = typeColors[type] || '#a28539';

    // Build optional extra rows
    let extraRows = '';
    if (extraData.amount)   extraRows += this._row('Amount', `<strong style="color:#a28539;">$${parseFloat(extraData.amount).toFixed(2)}</strong>`);
    if (extraData.method)   extraRows += this._row('Method', extraData.method);
    if (extraData.strategy) extraRows += this._row('Strategy', extraData.strategy);
    if (extraData.pair)     extraRows += this._row('Asset / Pair', extraData.pair);
    if (extraData.pnl !== undefined) {
      const p = parseFloat(extraData.pnl);
      extraRows += this._row('P&amp;L', `<strong style="color:${p >= 0 ? '#4ade80' : '#f87171'};">${p >= 0 ? '+' : ''}$${Math.abs(p).toFixed(2)}</strong>`);
    }

    const html = this._wrap(`
      ${this._alertBanner(`⚡ Admin Alert — ${title}`, accentColor)}
      <h2 style="color:#0d0824;margin-top:0;">${title}</h2>
      <p>${message}</p>
      ${this._detailBox(
        this._row('Alert Type', `<span style="color:${accentColor};font-weight:700;">${type.replace(/_/g, ' ').toUpperCase()}</span>`) +
        (relatedId ? this._row('Related ID', `#${relatedId}`) : '') +
        extraRows +
        this._row('Timestamp', date)
      )}
      ${this._button('Go to Admin Dashboard', `${FRONTEND_URL}/admin/dashboard`, accentColor)}
      ${this._divider()}
      <p style="color:#94a3b8;font-size:13px;margin:0;">This is an automated admin alert from Charles Schwab Trading Platform.</p>
    `);

    return this.sendEmail({
      to: this.adminEmail,
      subject: `[Admin Alert] ${title} — Charles Schwab`,
      html,
    });
  }
}

// Singleton
const emailService = new EmailService();
emailService.initialize();

module.exports = emailService;
