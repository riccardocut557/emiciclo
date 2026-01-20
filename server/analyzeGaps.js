/**
 * Cycle Gap Analysis Script
 * Analyzes the difference between partial close (firstPotentialEnd) and true close (endIndex)
 * Looking at Volume, ATR, and Swing characteristics
 */

import CycleDetector from './cycle_detector.js';
import Indicators from './indicators.js';

const BINANCE_API = 'https://fapi.binance.com/fapi/v1/klines';

async function fetchCandles(symbol = 'SUIUSDT', timeframe = '1h', limit = 1000) {
    const url = `${BINANCE_API}?symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
    const response = await fetch(url);
    const data = await response.json();

    return data.map(k => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
    }));
}

function calculateATR(candles, period = 14) {
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);
    return Indicators.calculateATR(highs, lows, closes, period);
}

function calculateSwingStrength(candles, index, lookback = 3) {
    if (index < lookback || index >= candles.length - lookback) return 0;

    const current = candles[index];
    let higherCount = 0;
    let lowerCount = 0;

    // Check how many neighbors have lower highs (for max) or higher lows (for min)
    for (let i = 1; i <= lookback; i++) {
        // Left side
        if (candles[index - i].high < current.high) higherCount++;
        if (candles[index - i].low > current.low) lowerCount++;
        // Right side
        if (index + i < candles.length) {
            if (candles[index + i].high < current.high) higherCount++;
            if (candles[index + i].low > current.low) lowerCount++;
        }
    }

    return { swingHigh: higherCount / (lookback * 2), swingLow: lowerCount / (lookback * 2) };
}

function calculateVolumeSMA(candles, period = 20) {
    const volumes = candles.map(c => c.volume);
    const sma = [];
    for (let i = 0; i < volumes.length; i++) {
        if (i < period - 1) {
            sma.push(null);
        } else {
            const sum = volumes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            sma.push(sum / period);
        }
    }
    return sma;
}

async function analyzeGaps() {
    console.log('🔬 Fetching candle data...');
    const candles = await fetchCandles('SUIUSDT', '1h', 1000);
    console.log(`📊 Loaded ${candles.length} candles\n`);

    // Calculate indicators
    const atr = calculateATR(candles, 14);
    const volSMA = calculateVolumeSMA(candles, 20);

    // Detect cycles
    const detector = new CycleDetector();
    const indexCycles = detector.detectCycles(candles, false, [], true, 7, 35, true, null, 1);
    const inverseCycles = detector.detectCycles(candles, false, [], false, 7, 35, true, null, 1);

    console.log(`📈 Index Cycles (L-H-L): ${indexCycles.length}`);
    console.log(`📉 Inverse Cycles (H-L-H): ${inverseCycles.length}\n`);

    // Analyze gaps
    const allCycles = [...indexCycles, ...inverseCycles];
    const cyclesWithGap = allCycles.filter(c => c.firstPotentialEnd !== c.endIndex);
    const cyclesNoGap = allCycles.filter(c => c.firstPotentialEnd === c.endIndex);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    GAP ANALYSIS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total Cycles: ${allCycles.length}`);
    console.log(`Cycles WITH Gap: ${cyclesWithGap.length} (${(cyclesWithGap.length / allCycles.length * 100).toFixed(1)}%)`);
    console.log(`Cycles NO Gap: ${cyclesNoGap.length} (${(cyclesNoGap.length / allCycles.length * 100).toFixed(1)}%)\n`);

    if (cyclesWithGap.length === 0) {
        console.log('No cycles with gap found!');
        return;
    }

    // Detailed analysis for cycles with gap
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('           COMPARISON: PARTIAL vs TRUE CLOSE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    let totalGapBars = 0;
    let volumeAtPartial = [];
    let volumeAtTrue = [];
    let atrAtPartial = [];
    let atrAtTrue = [];
    let swingAtPartial = [];
    let swingAtTrue = [];
    let priceChangePercent = [];

    cyclesWithGap.forEach((cycle, idx) => {
        const partialIdx = cycle.firstPotentialEnd;
        const trueIdx = cycle.endIndex;
        const gap = trueIdx - partialIdx;
        totalGapBars += gap;

        // Volume analysis
        const volPartial = candles[partialIdx].volume;
        const volTrue = candles[trueIdx].volume;
        const volSmaPartial = volSMA[partialIdx] || 1;
        const volSmaTrue = volSMA[trueIdx] || 1;

        volumeAtPartial.push(volPartial / volSmaPartial);
        volumeAtTrue.push(volTrue / volSmaTrue);

        // ATR analysis
        const atrPartial = atr[partialIdx] || 0;
        const atrTrue = atr[trueIdx] || 0;
        atrAtPartial.push(atrPartial);
        atrAtTrue.push(atrTrue);

        // Swing strength
        const swingPartial = calculateSwingStrength(candles, partialIdx, 3);
        const swingTrue = calculateSwingStrength(candles, trueIdx, 3);
        swingAtPartial.push(cycle.type === 'inverted' ? swingPartial.swingLow : swingPartial.swingHigh);
        swingAtTrue.push(cycle.type === 'inverted' ? swingTrue.swingLow : swingTrue.swingHigh);

        // Price change
        const pricePartial = cycle.type === 'inverted' ? candles[partialIdx].low : candles[partialIdx].high;
        const priceTrue = cycle.type === 'inverted' ? candles[trueIdx].low : candles[trueIdx].high;
        const pctChange = ((priceTrue - pricePartial) / pricePartial) * 100;
        priceChangePercent.push(pctChange);
    });

    // Calculate averages
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│                    VOLUME ANALYSIS                          │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ Avg Volume/SMA at PARTIAL close: ${avg(volumeAtPartial).toFixed(2)}x              │`);
    console.log(`│ Avg Volume/SMA at TRUE close:    ${avg(volumeAtTrue).toFixed(2)}x              │`);
    console.log(`│ Difference:                      ${((avg(volumeAtTrue) - avg(volumeAtPartial)) * 100).toFixed(1)}%             │`);
    console.log('└─────────────────────────────────────────────────────────────┘\n');

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│                      ATR ANALYSIS                           │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ Avg ATR at PARTIAL close: ${avg(atrAtPartial).toFixed(4)}                    │`);
    console.log(`│ Avg ATR at TRUE close:    ${avg(atrAtTrue).toFixed(4)}                    │`);
    console.log(`│ Difference:               ${((avg(atrAtTrue) - avg(atrAtPartial)) / avg(atrAtPartial) * 100).toFixed(1)}%                       │`);
    console.log('└─────────────────────────────────────────────────────────────┘\n');

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│                    SWING STRENGTH                           │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ Avg Swing at PARTIAL close: ${(avg(swingAtPartial) * 100).toFixed(1)}%                      │`);
    console.log(`│ Avg Swing at TRUE close:    ${(avg(swingAtTrue) * 100).toFixed(1)}%                      │`);
    console.log(`│ Difference:                 ${((avg(swingAtTrue) - avg(swingAtPartial)) * 100).toFixed(1)}%                      │`);
    console.log('└─────────────────────────────────────────────────────────────┘\n');

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│                    GAP STATISTICS                           │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│ Average Gap:      ${(totalGapBars / cyclesWithGap.length).toFixed(1)} bars                            │`);
    console.log(`│ Avg Price Change: ${avg(priceChangePercent).toFixed(3)}%                           │`);
    console.log('└─────────────────────────────────────────────────────────────┘\n');

    // Detailed breakdown by gap size
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('              GAP SIZE DISTRIBUTION');
    console.log('═══════════════════════════════════════════════════════════════');

    const gapDistribution = {};
    cyclesWithGap.forEach(c => {
        const gap = c.endIndex - c.firstPotentialEnd;
        gapDistribution[gap] = (gapDistribution[gap] || 0) + 1;
    });

    Object.keys(gapDistribution).sort((a, b) => a - b).forEach(gap => {
        const count = gapDistribution[gap];
        const bar = '█'.repeat(Math.min(count, 30));
        console.log(`${gap.toString().padStart(2)} bars: ${bar} (${count})`);
    });

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                     CONCLUSIONS');
    console.log('═══════════════════════════════════════════════════════════════');

    const volDiff = avg(volumeAtTrue) - avg(volumeAtPartial);
    const swingDiff = avg(swingAtTrue) - avg(swingAtPartial);
    const atrDiff = (avg(atrAtTrue) - avg(atrAtPartial)) / avg(atrAtPartial);

    if (volDiff > 0.1) {
        console.log('✓ TRUE close has HIGHER volume than PARTIAL close');
        console.log('  → Volume spike could be used as confirmation filter');
    } else if (volDiff < -0.1) {
        console.log('✗ TRUE close has LOWER volume than PARTIAL close');
        console.log('  → Volume declining suggests exhaustion');
    } else {
        console.log('○ Volume is SIMILAR at both points');
    }

    if (swingDiff > 0.05) {
        console.log('✓ TRUE close has STRONGER swing than PARTIAL close');
        console.log('  → Extension captures better extremes');
    } else if (swingDiff < -0.05) {
        console.log('✗ TRUE close has WEAKER swing than PARTIAL close');
        console.log('  → First close may be the "real" extreme');
    } else {
        console.log('○ Swing strength is SIMILAR at both points');
    }

    if (atrDiff > 0.1) {
        console.log('✓ ATR is HIGHER at TRUE close (more volatile)');
    } else if (atrDiff < -0.1) {
        console.log('✗ ATR is LOWER at TRUE close (less volatile)');
    } else {
        console.log('○ ATR is SIMILAR at both points');
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
}

analyzeGaps().catch(console.error);
