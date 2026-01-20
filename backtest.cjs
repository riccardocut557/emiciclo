/**
 * Backtest - Trade Analysis with detailed exit reasons
 * Now includes RSI and Stochastic confirmation for min/max detection
 */

const https = require('https');

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

// RSI Calculation
function calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return new Array(closes.length).fill(50);

    const rsi = new Array(closes.length).fill(null);
    const changes = [];
    for (let i = 1; i < closes.length; i++) {
        changes.push(closes[i] - closes[i - 1]);
    }

    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) {
        if (changes[i] > 0) avgGain += changes[i];
        else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;

    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

    for (let i = period; i < changes.length; i++) {
        const gain = changes[i] > 0 ? changes[i] : 0;
        const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        rsi[i + 1] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }

    const firstValid = rsi.find(v => v !== null) || 50;
    for (let i = 0; i < rsi.length; i++) if (rsi[i] === null) rsi[i] = firstValid;
    return rsi;
}

// Stochastic Calculation
function calculateStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
    const length = closes.length;
    if (length < kPeriod) return { k: new Array(length).fill(50), d: new Array(length).fill(50) };

    const kValues = new Array(length).fill(null);
    const dValues = new Array(length).fill(null);

    for (let i = kPeriod - 1; i < length; i++) {
        let highestHigh = -Infinity, lowestLow = Infinity;
        for (let j = i - kPeriod + 1; j <= i; j++) {
            highestHigh = Math.max(highestHigh, highs[j]);
            lowestLow = Math.min(lowestLow, lows[j]);
        }
        const range = highestHigh - lowestLow;
        kValues[i] = range === 0 ? 50 : ((closes[i] - lowestLow) / range) * 100;
    }

    const firstK = kValues.find(v => v !== null) || 50;
    for (let i = 0; i < kPeriod - 1; i++) kValues[i] = firstK;

    for (let i = dPeriod - 1; i < length; i++) {
        let sum = 0;
        for (let j = i - dPeriod + 1; j <= i; j++) sum += kValues[j];
        dValues[i] = sum / dPeriod;
    }

    const firstD = dValues.find(v => v !== null) || 50;
    for (let i = 0; i < dPeriod - 1; i++) dValues[i] = firstD;

    return { k: kValues, d: dValues };
}

// Check if RSI/Stoch confirms a local MAX (overbought/bearish)
function isBearishConfirmed(index, rsi, stochK, stochD) {
    const r = rsi[index];
    const prevR = index > 0 ? rsi[index - 1] : null;
    const k = stochK[index];
    const d = stochD[index];
    const prevK = index > 0 ? stochK[index - 1] : null;
    const prevD = index > 0 ? stochD[index - 1] : null;

    // RSI overbought or declining from overbought
    const rsiConfirm = r > 70 || (prevR !== null && prevR > 70 && r < prevR);
    // Stoch high or bearish crossover
    const stochHigh = k > 70;
    const stochCross = prevK !== null && prevD !== null && prevK >= prevD && k < d;

    return rsiConfirm || stochHigh || stochCross;
}

// Check if RSI/Stoch confirms a local MIN (oversold/bullish)
function isBullishConfirmed(index, rsi, stochK, stochD) {
    const r = rsi[index];
    const prevR = index > 0 ? rsi[index - 1] : null;
    const k = stochK[index];
    const d = stochD[index];
    const prevK = index > 0 ? stochK[index - 1] : null;
    const prevD = index > 0 ? stochD[index - 1] : null;

    // RSI oversold or recovering from oversold
    const rsiConfirm = r < 30 || (prevR !== null && prevR < 30 && r > prevR);
    // Stoch low or bullish crossover
    const stochLow = k < 30;
    const stochCross = prevK !== null && prevD !== null && prevK <= prevD && k > d;

    return rsiConfirm || stochLow || stochCross;
}

function checkLocalMax(candles, index, rsi, stochK, stochD, useConfirmation = true) {
    if (index < 1 || index >= candles.length - 1) return false;
    const isMax = candles[index].high > candles[index - 1].high && candles[index].high > candles[index + 1].high;
    if (!isMax) return false;
    if (useConfirmation && !isBearishConfirmed(index, rsi, stochK, stochD)) return false;
    return true;
}

function checkLocalMin(candles, index, rsi, stochK, stochD, useConfirmation = true) {
    if (index < 1 || index >= candles.length - 1) return false;
    const isMin = candles[index].low < candles[index - 1].low && candles[index].low < candles[index + 1].low;
    if (!isMin) return false;
    if (useConfirmation && !isBullishConfirmed(index, rsi, stochK, stochD)) return false;
    return true;
}

function detectCycles(candles, invert, rsi, stochK, stochD, minDuration = 24, maxDuration = 44, useConfirmation = true) {
    const cycles = [];
    let i = 0;
    while (i < candles.length - minDuration) {
        const isStart = invert ? checkLocalMin(candles, i, rsi, stochK, stochD, useConfirmation) : checkLocalMax(candles, i, rsi, stochK, stochD, useConfirmation);
        if (!isStart) { i++; continue; }
        for (let j = i + minDuration; j <= Math.min(i + maxDuration, candles.length - 2); j++) {
            const isEnd = invert ? checkLocalMin(candles, j, rsi, stochK, stochD, useConfirmation) : checkLocalMax(candles, j, rsi, stochK, stochD, useConfirmation);
            if (isEnd) { cycles.push({ startIndex: i, endIndex: j }); i = j; break; }
        }
        i++;
    }
    return cycles;
}

async function main() {
    console.log('Fetching data...\n');

    const baseUrl = 'https://fapi.binance.com/fapi/v1/klines';
    const data = await fetchJSON(`${baseUrl}?symbol=BTCUSDT&interval=15m&limit=1000`);
    const candles = data.map(c => ({
        open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4])
    }));

    console.log(`Loaded ${candles.length} candles (15m BTCUSDT)\n`);

    // Calculate RSI and Stochastic
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const rsi = calculateRSI(closes, 14);
    const stoch = calculateStochastic(highs, lows, closes, 14, 3);

    console.log('RSI/Stochastic confirmation ENABLED\n');

    // Detect cycles with RSI/Stoch confirmation
    const indexCycles = detectCycles(candles, true, rsi, stoch.k, stoch.d);  // Inverted -> LONG
    const inverseCycles = detectCycles(candles, false, rsi, stoch.k, stoch.d); // Normal -> SHORT

    console.log(`Index cycles (LONG signals): ${indexCycles.length}`);
    console.log(`Inverse cycles (SHORT signals): ${inverseCycles.length}\n`);

    // Calculate averages (last 10)
    const last10Index = indexCycles.slice(-10);
    const last10Inverse = inverseCycles.slice(-10);

    let avgIndexPump = 0;
    last10Index.forEach(c => {
        avgIndexPump += ((candles[c.endIndex].high - candles[c.startIndex].low) / candles[c.startIndex].low) * 100;
    });
    avgIndexPump = last10Index.length > 0 ? avgIndexPump / last10Index.length : 0;

    let avgInverseDrop = 0;
    last10Inverse.forEach(c => {
        avgInverseDrop += ((candles[c.startIndex].high - candles[c.endIndex].low) / candles[c.startIndex].high) * 100;
    });
    avgInverseDrop = last10Inverse.length > 0 ? avgInverseDrop / last10Inverse.length : 0;

    console.log(`Avg Index Pump (last 10): ${avgIndexPump.toFixed(2)}%`);
    console.log(`Avg Inverse Drop (last 10): ${avgInverseDrop.toFixed(2)}%`);
    console.log(`TP1 target LONG: ${(avgIndexPump * 0.5).toFixed(2)}%`);
    console.log(`TP1 target SHORT: ${(avgInverseDrop * 0.5).toFixed(2)}%\n`);

    // Simulate trades
    const leverage = 20;
    const capitalPct = 20;
    const startBal = 1000;
    let balance = startBal;

    const trades = [];

    // Build signals
    const signals = new Map();
    indexCycles.forEach(c => {
        const idx = c.endIndex + 1;
        if (idx < candles.length) {
            if (!signals.has(idx)) signals.set(idx, []);
            signals.get(idx).push({ type: 'LONG', slPrice: candles[c.startIndex].low });
        }
    });
    inverseCycles.forEach(c => {
        const idx = c.endIndex + 1;
        if (idx < candles.length) {
            if (!signals.has(idx)) signals.set(idx, []);
            signals.get(idx).push({ type: 'SHORT', slPrice: candles[c.startIndex].high });
        }
    });

    let pos = null;

    for (let i = 0; i < candles.length; i++) {
        const cdl = candles[i];

        // Check exits
        if (pos) {
            // LONG exits
            if (pos.type === 'LONG') {
                // SL: close below cycle min
                if (cdl.close < pos.slPrice && !pos.beActive) {
                    const pnl = ((cdl.close - pos.entry) / pos.entry) * pos.cap * leverage;
                    trades.push({ ...pos, exit: cdl.close, exitIdx: i, reason: 'sl_cycle_min', pnl });
                    balance += pnl;
                    pos = null;
                }
                // BE SL
                else if (pos.beActive && cdl.close <= pos.entry) {
                    const pnl = 0;
                    trades.push({ ...pos, exit: pos.entry, exitIdx: i, reason: 'break_even', pnl });
                    pos = null;
                }
                // TP1
                else if (!pos.tp1Done) {
                    const pump = ((cdl.close - pos.entry) / pos.entry) * 100;
                    const tp1 = avgIndexPump * 0.5;
                    if (pump >= tp1 && tp1 > 0) {
                        const closedCap = pos.cap * 0.6;
                        const pnl = (pump / 100) * closedCap * leverage;
                        trades.push({ ...pos, exit: cdl.close, exitIdx: i, reason: 'tp1_partial', pnl, partial: '60%' });
                        balance += pnl;
                        pos.cap -= closedCap;
                        pos.tp1Done = true;
                        pos.beActive = true;
                    }
                }
                // TP2
                else if (pos.tp1Done) {
                    const pnlAmt = ((cdl.close - pos.entry) / pos.entry) * pos.cap * leverage;
                    const tp2 = startBal * 0.01;
                    if (pnlAmt >= tp2) {
                        trades.push({ ...pos, exit: cdl.close, exitIdx: i, reason: 'tp2_account', pnl: pnlAmt });
                        balance += pnlAmt;
                        pos = null;
                    }
                }
            }

            // SHORT exits
            if (pos && pos.type === 'SHORT') {
                // SL: close above cycle max
                if (cdl.close > pos.slPrice && !pos.beActive) {
                    const pnl = ((pos.entry - cdl.close) / pos.entry) * pos.cap * leverage;
                    trades.push({ ...pos, exit: cdl.close, exitIdx: i, reason: 'sl_cycle_max', pnl });
                    balance += pnl;
                    pos = null;
                }
                // BE SL
                else if (pos.beActive && cdl.close >= pos.entry) {
                    const pnl = 0;
                    trades.push({ ...pos, exit: pos.entry, exitIdx: i, reason: 'break_even', pnl });
                    pos = null;
                }
                // TP1
                else if (!pos.tp1Done) {
                    const drop = ((pos.entry - cdl.close) / pos.entry) * 100;
                    const tp1 = avgInverseDrop * 0.5;
                    if (drop >= tp1 && tp1 > 0) {
                        const closedCap = pos.cap * 0.6;
                        const pnl = (drop / 100) * closedCap * leverage;
                        trades.push({ ...pos, exit: cdl.close, exitIdx: i, reason: 'tp1_partial', pnl, partial: '60%' });
                        balance += pnl;
                        pos.cap -= closedCap;
                        pos.tp1Done = true;
                        pos.beActive = true;
                    }
                }
                // TP2
                else if (pos.tp1Done) {
                    const pnlAmt = ((pos.entry - cdl.close) / pos.entry) * pos.cap * leverage;
                    const tp2 = startBal * 0.01;
                    if (pnlAmt >= tp2) {
                        trades.push({ ...pos, exit: cdl.close, exitIdx: i, reason: 'tp2_account', pnl: pnlAmt });
                        balance += pnlAmt;
                        pos = null;
                    }
                }
            }
        }

        // New entries
        if (signals.has(i)) {
            const sigs = signals.get(i);
            for (const sig of sigs) {
                if (pos && pos.type !== sig.type) {
                    // Close opposite
                    const pnl = pos.type === 'LONG'
                        ? ((cdl.open - pos.entry) / pos.entry) * pos.cap * leverage
                        : ((pos.entry - cdl.open) / pos.entry) * pos.cap * leverage;
                    trades.push({ ...pos, exit: cdl.open, exitIdx: i, reason: 'opposite_signal', pnl });
                    balance += pnl;
                    pos = null;
                }
                if (!pos) {
                    pos = {
                        type: sig.type,
                        entry: cdl.open,
                        entryIdx: i,
                        cap: balance * (capitalPct / 100),
                        slPrice: sig.slPrice,
                        tp1Done: false,
                        beActive: false
                    };
                }
                break;
            }
        }
    }

    // Close remaining
    if (pos) {
        const cdl = candles[candles.length - 1];
        const pnl = pos.type === 'LONG'
            ? ((cdl.close - pos.entry) / pos.entry) * pos.cap * leverage
            : ((pos.entry - cdl.close) / pos.entry) * pos.cap * leverage;
        trades.push({ ...pos, exit: cdl.close, exitIdx: candles.length - 1, reason: 'end_of_data', pnl });
        balance += pnl;
    }

    // Output table
    console.log('\n=== TRADE LIST ===\n');
    console.log('| # | Type  | Entry Price | Exit Price  | Entry Idx | Exit Idx | Reason          | PnL      |');
    console.log('|---|-------|-------------|-------------|-----------|----------|-----------------|----------|');

    trades.forEach((t, i) => {
        const pnlStr = (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(2);
        const partial = t.partial ? ` (${t.partial})` : '';
        console.log(`| ${String(i + 1).padStart(1)} | ${t.type.padEnd(5)} | ${t.entry.toFixed(2).padStart(11)} | ${t.exit.toFixed(2).padStart(11)} | ${String(t.entryIdx).padStart(9)} | ${String(t.exitIdx).padStart(8)} | ${(t.reason + partial).padEnd(15)} | ${pnlStr.padStart(8)} |`);
    });

    // Stats by reason
    console.log('\n=== EXIT REASONS SUMMARY ===\n');
    const reasonCounts = {};
    trades.forEach(t => {
        if (!reasonCounts[t.reason]) reasonCounts[t.reason] = { count: 0, pnl: 0 };
        reasonCounts[t.reason].count++;
        reasonCounts[t.reason].pnl += t.pnl;
    });

    console.log('| Reason          | Count | Total PnL |');
    console.log('|-----------------|-------|-----------|');
    Object.keys(reasonCounts).forEach(r => {
        const pnlStr = (reasonCounts[r].pnl >= 0 ? '+' : '') + reasonCounts[r].pnl.toFixed(2);
        console.log(`| ${r.padEnd(15)} | ${String(reasonCounts[r].count).padStart(5)} | ${pnlStr.padStart(9)} |`);
    });

    console.log(`\nTotal Trades: ${trades.length}`);
    console.log(`Final Balance: $${balance.toFixed(2)} (${((balance / startBal - 1) * 100).toFixed(2)}%)`);
}

main().catch(console.error);
