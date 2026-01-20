# Cycle Trading Bot - Server

Node.js trading bot for Binance Futures with automatic cycle detection and optimization.

## Features
- 🔄 Auto-optimizes range every 3 hours using Combined P&L simulation
- 📈 LONG + SHORT trades (Combined strategy)
- 🎯 SL/TP1/TP2 with Break-Even logic
- ⚡ 1-hour timeframe on SUI

## Deploy to Railway

1. Fork this repo
2. Connect Railway to your GitHub
3. Add environment variables:
   - `BINANCE_API_KEY`
   - `BINANCE_API_SECRET`
4. Deploy!

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| BINANCE_API_KEY | (required) | API Key |
| BINANCE_API_SECRET | (required) | API Secret |
| SYMBOL | SUIUSDT | Trading pair |
| TIMEFRAME | 1h | Candle timeframe |
| LEVERAGE | 20 | Leverage |
| TESTNET | false | Use testnet |
