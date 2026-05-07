# Bot Position P&L Update Fix

## Problem
When the bot opened a position, the P&L values in the database remained static at 0 until the trade closed. While the UI calculated and displayed live unrealized P&L correctly, the raw database records showed:
- `pnl: 0`
- `pnlPct: 0`

This made it appear that positions weren't updating, even though the bot engine was receiving live prices and the UI was working correctly.

## Root Cause
The bot engine was:
✅ Receiving live price updates via `botEngine.updatePrice(livePrice)`
✅ Checking exit conditions (take-profit/stop-loss)
✅ Calculating P&L in the UI components

But it was NOT:
❌ Updating the database records with unrealized P&L values

The `BotTrade` records only got updated when trades closed, not while they were open.

## Solution Implemented

### 1. Added `updateUnrealizedPnL()` Method
Created a new private method in `botEngine.ts` that:
- Calculates current unrealized P&L based on live price
- Updates the local `openTrade` object
- Updates the trade in the `trades` array
- Persists the P&L values to the database via API call

```typescript
private async updateUnrealizedPnL(currentPrice: number) {
  const open = this.openTrade
  if (!open) return

  const pnl = open.side === 'buy'
    ? (currentPrice - open.entryPrice) * open.amount
    : (open.entryPrice - currentPrice) * open.amount
  const pnlPct = open.side === 'buy'
    ? ((currentPrice - open.entryPrice) / open.entryPrice) * 100
    : ((open.entryPrice - currentPrice) / open.entryPrice) * 100

  // Update local trade object
  this.openTrade = {
    ...open,
    pnl: parseFloat(pnl.toFixed(2)),
    pnlPct: parseFloat(pnlPct.toFixed(2)),
  }

  // Update in trades array
  this.trades = this.trades.map((t) => 
    t.id === open.id ? this.openTrade! : t
  )

  // Persist to database
  try {
    await patchApi(`/botTrades/${open.id}`, {
      pnl: parseFloat(pnl.toFixed(2)),
      pnlPct: parseFloat(pnlPct.toFixed(2)),
    })
  } catch {
    // Non-critical - UI will still show correct values
  }
}
```

### 2. Added Dedicated P&L Update Interval
Created a separate interval (`pnlUpdateId`) that runs every 3 seconds to update unrealized P&L:

```typescript
// Separate interval for updating unrealized P&L more frequently
this.pnlUpdateId = setInterval(() => {
  const currentPrice = this.currentPrice > 0 ? this.currentPrice : this.priceHistory[this.priceHistory.length - 1]
  if (this.openTrade && currentPrice > 0) {
    this.updateUnrealizedPnL(currentPrice)
    this.notify()
  }
}, 3000) // Update every 3 seconds
```

### 3. Updated Cleanup
Modified `stopLoop()` to clear the new P&L update interval:

```typescript
private stopLoop() {
  if (this.intervalId !== null) { clearInterval(this.intervalId); this.intervalId = null }
  if (this.elapsedId !== null) { clearInterval(this.elapsedId); this.elapsedId = null }
  if (this.pnlUpdateId !== null) { clearInterval(this.pnlUpdateId); this.pnlUpdateId = null }
}
```

## How It Works Now

### Update Frequency
- **Every 3 seconds**: Unrealized P&L is calculated and saved to database
- **Every 8 seconds**: Main bot loop checks signals and exit conditions
- **Every 1 second**: Elapsed time counter updates

### Data Flow
1. Live price comes in via WebSocket/API → `botEngine.updatePrice(livePrice)`
2. Price is stored in `this.currentPrice` and `this.priceHistory`
3. Every 3 seconds, if there's an open trade:
   - Calculate current P&L based on latest price
   - Update local trade object
   - Save to database via PATCH request
   - Notify UI subscribers to re-render
4. UI components read the updated values and display them

### Benefits
✅ Database records now show live unrealized P&L
✅ Admin panel can see real-time position values
✅ API responses include current P&L data
✅ Historical data is more accurate
✅ No performance impact (throttled updates)
✅ Graceful error handling (non-critical failures)

## Testing

To verify the fix is working:

1. **Start the bot** on the Exchange page
2. **Wait for it to open a position**
3. **Check the database** (`charles-schwab/db.json` or via API):
   ```bash
   # View bot trades
   curl http://localhost:5173/api/botTrades
   ```
4. **Observe the P&L values updating** every 3 seconds as the price changes
5. **Check the UI** - both the AlgoBotPanel and Positions page should show matching values

## Files Modified

- `charles-schwab/src/engine/botEngine.ts`
  - Added `pnlUpdateId` property
  - Added `updateUnrealizedPnL()` method
  - Modified `startLoop()` to include P&L update interval
  - Modified `stopLoop()` to clear P&L update interval

## Performance Considerations

- **Update frequency**: 3 seconds is a good balance between real-time updates and API load
- **Database writes**: ~20 writes per minute per open position (acceptable for json-server)
- **Error handling**: Failed updates don't crash the bot; UI still works
- **Memory**: Minimal impact; only updates when position is open

## Future Enhancements

Potential improvements:
1. Add WebSocket support for real-time P&L streaming (no polling needed)
2. Batch multiple position updates in a single API call
3. Add P&L history tracking (snapshots every minute)
4. Implement P&L alerts (notify when position hits certain thresholds)
5. Add P&L charts showing position value over time
