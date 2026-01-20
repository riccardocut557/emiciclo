/**
 * Technical Indicators for Cycle Detection
 * RSI, Stochastic, ATR, ADX calculations
 */

class Indicators {
    /**
     * Calculate RSI (Relative Strength Index)
     * @param {Array} closes - Array of closing prices
     * @param {number} period - RSI period (default 14)
     * @returns {Array} Array of RSI values (0-100)
     */
    static calculateRSI(closes, period = 14) {
        if (closes.length < period + 1) {
            return new Array(closes.length).fill(50); // Neutral value
        }

        const rsi = new Array(closes.length).fill(null);

        // Calculate price changes
        const changes = [];
        for (let i = 1; i < closes.length; i++) {
            changes.push(closes[i] - closes[i - 1]);
        }

        // Calculate initial average gain and loss
        let avgGain = 0;
        let avgLoss = 0;

        for (let i = 0; i < period; i++) {
            if (changes[i] > 0) {
                avgGain += changes[i];
            } else {
                avgLoss += Math.abs(changes[i]);
            }
        }

        avgGain /= period;
        avgLoss /= period;

        // First RSI value
        if (avgLoss === 0) {
            rsi[period] = 100;
        } else {
            const rs = avgGain / avgLoss;
            rsi[period] = 100 - (100 / (1 + rs));
        }

        // Calculate remaining RSI values using smoothed averages
        for (let i = period; i < changes.length; i++) {
            const change = changes[i];
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;

            avgGain = ((avgGain * (period - 1)) + gain) / period;
            avgLoss = ((avgLoss * (period - 1)) + loss) / period;

            if (avgLoss === 0) {
                rsi[i + 1] = 100;
            } else {
                const rs = avgGain / avgLoss;
                rsi[i + 1] = 100 - (100 / (1 + rs));
            }
        }

        // Fill initial nulls with first valid value
        const firstValid = rsi.find(v => v !== null) || 50;
        for (let i = 0; i < rsi.length; i++) {
            if (rsi[i] === null) rsi[i] = firstValid;
        }

        return rsi;
    }

    /**
     * Calculate Stochastic Oscillator
     * @param {Array} highs - Array of high prices
     * @param {Array} lows - Array of low prices
     * @param {Array} closes - Array of closing prices
     * @param {number} kPeriod - %K period (default 14)
     * @param {number} dPeriod - %D smoothing period (default 3)
     * @returns {Object} { k: Array, d: Array } - %K and %D values (0-100)
     */
    static calculateStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
        const length = closes.length;

        if (length < kPeriod) {
            return {
                k: new Array(length).fill(50),
                d: new Array(length).fill(50)
            };
        }

        const kValues = new Array(length).fill(null);
        const dValues = new Array(length).fill(null);

        // Calculate %K values
        for (let i = kPeriod - 1; i < length; i++) {
            // Find highest high and lowest low in the period
            let highestHigh = -Infinity;
            let lowestLow = Infinity;

            for (let j = i - kPeriod + 1; j <= i; j++) {
                highestHigh = Math.max(highestHigh, highs[j]);
                lowestLow = Math.min(lowestLow, lows[j]);
            }

            const range = highestHigh - lowestLow;
            if (range === 0) {
                kValues[i] = 50; // Neutral if no range
            } else {
                kValues[i] = ((closes[i] - lowestLow) / range) * 100;
            }
        }

        // Fill initial nulls with first valid value
        const firstValidK = kValues.find(v => v !== null) || 50;
        for (let i = 0; i < kPeriod - 1; i++) {
            kValues[i] = firstValidK;
        }

        // Calculate %D (SMA of %K)
        for (let i = dPeriod - 1; i < length; i++) {
            let sum = 0;
            for (let j = i - dPeriod + 1; j <= i; j++) {
                sum += kValues[j];
            }
            dValues[i] = sum / dPeriod;
        }

        // Fill initial nulls for %D
        const firstValidD = dValues.find(v => v !== null) || 50;
        for (let i = 0; i < dPeriod - 1; i++) {
            dValues[i] = firstValidD;
        }

        return { k: kValues, d: dValues };
    }

    /**
     * Calculate ATR (Average True Range)
     * @param {Array} highs - Array of high prices
     * @param {Array} lows - Array of low prices
     * @param {Array} closes - Array of closing prices
     * @param {number} period - ATR period (default 14)
     * @returns {Array} Array of ATR values
     */
    static calculateATR(highs, lows, closes, period = 14) {
        const tr = new Array(closes.length).fill(0);
        const atr = new Array(closes.length).fill(0);

        // True Range Calculation
        // TR = Max(High - Low, |High - PrevClose|, |Low - PrevClose|)
        // First TR is High - Low
        tr[0] = highs[0] - lows[0];

        for (let i = 1; i < closes.length; i++) {
            const hl = highs[i] - lows[i];
            const hc = Math.abs(highs[i] - closes[i - 1]);
            const lc = Math.abs(lows[i] - closes[i - 1]);
            tr[i] = Math.max(hl, hc, lc);
        }

        // First ATR is simple average of TRs
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += tr[i];
        }
        atr[period - 1] = sum / period;

        // Wilder's Smoothing for subsequent ATRs
        // ATR = ((PrevATR * (period - 1)) + CurrentTR) / period
        for (let i = period; i < closes.length; i++) {
            atr[i] = ((atr[i - 1] * (period - 1)) + tr[i]) / period;
        }

        // Fill initial 0s with first valid
        const firstValid = atr[period - 1];
        for (let i = 0; i < period - 1; i++) {
            atr[i] = firstValid || tr[i]; // Fallback to TR if ATR usually not ready
        }

        return atr;
    }

    /**
     * Calculate ADX (Average Directional Index)
     * @param {Array} highs 
     * @param {Array} lows 
     * @param {Array} closes 
     * @param {number} period (default 14)
     * @returns {Array} ADX values
     */
    static calculateADX(highs, lows, closes, period = 14) {
        const length = closes.length;
        const adx = new Array(length).fill(0);

        const tr = new Array(length).fill(0);
        const dmPlus = new Array(length).fill(0);
        const dmMinus = new Array(length).fill(0);

        // 1. Calculate TR and Directional Movements (+DM, -DM)
        tr[0] = highs[0] - lows[0];

        for (let i = 1; i < length; i++) {
            const hl = highs[i] - lows[i];
            const hc = Math.abs(highs[i] - closes[i - 1]);
            const lc = Math.abs(lows[i] - closes[i - 1]);
            tr[i] = Math.max(hl, hc, lc);

            const upMove = highs[i] - highs[i - 1];
            const downMove = lows[i - 1] - lows[i];

            if (upMove > downMove && upMove > 0) {
                dmPlus[i] = upMove;
            } else {
                dmPlus[i] = 0;
            }

            if (downMove > upMove && downMove > 0) {
                dmMinus[i] = downMove;
            } else {
                dmMinus[i] = 0;
            }
        }

        // 2. Smoothed TR and DMs (Wilder's Smoothing)
        // Initial Sum
        let trSmooth = 0;
        let dmPlusSmooth = 0;
        let dmMinusSmooth = 0;

        for (let i = 0; i < period; i++) {
            trSmooth += tr[i];
            dmPlusSmooth += dmPlus[i];
            dmMinusSmooth += dmMinus[i];
        }

        // First ADX related calcs start at index 'period - 1'? Or 'period'?
        // Usually smoothing starts after period.

        const diPlus = new Array(length).fill(0);
        const diMinus = new Array(length).fill(0);
        const dx = new Array(length).fill(0);

        // Continue smoothing
        for (let i = period; i < length; i++) {
            trSmooth = trSmooth - (trSmooth / period) + tr[i];
            dmPlusSmooth = dmPlusSmooth - (dmPlusSmooth / period) + dmPlus[i];
            dmMinusSmooth = dmMinusSmooth - (dmMinusSmooth / period) + dmMinus[i];

            diPlus[i] = (dmPlusSmooth / trSmooth) * 100;
            diMinus[i] = (dmMinusSmooth / trSmooth) * 100;

            const diSum = diPlus[i] + diMinus[i];
            if (diSum === 0) {
                dx[i] = 0;
            } else {
                dx[i] = Math.abs(diPlus[i] - diMinus[i]) / diSum * 100;
            }
        }

        // 3. Calculate ADX (Smoothed DX)
        // First ADX is average of DX over period
        let dxSum = 0;
        for (let i = period; i < period * 2; i++) {
            dxSum += dx[i];
        }

        if (period * 2 < length) {
            adx[period * 2 - 1] = dxSum / period;

            for (let i = period * 2; i < length; i++) {
                adx[i] = ((adx[i - 1] * (period - 1)) + dx[i]) / period;
            }
        }

        // Fill initial values
        const firstValid = adx.find(v => v !== 0) || 20;
        for (let i = 0; i < length; i++) {
            if (adx[i] === 0) adx[i] = firstValid;
        }

        return adx;
    }

    /**
     * Calculate Simple Moving Average of Volume
     * @param {Array} volumes 
     * @param {number} period 
     */
    static calculateSMA(values, period) {
        const sma = new Array(values.length).fill(0);
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += values[i];
        }
        sma[period - 1] = sum / period;

        for (let i = period; i < values.length; i++) {
            sum = sum - values[i - period] + values[i];
            sma[i] = sum / period;
        }
        // Fill initial
        for (let i = 0; i < period - 1; i++) sma[i] = sma[period - 1];
        return sma;
    }

    /**
     * Check if RSI indicates oversold condition (potential bottom)
     * @param {number} rsi - Current RSI value
     * @param {number} prevRsi - Previous RSI value
     * @param {number} threshold - Oversold threshold (default 30)
     * @returns {boolean}
     */
    static isRSIOversold(rsi, prevRsi = null, threshold = 30) {
        if (rsi === null) return false;
        // Currently oversold OR recovering from oversold
        if (rsi < threshold) return true;
        if (prevRsi !== null && prevRsi < threshold && rsi > prevRsi) return true;
        return false;
    }

    /**
     * Check if RSI indicates overbought condition (potential top)
     * @param {number} rsi - Current RSI value
     * @param {number} prevRsi - Previous RSI value
     * @param {number} threshold - Overbought threshold (default 70)
     * @returns {boolean}
     */
    static isRSIOverbought(rsi, prevRsi = null, threshold = 70) {
        if (rsi === null) return false;
        // Currently overbought OR declining from overbought
        if (rsi > threshold) return true;
        if (prevRsi !== null && prevRsi > threshold && rsi < prevRsi) return true;
        return false;
    }

    /**
     * Check for bullish Stochastic crossover (%K crosses above %D)
     * @param {number} k - Current %K value
     * @param {number} d - Current %D value
     * @param {number} prevK - Previous %K value
     * @param {number} prevD - Previous %D value
     * @returns {boolean}
     */
    static isStochBullishCrossover(k, d, prevK, prevD) {
        if (k === null || d === null || prevK === null || prevD === null) return false;
        // %K crossed above %D
        return prevK <= prevD && k > d;
    }

    /**
     * Check for bearish Stochastic crossover (%K crosses below %D)
     * @param {number} k - Current %K value
     * @param {number} d - Current %D value
     * @param {number} prevK - Previous %K value
     * @param {number} prevD - Previous %D value
     * @returns {boolean}
     */
    static isStochBearishCrossover(k, d, prevK, prevD) {
        if (k === null || d === null || prevK === null || prevD === null) return false;
        // %K crossed below %D
        return prevK >= prevD && k < d;
    }

    /**
     * Check for combined bullish confirmation (for local MIN detection)
     * @param {Object} params - { rsi, prevRsi, stochK, stochD, prevStochK, prevStochD, rsiOversold, stochOversold }
     * @returns {boolean}
     */
    static isBullishConfirmation(params) {
        const {
            rsi, prevRsi, stochK, stochD, prevStochK, prevStochD,
            rsiOversold = 30, stochOversold = 30
        } = params;

        // RSI in oversold territory OR recovering from it
        const rsiConfirm = this.isRSIOversold(rsi, prevRsi, rsiOversold);

        // Stochastic showing bullish signal (low value OR bullish crossover)
        const stochLow = stochK !== null && stochK < stochOversold;
        const stochCross = this.isStochBullishCrossover(stochK, stochD, prevStochK, prevStochD);
        const stochConfirm = stochLow || stochCross;

        // At least one confirmation
        return rsiConfirm || stochConfirm;
    }

    /**
     * Check for combined bearish confirmation (for local MAX detection)
     * @param {Object} params - { rsi, prevRsi, stochK, stochD, prevStochK, prevStochD, rsiOverbought, stochOverbought }
     * @returns {boolean}
     */
    static isBearishConfirmation(params) {
        const {
            rsi, prevRsi, stochK, stochD, prevStochK, prevStochD,
            rsiOverbought = 70, stochOverbought = 70
        } = params;

        // RSI in overbought territory OR declining from it
        const rsiConfirm = this.isRSIOverbought(rsi, prevRsi, rsiOverbought);

        // Stochastic showing bearish signal (high value OR bearish crossover)
        const stochHigh = stochK !== null && stochK > stochOverbought;
        const stochCross = this.isStochBearishCrossover(stochK, stochD, prevStochK, prevStochD);
        const stochConfirm = stochHigh || stochCross;

        // At least one confirmation
        return rsiConfirm || stochConfirm;
    }
}

// Export for Node.js (backtest)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Indicators;
}
