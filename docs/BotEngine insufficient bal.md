Let me look at the bot engine and relevant files to understand the issue first.

Read file(s)

botEngine.ts

platformAccounts.js
Here's the issue and exactly what I'd do to fix it:

The Problem

In botEngine.ts, the executeTrade method calculates position size using this.balance but there's no balance check before opening a trade. If the user has $0 or insufficient balance, the bot still tries to open a position — it just opens one with a near-zero or zero amount, which is an invalid/broken trade.

Look at this in executeTrade:

const amount = calcPositionSize(this.balance, this.state.riskLevel, currentPrice)
// ← no guard here — amount could be 0 or near-zero
And calcPositionSize:

function calcPositionSize(balance: number, riskLevel: RiskLevel, price: number): number {
  const riskPct = riskLevel === 'Conservative' ? 0.02 : riskLevel === 'Moderate' ? 0.05 : 0.10
  const usdAmount = balance * riskPct  // ← if balance is 0, this is 0
  return parseFloat((usdAmount / price).toFixed(6))
}
The Fix — two things:

In executeTrade, add a minimum balance guard before opening any position:
// Guard: don't trade with zero/insufficient balance
const minTradeAmount = 1 // $1 minimum
const riskPct = this.state.riskLevel === 'Conservative' ? 0.02 : this.state.riskLevel === 'Moderate' ? 0.05 : 0.10
if (this.balance * riskPct < minTradeAmount) {
  this.scanStatus = '⚠ Insufficient balance — bot paused. Please deposit funds.'
  this.state = { ...this.state, running: false }
  await this.persistSettings()
  this.stopLoop()
  this.notify()
  return
}
In start(), add the same check upfront so the bot never even starts:
async start() {
  if (this.state.running) return
  const riskPct = this.state.riskLevel === 'Conservative' ? 0.02 : this.state.riskLevel === 'Moderate' ? 0.05 : 0.10
  if (this.balance * riskPct < 1) {
    // Surface this to the UI — throw or return an error object
    return { ok: false, reason: 'insufficient_balance' }
  }
  // ... rest of start logic
}
Then in the UI component that calls botEngine.start(), handle that insufficient_balance reason and show the user a toast/modal telling them to deposit first.

Also worth doing: in openImmediatePosition and clearTradeById (which re-opens a position after close), add the same balance check — otherwise the bot will keep trying to re-enter after every close even with no funds.

Want me to go ahead and implement all of this?