/**
 * Configuration Loader
 * Loads settings from environment variables with defaults
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
    // Binance API
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET || '',

    // Trading Pair - DEFAULT: SUI on 1 hour timeframe
    symbol: process.env.SYMBOL || 'SUIUSDT',
    timeframe: process.env.TIMEFRAME || '1h',

    // Cycle Detection Range (will be auto-optimized)
    rangeMin: parseInt(process.env.RANGE_MIN) || 13,
    rangeMax: parseInt(process.env.RANGE_MAX) || 33,
    force24Bars: process.env.FORCE_24_BARS !== 'false', // Default TRUE

    // Trading Modes - Combined P&L means both enabled
    enableLong: process.env.ENABLE_LONG !== 'false',  // Default true
    enableShort: process.env.ENABLE_SHORT !== 'false', // Default true

    // Risk Management
    leverage: parseInt(process.env.LEVERAGE) || 20,
    capitalPercent: 15, // Forced to 15% (ignoring env)

    // Bot Settings
    loopIntervalMs: parseInt(process.env.LOOP_INTERVAL_MS) || 60000, // 1 minute for 1h candles
    candleLimit: 1000, // Match frontend (1000 candles)

    // AUTO-OPTIMIZATION: Re-calculate best range every N hours
    optimizeIntervalHours: parseInt(process.env.OPTIMIZE_INTERVAL_HOURS) || 32,

    // Testnet Mode (for safe testing)
    testnet: process.env.TESTNET === 'true',

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info'
};

// Validate required config
export function validateConfig() {
    if (!config.apiKey || !config.apiSecret) {
        console.error('❌ BINANCE_API_KEY and BINANCE_API_SECRET are required!');
        console.error('   Set them in .env file or Railway environment variables.');
        return false;
    }
    return true;
}
