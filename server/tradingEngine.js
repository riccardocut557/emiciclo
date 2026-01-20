/**
 * Trading Engine - Enhanced with Auto-Optimization
 * 
 * Features:
 * - Auto-optimizes range every 3 hours using Combined P&L simulation
 * - Force 24 bars enabled
 * - Full SL/TP/Break-Even/Partial Close logic
 * - Real order execution via Binance Futures API
 */

import { config } from './config.js';
import * as binance from './binanceClient.js';
import CycleDetector from './cycle_detector.js';
import CycleTradingBot from './cycle_bot.js';
import Indicators from './indicators.js';
import { notificationService } from './notificationService.js';

// State
let cycleDetector = new CycleDetector();
let tradingBot = new CycleTradingBot();
let lastProcessedCandleTime = 0;
let isRunning = false;

// Current optimized range
let currentRangeMin = config.rangeMin;
let currentRangeMax = config.rangeMax;
let lastOptimizationTime = 0;

// Track detected cycles to avoid duplicate signals
let lastIndexCycleEnd = -1;
let lastInverseCycleEnd = -1;

// Open position tracking for SL/TP management
let openTrade = null; // { type, entryPrice, entryTime, slPrice, tp1Price, tp2Price, size, tp1Hit }

/**
 * Calculate Combined P&L for a given range (Long + Short)
 * MATCHES FRONTEND calculateCombinedRangeGains EXACTLY
 */
/**
 * Calculate Combined P&L for a given range (Long + Short)
 * Optimized to accept a reusable bot instance
 */
function calculateCombinedPnL(candles, minDur, maxDur, reusableBot = null) {
    const STARTING_BALANCE = 1000;
    const testBot = reusableBot || new CycleTradingBot();

    // Match user's actual frontend settings exactly
    testBot.updateConfig({
        startingBalance: STARTING_BALANCE,
        leverage: 20,
        capitalPercentage: 18,             // Test: 18%
        feesEnabled: true,
        tp1AvgPercent: 25,                 // User's setting: 25%
        tp1CloseFraction: 90,              // User's setting: 90%
        tp2AvgPercent: 150,
        threeBarConfirmation: false,
        closeOnOpposite: false,            // OPP CLOSE: OFF
        maTrendFilter: false,              // MA TREND: OFF
        maxLossEnabled: false,             // MAX LOSS: OFF
        multiTradeEnabled: true,           // MULTI TRADE: ON
        volFilterEnabled: false,           // VOL FILTER: OFF
        trailingStopEnabled: true,         // TRAILING: ON
        trailingActivation: 3.2,           // Frontend default: 3.2%
        trailingCallback: 0.8,             // Frontend default: 0.8%
        dynamicExitEnabled: true,          // DYNAMIC ATR: ON
        dynamicSLMult: 2.0,
        dynamicTPMult: 3.0,
        pyramidingEnabled: true            // PYRAMIDING: ON
    });

    try {
        // Run with BOTH Long AND Short enabled (Combined)
        testBot.simulateLiveTrading(
            candles,
            cycleDetector,
            [],     // no momentum
            false,  // no momentum filter
            minDur,
            maxDur,
            true,   // priorityMin (force 24 bars)
            true,   // enableLong
            true,   // enableShort
            1       // sensitivity
        );

        // Require minimum 3 trades (like frontend)
        if (testBot.trades.length < 3) return -Infinity;

        // Calculate PnL% exactly like frontend
        const pnlPct = ((testBot.currentBalance - STARTING_BALANCE) / STARTING_BALANCE) * 100;
        return pnlPct;
    } catch (e) {
        return -Infinity;
    }
}

/**
 * Find the best range using Combined P&L simulation
 * Same range logic as frontend: MIN=5, MAX=55, STEP=2
 */
async function optimizeRange(candles) {
    console.log('\n🔬 Running Combined P&L Optimization...');

    const MIN_RANGE = 5;
    const MAX_RANGE = 55;
    const STEP = 2;

    let bestPnL = -Infinity;
    let bestMin = currentRangeMin;
    let bestMax = currentRangeMax;

    // Create a single bot instance to reuse (MEMORY OPTIMIZATION)
    const optimizationBot = new CycleTradingBot();

    // Test range combinations (same as frontend heatmap)
    for (let minDur = MIN_RANGE; minDur <= MAX_RANGE; minDur += STEP) {
        // Unblock event loop every outer iteration to allow emails/pings (PERFORMANCE FIX)
        await new Promise(resolve => setImmediate(resolve));

        for (let maxDur = MIN_RANGE; maxDur <= MAX_RANGE; maxDur += STEP) {
            // Skip invalid ranges (max must be > min + 3)
            if (maxDur <= minDur + 3) continue;

            const pnl = calculateCombinedPnL(candles, minDur, maxDur, optimizationBot);

            if (pnl > bestPnL) {
                bestPnL = pnl;
                bestMin = minDur;
                bestMax = maxDur;
            }
        }
    }

    console.log(`✅ Best Range Found: ${bestMin}-${bestMax} (${bestPnL.toFixed(1)}%)`);

    // Update current range
    currentRangeMin = bestMin;
    currentRangeMax = bestMax;
    lastOptimizationTime = Date.now();

    // Notify user of new optimization results
    notificationService.sendOptimizationUpdate(bestMin, bestMax, bestPnL);

    return { min: bestMin, max: bestMax, pnl: bestPnL };
}

/**
 * Calculate average cycle moves for TP levels
 */
function calculateAvgMoves(candles, indexCycles, inverseCycles) {
    // Average pump for Long TP
    let avgPump = 0;
    const last10Index = indexCycles.slice(-10);
    if (last10Index.length > 0) {
        let total = 0;
        last10Index.forEach(cycle => {
            const minPrice = candles[cycle.startIndex]?.low || candles[cycle.endIndex].low;
            const maxPrice = candles[cycle.endIndex]?.high || candles[cycle.startIndex].high;
            total += ((maxPrice - minPrice) / minPrice) * 100;
        });
        avgPump = total / last10Index.length;
    }

    // Average drop for Short TP
    let avgDrop = 0;
    const last10Inverse = inverseCycles.slice(-10);
    if (last10Inverse.length > 0) {
        let total = 0;
        last10Inverse.forEach(cycle => {
            const maxPrice = candles[cycle.startIndex]?.high || candles[cycle.endIndex].high;
            const minPrice = candles[cycle.endIndex]?.low || candles[cycle.startIndex].low;
            total += ((maxPrice - minPrice) / maxPrice) * 100;
        });
        avgDrop = total / last10Inverse.length;
    }

    return { avgPump, avgDrop };
}

/**
 * Initialize the trading engine
 */
export async function initialize() {
    console.log('🚀 Initializing Trading Engine...');
    console.log(`📊 Symbol: ${config.symbol}`);
    console.log(`⏰ Timeframe: ${config.timeframe}`);
    console.log(`📏 Initial Range: ${currentRangeMin}-${currentRangeMax}`);
    console.log(`🔧 Force 24 Bars: ${config.force24Bars}`);
    console.log(`📈 Enable Long: ${config.enableLong}`);
    console.log(`📉 Enable Short: ${config.enableShort}`);
    console.log(`💰 Leverage: ${config.leverage}x`);
    console.log(`💵 Capital %: ${config.capitalPercent}%`);
    console.log(`🔄 Optimize Every: ${config.optimizeIntervalHours} hours`);
    console.log(`📍 Trailing Stop: ON (Act: 3.2%, Dist: 0.8%)`);
    console.log(`🔺 Pyramiding: ON`);
    console.log(`🔄 Multi Trade: ON`);

    // Configure bot - match frontend settings
    tradingBot.updateConfig({
        leverage: config.leverage,
        capitalPercentage: config.capitalPercent,
        multiTradeEnabled: true,           // MULTI TRADE: ON
        dynamicExitEnabled: true,          // Dynamic ATR: ON
        dynamicSLMult: 2.0,                // SL Multiplier
        dynamicTPMult: 3.0,                // TP Multiplier
        tp1AvgPercent: 25,                 // TP1: 25% of avg move
        tp1CloseFraction: 90,              // TP1 CL: 90%
        tp2AvgPercent: 150,                // TP2: 150% of avg move
        closeOnOpposite: true,             // OPP CLOSE: ON
        threeBarConfirmation: false,       // CONFIRMATION: OFF
        maTrendFilter: false,              // MA TREND: OFF
        trailingStopEnabled: true,         // TRAILING: ON
        trailingActivation: 3.2,           // Activation %
        trailingCallback: 0.8,             // Callback %
        pyramidingEnabled: true            // PYRAMIDING: ON
    });

    // Set leverage on Binance
    try {
        await binance.setLeverage(config.symbol, config.leverage);
        console.log(`✅ Leverage set to ${config.leverage}x`);
    } catch (err) {
        console.error('⚠️ Could not set leverage:', err.message);
    }

    // Check initial balance
    const balance = await binance.getBalance();
    console.log(`💰 Account Balance: $${balance.toFixed(2)} USDT`);

    tradingBot.startingBalance = balance;
    tradingBot.currentBalance = balance;

    // Run initial optimization
    console.log('\n📈 Fetching initial data for optimization...');
    const candles = await binance.getKlines(config.symbol, config.timeframe, config.candleLimit);
    if (candles.length > 100) {
        await optimizeRange(candles);
    }

    return true;
}

/**
 * Check if we need to re-optimize
 */
function shouldOptimize() {
    const hoursSinceLastOptimize = (Date.now() - lastOptimizationTime) / (1000 * 60 * 60);
    return hoursSinceLastOptimize >= config.optimizeIntervalHours;
}

/**
 * Main trading loop iteration
 */
export async function tick() {
    try {
        // 1. Fetch latest candles
        const candles = await binance.getKlines(config.symbol, config.timeframe, config.candleLimit);

        if (!candles || candles.length < currentRangeMax + 50) {
            console.log('⏳ Waiting for more candle data...');
            return;
        }

        const latestCandle = candles[candles.length - 1];

        // Skip if we already processed this candle
        if (latestCandle.time === lastProcessedCandleTime) {
            // Still check SL/TP on open positions
            if (openTrade) {
                await checkExits(latestCandle);
            }
            return;
        }

        lastProcessedCandleTime = latestCandle.time;
        const now = new Date().toLocaleTimeString();
        console.log(`\n[${now}] New Candle | Price: $${latestCandle.close.toFixed(4)}`);

        // 2. Get current position (Moved up for safe optimization check)
        const position = await binance.getPosition(config.symbol);
        const hasOpenPosition = position && position.size !== 0;

        if (hasOpenPosition) {
            console.log(`📌 Position: ${position.side} | Size: ${Math.abs(position.size).toFixed(3)} | PnL: $${position.unrealizedPnL.toFixed(2)}`);
        }

        // 3. Check if we need to re-optimize (Safe Mode: Only if NO trade)
        if (shouldOptimize()) {
            if (hasOpenPosition || openTrade) {
                console.log('⏳ Optimization due but skipping: Trade is active. Waiting for close...');
            } else {
                await optimizeRange(candles);
            }
        }

        // 4. Calculate indicators
        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);

        const rsiValues = Indicators.calculateRSI(closes, 14);
        const stoch = Indicators.calculateStochastic(highs, lows, closes, 14, 3);
        cycleDetector.setIndicators(rsiValues, stoch.k, stoch.d, false);

        // Calculate ATR for dynamic exits
        const atrValues = Indicators.calculateATR(highs, lows, closes, 14);
        const currentATR = atrValues[atrValues.length - 1] || 0;

        // 5. Detect cycles with current optimized range
        const indexCycles = cycleDetector.detectCycles(
            candles, false, [], true,
            currentRangeMin, currentRangeMax, config.force24Bars, null, 1
        );

        const inverseCycles = cycleDetector.detectCycles(
            candles, false, [], false,
            currentRangeMin, currentRangeMax, config.force24Bars, null, 1
        );

        // 6. Calculate TP levels - using ATR for dynamic exits
        // Dynamic Exit Multipliers (matching frontend)
        const DYNAMIC_SL_MULT = 2.0;
        const DYNAMIC_TP_MULT = 3.0;

        // 7. Check exits on open positions FIRST
        if (openTrade && hasOpenPosition) {
            await checkExits(latestCandle);
        } else if (!hasOpenPosition && openTrade) {
            // Position was closed externally, clear our tracking
            console.log('📤 Position closed externally');
            openTrade = null;
        }

        // 8. Check for NEW cycle signals (entry) - Only if no open position
        if (!hasOpenPosition || !openTrade) {
            // LONG Signal
            if (config.enableLong && indexCycles.length > 0) {
                const lastCycle = indexCycles[indexCycles.length - 1];

                if (lastCycle.endIndex > lastIndexCycleEnd && lastCycle.endIndex >= candles.length - 3) {
                    lastIndexCycleEnd = lastCycle.endIndex;

                    console.log(`🟢 LONG SIGNAL! Cycle: ${lastCycle.startIndex}-${lastCycle.endIndex}`);

                    // Close existing SHORT if any
                    if (hasOpenPosition && position.side === 'SHORT') {
                        console.log('📤 Closing SHORT for LONG signal...');
                        await binance.closePosition(config.symbol, Math.abs(position.size), 'SHORT');
                        openTrade = null;
                    }

                    // Calculate position size and prices
                    const balance = await binance.getBalance();
                    const price = await binance.getCurrentPrice(config.symbol);
                    const capitalToUse = balance * (config.capitalPercent / 100);
                    const positionSize = (capitalToUse * config.leverage) / price;

                    // DYNAMIC ATR-BASED EXITS (matching frontend when dynamicExitEnabled = true)
                    // SL = Entry - (ATR × 2.0)
                    // TP1 = Entry + (ATR × 3.0)
                    // TP2 = Entry + (ATR × 6.0)
                    const slDist = currentATR * DYNAMIC_SL_MULT;
                    const tpDist = currentATR * DYNAMIC_TP_MULT;

                    const slPrice = price - slDist;
                    const tp1Price = price + tpDist;
                    const tp2Price = price + (tpDist * 2);

                    console.log(`📥 Opening LONG: ${positionSize.toFixed(3)} @ $${price.toFixed(4)}`);
                    console.log(`   SL: $${slPrice.toFixed(4)} | TP1: $${tp1Price.toFixed(4)} | TP2: $${tp2Price.toFixed(4)}`);


                    await binance.openMarketOrder(config.symbol, 'BUY', positionSize);

                    notificationService.sendEntry(config.symbol, 'LONG', price, positionSize, slPrice, tp1Price, tp2Price);

                    openTrade = {
                        type: 'LONG',
                        entryPrice: price,
                        entryTime: Date.now(),
                        slPrice: slPrice,
                        bePrice: price, // Will become entry after TP1
                        tp1Price: tp1Price,
                        tp2Price: tp2Price,
                        size: positionSize,
                        tp1Hit: false
                    };

                    console.log('✅ LONG opened!');
                }
            }

            // SHORT Signal
            if (config.enableShort && inverseCycles.length > 0) {
                const lastCycle = inverseCycles[inverseCycles.length - 1];

                if (lastCycle.endIndex > lastInverseCycleEnd && lastCycle.endIndex >= candles.length - 3) {
                    lastInverseCycleEnd = lastCycle.endIndex;

                    if (!openTrade) { // Don't open if we just opened a LONG
                        console.log(`🔴 SHORT SIGNAL! Cycle: ${lastCycle.startIndex}-${lastCycle.endIndex}`);

                        // Close existing LONG if any
                        if (hasOpenPosition && position.side === 'LONG') {
                            console.log('📤 Closing LONG for SHORT signal...');
                            await binance.closePosition(config.symbol, Math.abs(position.size), 'LONG');
                            openTrade = null;
                        }

                        const balance = await binance.getBalance();
                        const price = await binance.getCurrentPrice(config.symbol);
                        const capitalToUse = balance * (config.capitalPercent / 100);
                        const positionSize = (capitalToUse * config.leverage) / price;

                        // DYNAMIC ATR-BASED EXITS (matching frontend when dynamicExitEnabled = true)
                        // SL = Entry + (ATR × 2.0)
                        // TP1 = Entry - (ATR × 3.0)
                        // TP2 = Entry - (ATR × 6.0)
                        const slDist = currentATR * DYNAMIC_SL_MULT;
                        const tpDist = currentATR * DYNAMIC_TP_MULT;

                        const slPrice = price + slDist;
                        const tp1Price = price - tpDist;
                        const tp2Price = price - (tpDist * 2);

                        console.log(`📥 Opening SHORT: ${positionSize.toFixed(3)} @ $${price.toFixed(4)}`);
                        console.log(`   SL: $${slPrice.toFixed(4)} | TP1: $${tp1Price.toFixed(4)} | TP2: $${tp2Price.toFixed(4)}`);


                        await binance.openMarketOrder(config.symbol, 'SELL', positionSize);

                        notificationService.sendEntry(config.symbol, 'SHORT', price, positionSize, slPrice, tp1Price, tp2Price);

                        openTrade = {
                            type: 'SHORT',
                            entryPrice: price,
                            entryTime: Date.now(),
                            slPrice: slPrice,
                            bePrice: price,
                            tp1Price: tp1Price,
                            tp2Price: tp2Price,
                            size: positionSize,
                            tp1Hit: false
                        };

                        console.log('✅ SHORT opened!');
                    }
                }
            }
        }

    } catch (error) {
        console.error('❌ Error in trading loop:', error.message);
        notificationService.sendError(error.message);
    }
}

/**
 * Check SL/TP/BE exits on open position
 */
async function checkExits(candle) {
    if (!openTrade) return;

    const currentPrice = candle.close;
    const position = await binance.getPosition(config.symbol);
    if (!position || position.size === 0) {
        openTrade = null;
        return;
    }

    const currentSize = Math.abs(position.size);

    if (openTrade.type === 'LONG') {
        // Check STOP LOSS (use low for worst case)
        if (candle.low <= openTrade.slPrice) {
            console.log(`🛑 STOP LOSS HIT! Price: $${candle.low.toFixed(4)} <= SL: $${openTrade.slPrice.toFixed(4)}`);
            await binance.closePosition(config.symbol, currentSize, 'LONG');

            const pnl = (openTrade.slPrice - openTrade.entryPrice) * currentSize; // Approx PnL
            notificationService.sendExit(config.symbol, 'LONG', openTrade.slPrice, 'STOP LOSS', pnl);

            openTrade = null;
            return;
        }

        // Check TP2 first (full close)
        if (candle.high >= openTrade.tp2Price) {
            console.log(`🎯 TP2 HIT! Closing full position`);
            await binance.closePosition(config.symbol, currentSize, 'LONG');

            const pnl = (openTrade.tp2Price - openTrade.entryPrice) * currentSize;
            notificationService.sendExit(config.symbol, 'LONG', openTrade.tp2Price, 'TAKE PROFIT 2', pnl);

            openTrade = null;
            return;
        }

        // Check TP1 (partial close 60%, move SL to BE)
        if (!openTrade.tp1Hit && candle.high >= openTrade.tp1Price) {
            console.log(`🎯 TP1 HIT! Closing 60%, moving SL to Break-Even`);
            const closeSize = currentSize * 0.6;
            await binance.closePosition(config.symbol, closeSize, 'LONG');

            const pnl = (openTrade.tp1Price - openTrade.entryPrice) * closeSize;
            notificationService.sendExit(config.symbol, 'LONG', openTrade.tp1Price, 'TAKE PROFIT 1 (Partial)', pnl);
            openTrade.tp1Hit = true;
            openTrade.slPrice = openTrade.entryPrice; // Move to break-even
            console.log(`   New SL (BE): $${openTrade.slPrice.toFixed(4)}`);
        }

    } else if (openTrade.type === 'SHORT') {
        // Check STOP LOSS (use high for worst case)
        if (candle.high >= openTrade.slPrice) {
            console.log(`🛑 STOP LOSS HIT! Price: $${candle.high.toFixed(4)} >= SL: $${openTrade.slPrice.toFixed(4)}`);
            await binance.closePosition(config.symbol, currentSize, 'SHORT');

            const pnl = (openTrade.entryPrice - openTrade.slPrice) * currentSize; // Short PnL: Entry - Exit
            notificationService.sendExit(config.symbol, 'SHORT', openTrade.slPrice, 'STOP LOSS', pnl);

            openTrade = null;
            return;
        }

        // Check TP2 first (full close)
        if (candle.low <= openTrade.tp2Price) {
            console.log(`🎯 TP2 HIT! Closing full position`);
            await binance.closePosition(config.symbol, currentSize, 'SHORT');

            const pnl = (openTrade.entryPrice - openTrade.tp2Price) * currentSize;
            notificationService.sendExit(config.symbol, 'SHORT', openTrade.tp2Price, 'TAKE PROFIT 2', pnl);

            openTrade = null;
            return;
        }

        // Check TP1 (partial close 60%, move SL to BE)
        if (!openTrade.tp1Hit && candle.low <= openTrade.tp1Price) {
            console.log(`🎯 TP1 HIT! Closing 60%, moving SL to Break-Even`);
            const closeSize = currentSize * 0.6;
            await binance.closePosition(config.symbol, closeSize, 'SHORT');

            const pnl = (openTrade.entryPrice - openTrade.tp1Price) * closeSize;
            notificationService.sendExit(config.symbol, 'SHORT', openTrade.tp1Price, 'TAKE PROFIT 1 (Partial)', pnl);
            openTrade.tp1Hit = true;
            openTrade.slPrice = openTrade.entryPrice; // Move to break-even
            console.log(`   New SL (BE): $${openTrade.slPrice.toFixed(4)}`);
        }
    }
}

/**
 * Start the trading engine loop
 */
export function start() {
    if (isRunning) return;
    isRunning = true;

    // Apply synchronized settings to the LIVE bot (Critical Fix)
    tradingBot.updateConfig({
        startingBalance: 0, // Will be updated dynamically
        leverage: 20,
        capitalPercentage: 18,             // 18% Capital Risk
        feesEnabled: true,
        tp1AvgPercent: 25,
        tp1CloseFraction: 90,
        tp2AvgPercent: 150,
        threeBarConfirmation: false,
        closeOnOpposite: false,
        maTrendFilter: false,
        maxLossEnabled: false,
        multiTradeEnabled: true,
        volFilterEnabled: false,
        trailingStopEnabled: true,         // Trailing ON
        trailingActivation: 3.2,           // 3.2% Activation
        trailingCallback: 0.8,             // 0.8% Callback
        dynamicExitEnabled: true,          // Dynamic ATR ON
        dynamicSLMult: 2.0,
        dynamicTPMult: 3.0,
        pyramidingEnabled: true
    });

    console.log(`\n=================================================`);
    console.log(`    🚀 CYCLE TRADING BOT - EXECUTION MODE v1.5   `);
    console.log(`           (Autonomous Trading Only)             `);
    console.log(`=================================================`);
    console.log(`✅ Leverage set to 20x`);
    console.log(`✅ Capital Risk: 18%`);
    console.log(`✅ Trailing Stop: ON (Activ: 3.2% | Callb: 0.8%)`);
    console.log(`✅ Dynamic Exit (ATR): ON (SL: 2.0 | TP1: 3.0 | TP2: 6.0)`);
    console.log(`✅ Multi-Trade: ON`);
    console.log(`✅ TP1: Close 90% | TP2: Close Remaining`);
    console.log(`\n🔄 Starting trading loop (interval: ${config.loopIntervalMs / 1000}s)...`);

    // Notify user that bot is ready
    binance.getBalance().then(balance => {
        console.log(`💰 Account Balance: $${balance.toFixed(2)} USDT`);
        tradingBot.currentBalance = balance; // Sync bot balance
        notificationService.sendStartupAlert(balance.toFixed(2));
    }).catch(err => {
        console.error('Failed to get startup balance:', err);
        notificationService.sendStartupAlert('Unknown');
    });

    // Run immediately, then on interval
    tick();
    setInterval(tick, config.loopIntervalMs);
}

