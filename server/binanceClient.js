/**
 * Binance Futures API Client
 * - Uses REAL Binance data for analysis/optimization
 * - Executes orders on Testnet or Real based on config
 */

import crypto from 'crypto';
import { config } from './config.js';

// ALWAYS use real Binance for data (testnet has limited history)
const DATA_URL = 'https://fapi.binance.com';

// Use testnet or real for order execution
const TRADE_URL = config.testnet
    ? 'https://testnet.binancefuture.com'
    : 'https://fapi.binance.com';

/**
 * Create HMAC signature for authenticated requests
 */
function createSignature(queryString) {
    return crypto
        .createHmac('sha256', config.apiSecret)
        .update(queryString)
        .digest('hex');
}

/**
 * Make authenticated request to Binance
 */
async function signedRequest(endpoint, method = 'GET', params = {}) {
    const timestamp = Date.now();
    const queryParams = new URLSearchParams({
        ...params,
        timestamp,
        recvWindow: 5000
    });

    const signature = createSignature(queryParams.toString());
    queryParams.append('signature', signature);

    const url = `${TRADE_URL}${endpoint}?${queryParams.toString()}`;

    const response = await fetch(url, {
        method,
        headers: {
            'X-MBX-APIKEY': config.apiKey
        }
    });

    const data = await response.json();

    if (data.code && data.code < 0) {
        throw new Error(`Binance API Error: ${data.msg} (code: ${data.code})`);
    }

    return data;
}

/**
 * Fetch candlestick data (public, no auth needed)
 */
export async function getKlines(symbol, interval, limit = 632) {
    // Use REAL Binance data for analysis (not testnet)
    const url = `${DATA_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        // Check if API returned an error
        if (data.code && data.code < 0) {
            console.error(`❌ Binance API Error: ${data.msg}`);
            return [];
        }

        // Check if data is an array
        if (!Array.isArray(data)) {
            console.error('❌ Unexpected data format from Binance:', typeof data, JSON.stringify(data).substring(0, 200));
            return [];
        }

        // Convert to standard candle format
        return data.map(k => ({
            time: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        }));
    } catch (error) {
        console.error('❌ Error fetching klines:', error.message);
        return [];
    }
}

/**
 * Get account balance
 */
export async function getBalance() {
    const data = await signedRequest('/fapi/v2/balance');
    const usdt = data.find(b => b.asset === 'USDT');
    return usdt ? parseFloat(usdt.balance) : 0;
}

/**
 * Get current position for a symbol
 */
export async function getPosition(symbol) {
    const data = await signedRequest('/fapi/v2/positionRisk');
    const position = data.find(p => p.symbol === symbol);
    return position ? {
        size: parseFloat(position.positionAmt),
        entryPrice: parseFloat(position.entryPrice),
        unrealizedPnL: parseFloat(position.unRealizedProfit),
        leverage: parseInt(position.leverage),
        side: parseFloat(position.positionAmt) > 0 ? 'LONG' : parseFloat(position.positionAmt) < 0 ? 'SHORT' : null
    } : null;
}

/**
 * Set leverage for a symbol
 */
export async function setLeverage(symbol, leverage) {
    return signedRequest('/fapi/v1/leverage', 'POST', {
        symbol,
        leverage
    });
}

/**
 * Open a market order
 * @param {string} symbol - Trading pair
 * @param {string} side - 'BUY' or 'SELL'
 * @param {number} quantity - Order quantity
 */
export async function openMarketOrder(symbol, side, quantity) {
    // Round to 1 decimal place for SUI precision
    const roundedQty = Math.floor(quantity * 10) / 10;
    console.log(`📊 Opening ${side} order: ${roundedQty} ${symbol}`);

    return signedRequest('/fapi/v1/order', 'POST', {
        symbol,
        side,
        type: 'MARKET',
        quantity: roundedQty.toFixed(1)
    });
}

/**
 * Close position (market order in opposite direction)
 * @param {string} symbol
 * @param {number} quantity - Positive number
 * @param {string} currentSide - 'LONG' or 'SHORT'
 */
export async function closePosition(symbol, quantity, currentSide) {
    const closeSide = currentSide === 'LONG' ? 'SELL' : 'BUY';
    // Round to 1 decimal place for SUI precision (same as openMarketOrder)
    const roundedQty = Math.floor(Math.abs(quantity) * 10) / 10;
    console.log(`📊 Closing ${currentSide} position: ${roundedQty} ${symbol}`);

    return signedRequest('/fapi/v1/order', 'POST', {
        symbol,
        side: closeSide,
        type: 'MARKET',
        quantity: roundedQty.toFixed(1),
        reduceOnly: 'true'
    });
}

/**
 * Get current price for a symbol
 */
export async function getCurrentPrice(symbol) {
    const url = `${DATA_URL}/fapi/v1/ticker/price?symbol=${symbol}`;
    const response = await fetch(url);
    const data = await response.json();
    return parseFloat(data.price);
}

/**
 * Get exchange info for a symbol (to get precision rules)
 */
export async function getSymbolInfo(symbol) {
    const url = `${DATA_URL}/fapi/v1/exchangeInfo`;
    const response = await fetch(url);
    const data = await response.json();
    return data.symbols.find(s => s.symbol === symbol);
}
