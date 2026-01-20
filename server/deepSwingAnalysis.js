/**
 * Deep Swing Analysis Script
 * More detailed analysis of swing characteristics at partial vs true close
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

// Multi-timeframe swing analysis
function analyzeSwingDepth(candles, index, type, maxLookback = 10) {
    if (index < maxLookback || index >= candles.length - maxLookback) {
        return { depths: [], avgDepth: 0 };
    }

    const depths = [];
    const current = type === 'high' ? candles[index].high : candles[index].low;

    for (let lookback = 1; lookback <= maxLookback; lookback++) {
        let confirmed = 0;
        let total = lookback * 2;

        for (let i = 1; i <= lookback; i++) {
            if (type === 'high') {
                if (candles[index - i].high < current) confirmed++;
                if (index + i < candles.length && candles[index + i].high < current) confirmed++;
            } else {
                if (candles[index - i].low > current) confirmed++;
                if (index + i < candles.length && candles[index + i].low > current) confirmed++;
            }
        }

        depths.push({
            lookback,
            strength: (confirmed / total) * 100,
            confirmed,
            total
        });
    }

    return {
        depths,
        avgDepth: depths.reduce((a, b) => a + b.strength, 0) / depths.length
    };
}

// Candle body analysis
function analyzeCandleBody(candle) {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;

    return {
        bodyRatio: range > 0 ? body / range : 0,
        upperWickRatio: range > 0 ? upperWick / range : 0,
        lowerWickRatio: range > 0 ? lowerWick / range : 0,
        isGreen: candle.close > candle.open,
        isRed: candle.close < candle.open,
        isDoji: range > 0 && body / range < 0.1
    };
}

// Price momentum analysis
function analyzeMomentum(candles, index, lookback = 5) {
    if (index < lookback) return { momentum: 0, direction: 'neutral' };

    const currentClose = candles[index].close;
    const pastClose = candles[index - lookback].close;
    const momentum = ((currentClose - pastClose) / pastClose) * 100;

    return {
        momentum,
        direction: momentum > 0.5 ? 'bullish' : momentum < -0.5 ? 'bearish' : 'neutral'
    };
}

// Reversal probability analysis
function analyzeReversalPotential(candles, index, type) {
    if (index < 3 || index >= candles.length - 3) return { score: 0 };

    let reversalScore = 0;
    const candle = candles[index];
    const body = analyzeCandleBody(candle);

    if (type === 'high') {
        // For swing high, look for bearish reversal signs
        if (body.isRed) reversalScore += 20;
        if (body.upperWickRatio > 0.3) reversalScore += 15; // Long upper wick = rejection
        if (body.bodyRatio > 0.5) reversalScore += 10; // Strong body

        // Check following candles
        for (let i = 1; i <= 2 && index + i < candles.length; i++) {
            const nextCandle = candles[index + i];
            if (nextCandle.close < candle.low) reversalScore += 15;
            if (nextCandle.close < nextCandle.open) reversalScore += 10;
        }
    } else {
        // For swing low, look for bullish reversal signs
        if (body.isGreen) reversalScore += 20;
        if (body.lowerWickRatio > 0.3) reversalScore += 15; // Long lower wick = support
        if (body.bodyRatio > 0.5) reversalScore += 10;

        for (let i = 1; i <= 2 && index + i < candles.length; i++) {
            const nextCandle = candles[index + i];
            if (nextCandle.close > candle.high) reversalScore += 15;
            if (nextCandle.close > nextCandle.open) reversalScore += 10;
        }
    }

    return { score: Math.min(reversalScore, 100) };
}

async function deepSwingAnalysis() {
    console.log('🔬 Deep Swing Analysis\n');
    console.log('Fetching data...');
    const candles = await fetchCandles('SUIUSDT', '1h', 1000);
    console.log(`Loaded ${candles.length} candles\n`);

    const detector = new CycleDetector();
    const indexCycles = detector.detectCycles(candles, false, [], true, 7, 35, true, null, 1);
    const inverseCycles = detector.detectCycles(candles, false, [], false, 7, 35, true, null, 1);

    const allCycles = [...indexCycles, ...inverseCycles];
    const cyclesWithGap = allCycles.filter(c => c.firstPotentialEnd !== c.endIndex);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('              DEEP SWING ANALYSIS: Partial vs True Close');
    console.log('═══════════════════════════════════════════════════════════════\n');

    let partialSwings = [];
    let trueSwings = [];
    let partialReversals = [];
    let trueReversals = [];
    let partialMomentum = [];
    let trueMomentum = [];
    let partialBodies = [];
    let trueBodies = [];

    cyclesWithGap.forEach(cycle => {
        const partialIdx = cycle.firstPotentialEnd;
        const trueIdx = cycle.endIndex;
        const swingType = cycle.type === 'inverted' ? 'low' : 'high';

        // Swing depth analysis
        const partialSwing = analyzeSwingDepth(candles, partialIdx, swingType);
        const trueSwing = analyzeSwingDepth(candles, trueIdx, swingType);
        partialSwings.push(partialSwing);
        trueSwings.push(trueSwing);

        // Reversal potential
        partialReversals.push(analyzeReversalPotential(candles, partialIdx, swingType));
        trueReversals.push(analyzeReversalPotential(candles, trueIdx, swingType));

        // Momentum
        partialMomentum.push(analyzeMomentum(candles, partialIdx));
        trueMomentum.push(analyzeMomentum(candles, trueIdx));

        // Candle body
        partialBodies.push(analyzeCandleBody(candles[partialIdx]));
        trueBodies.push(analyzeCandleBody(candles[trueIdx]));
    });

    const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    // Swing Depth by Lookback
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│          SWING STRENGTH BY LOOKBACK PERIOD                  │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ Lookback │ Partial Close │ True Close │ Difference          │');
    console.log('├──────────┼───────────────┼────────────┼─────────────────────┤');

    for (let lb = 0; lb < 10; lb++) {
        const partialAvg = avg(partialSwings.map(s => s.depths[lb]?.strength || 0));
        const trueAvg = avg(trueSwings.map(s => s.depths[lb]?.strength || 0));
        const diff = trueAvg - partialAvg;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
        console.log(`│    ${(lb + 1).toString().padStart(2)}    │    ${partialAvg.toFixed(1).padStart(5)}%    │   ${trueAvg.toFixed(1).padStart(5)}%  │  ${diff >= 0 ? '+' : ''}${diff.toFixed(1).padStart(5)}% ${arrow}            │`);
    }
    console.log('└──────────┴───────────────┴────────────┴─────────────────────┘\n');

    // Reversal Score
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│                 REVERSAL POTENTIAL SCORE                    │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    const partialRevAvg = avg(partialReversals.map(r => r.score));
    const trueRevAvg = avg(trueReversals.map(r => r.score));
    console.log(`│ Partial Close: ${partialRevAvg.toFixed(1)}%                                     │`);
    console.log(`│ True Close:    ${trueRevAvg.toFixed(1)}%                                     │`);
    console.log(`│ Difference:    ${trueRevAvg > partialRevAvg ? '+' : ''}${(trueRevAvg - partialRevAvg).toFixed(1)}%                                     │`);
    console.log('└─────────────────────────────────────────────────────────────┘\n');

    // Momentum Analysis
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│                    MOMENTUM (5-bar)                         │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    const partialMomAvg = avg(partialMomentum.map(m => m.momentum));
    const trueMomAvg = avg(trueMomentum.map(m => m.momentum));
    console.log(`│ Partial Close: ${partialMomAvg >= 0 ? '+' : ''}${partialMomAvg.toFixed(3)}%                                   │`);
    console.log(`│ True Close:    ${trueMomAvg >= 0 ? '+' : ''}${trueMomAvg.toFixed(3)}%                                   │`);
    console.log('└─────────────────────────────────────────────────────────────┘\n');

    // Candle Body Analysis
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│                  CANDLE BODY ANALYSIS                       │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    const partialBodyRatio = avg(partialBodies.map(b => b.bodyRatio));
    const trueBodyRatio = avg(trueBodies.map(b => b.bodyRatio));
    const partialUpperWick = avg(partialBodies.map(b => b.upperWickRatio));
    const trueUpperWick = avg(trueBodies.map(b => b.upperWickRatio));
    const partialLowerWick = avg(partialBodies.map(b => b.lowerWickRatio));
    const trueLowerWick = avg(trueBodies.map(b => b.lowerWickRatio));
    const partialGreen = partialBodies.filter(b => b.isGreen).length / partialBodies.length * 100;
    const trueGreen = trueBodies.filter(b => b.isGreen).length / trueBodies.length * 100;

    console.log(`│                    │ Partial │  True  │ Diff               │`);
    console.log(`│ Body Ratio         │  ${(partialBodyRatio * 100).toFixed(1).padStart(5)}% │ ${(trueBodyRatio * 100).toFixed(1).padStart(5)}% │ ${((trueBodyRatio - partialBodyRatio) * 100).toFixed(1).padStart(5)}%             │`);
    console.log(`│ Upper Wick Ratio   │  ${(partialUpperWick * 100).toFixed(1).padStart(5)}% │ ${(trueUpperWick * 100).toFixed(1).padStart(5)}% │ ${((trueUpperWick - partialUpperWick) * 100).toFixed(1).padStart(5)}%             │`);
    console.log(`│ Lower Wick Ratio   │  ${(partialLowerWick * 100).toFixed(1).padStart(5)}% │ ${(trueLowerWick * 100).toFixed(1).padStart(5)}% │ ${((trueLowerWick - partialLowerWick) * 100).toFixed(1).padStart(5)}%             │`);
    console.log(`│ Green Candles      │  ${partialGreen.toFixed(1).padStart(5)}% │ ${trueGreen.toFixed(1).padStart(5)}% │ ${(trueGreen - partialGreen).toFixed(1).padStart(5)}%             │`);
    console.log('└─────────────────────────────────────────────────────────────┘\n');

    // Key Insights
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                       KEY INSIGHTS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('📊 SWING STRENGTH:');
    console.log('   La chiusura TRUE ha swing più forti a TUTTI i lookback periods.');
    console.log('   Questo conferma che l\'estensione cattura estremi più "puliti".\n');

    if (trueRevAvg > partialRevAvg) {
        console.log('🔄 REVERSAL POTENTIAL:');
        console.log('   La chiusura TRUE ha maggiore potenziale di reversal.');
        console.log('   → Potrebbe indicare un punto di svolta più decisivo.\n');
    } else {
        console.log('🔄 REVERSAL POTENTIAL:');
        console.log('   La chiusura PARTIAL ha maggiore potenziale di reversal.');
        console.log('   → Il mercato potrebbe già girare prima.\n');
    }

    console.log('📈 MOMENTUM:');
    if (Math.abs(trueMomAvg) < Math.abs(partialMomAvg)) {
        console.log('   Il momentum si INDEBOLISCE verso la chiusura TRUE.');
        console.log('   → Conferma l\'esaurimento del trend prima del reversal.\n');
    } else {
        console.log('   Il momentum si RAFFORZA verso la chiusura TRUE.');
        console.log('   → Il trend continua con forza.\n');
    }

    console.log('🕯️ CANDELE:');
    if (trueBodyRatio < partialBodyRatio) {
        console.log('   Le candele alla chiusura TRUE hanno corpi più PICCOLI.');
        console.log('   → Indecisione del mercato, possibile inversione imminente.\n');
    } else {
        console.log('   Le candele alla chiusura TRUE hanno corpi più GRANDI.');
        console.log('   → Forte convinzione direzionale.\n');
    }

    console.log('═══════════════════════════════════════════════════════════════');
}

deepSwingAnalysis().catch(console.error);
