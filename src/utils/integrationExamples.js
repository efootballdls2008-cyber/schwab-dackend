/**
 * Integration Examples for Enhanced Notification System
 * 
 * This file shows how to integrate the notification service into existing routes
 */

const notificationService = require('../services/notificationService');

// ── Example: Bot Trading Integration ──────────────────────────────────────────

async function handleBotActivation(userId, botSettings) {
  await notificationService.notifyBotActivation(userId, {
    strategy: botSettings.strategy,
    risk_level: botSettings.risk_level,
    pair: botSettings.pair,
    take_profit: botSettings.take_profit,
    stop_loss: botSettings.stop_loss
  });
}

async function handleBotTradeOpened(userId, tradeData) {
  await notificationService.notifyBotTrade(userId, tradeData, 'opened');
}

async function handleBotTradeClosed(userId, tradeData) {
  await notificationService.notifyBotTrade(userId, tradeData, 'closed');
}

// ── Example: Purchase Integration ─────────────────────────────────────────────

async function handleStockPurchase(userId, purchaseData) {
  await notificationService.notifyPurchase(userId, {
    ...purchaseData,
    type: 'stock'
  });
}

async function handleCryptoPurchase(userId, purchaseData) {
  await notificationService.notifyPurchase(userId, {
    ...purchaseData,
    type: 'crypto'
  });
}

// ── Example: Security Alerts ─────────────────────────────────────────────────

async function handleSuspiciousActivity(userId, activityData) {
  await notificationService.createUserNotification({
    userId,
    title: 'Suspicious Activity Detected',
    message: 'We detected unusual activity on your account. Please review your recent transactions.',
    type: 'security',
    category: 'system_alerts',
    priority: 'high',
    metadata: activityData,
    sendEmail: true
  });

  await notificationService.createAdminNotification({
    title: 'Suspicious Activity Alert',
    message: `Suspicious activity detected for user ${userId}`,
    type: 'suspicious_activity',
    priority: 'high',
    userId,
    metadata: activityData
  });
}

async function handleFailedTransaction(userId, transactionData) {
  await notificationService.createUserNotification({
    userId,
    title: 'Transaction Failed',
    message: `Your ${transactionData.type} transaction of $${transactionData.amount} has failed.`,
    type: 'system',
    category: 'system_alerts',
    priority: 'medium',
    relatedId: transactionData.id,
    relatedType: 'transaction',
    metadata: transactionData
  });

  await notificationService.createAdminNotification({
    title: 'Failed Transaction',
    message: `Transaction failed for user ${userId}: ${transactionData.type} of $${transactionData.amount}`,
    type: 'failed_transaction',
    priority: 'medium',
    userId,
    relatedId: transactionData.id,
    relatedType: 'transaction',
    metadata: transactionData
  });
}

// ── Example: P&L Updates ─────────────────────────────────────────────────────

async function handleProfitLossUpdate(userId, plData) {
  const isProfit = plData.amount >= 0;
  
  await notificationService.createUserNotification({
    userId,
    title: isProfit ? 'Profit Realized' : 'Loss Recorded',
    message: `${isProfit ? 'Congratulations!' : 'Update:'} Your ${plData.type} resulted in ${isProfit ? 'a profit' : 'a loss'} of $${Math.abs(plData.amount).toFixed(2)}`,
    type: 'profit_loss',
    category: 'profit_loss',
    priority: isProfit ? 'medium' : 'low',
    relatedId: plData.tradeId,
    relatedType: 'trade',
    metadata: plData,
    sendEmail: true
  });

  // Admin notification for significant P&L
  if (Math.abs(plData.amount) > 1000) {
    await notificationService.createAdminNotification({
      title: `Significant ${isProfit ? 'Profit' : 'Loss'} Alert`,
      message: `User ${userId} ${isProfit ? 'gained' : 'lost'} $${Math.abs(plData.amount).toFixed(2)} from ${plData.type}`,
      type: 'user_pnl',
      priority: 'medium',
      userId,
      relatedId: plData.tradeId,
      relatedType: 'trade',
      metadata: plData
    });
  }
}

// ── Example: Price Alerts ────────────────────────────────────────────────────

async function handlePriceAlert(userId, alertData) {
  await notificationService.createUserNotification({
    userId,
    title: 'Price Alert Triggered',
    message: `${alertData.symbol} has ${alertData.direction === 'above' ? 'risen above' : 'fallen below'} $${alertData.targetPrice}. Current price: $${alertData.currentPrice}`,
    type: 'price_alert',
    category: 'system_alerts',
    priority: 'medium',
    relatedId: alertData.alertId,
    relatedType: 'price_alert',
    metadata: alertData
  });
}

// ── Example: System Maintenance ──────────────────────────────────────────────

async function handleSystemMaintenance(maintenanceData) {
  // Get all users
  const [users] = await pool.query('SELECT id FROM users WHERE account_status = "active"');
  
  for (const user of users) {
    await notificationService.createUserNotification({
      userId: user.id,
      title: 'Scheduled Maintenance',
      message: `The platform will undergo maintenance on ${maintenanceData.date} from ${maintenanceData.startTime} to ${maintenanceData.endTime}. Trading will be temporarily unavailable.`,
      type: 'system',
      category: 'system_alerts',
      priority: 'medium',
      metadata: maintenanceData,
      sendEmail: true
    });
  }
}

module.exports = {
  handleBotActivation,
  handleBotTradeOpened,
  handleBotTradeClosed,
  handleStockPurchase,
  handleCryptoPurchase,
  handleSuspiciousActivity,
  handleFailedTransaction,
  handleProfitLossUpdate,
  handlePriceAlert,
  handleSystemMaintenance
};