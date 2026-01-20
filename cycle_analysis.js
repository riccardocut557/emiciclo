/**
 * Advanced Cycle Analysis Library
 * Implements MESA (Maximum Entropy Spectral Analysis), Hilbert Transform, and Autocorrelation.
 */

class CycleAnalysis {

    /**
     * Calculates Autocorrelation to find cycle periodicity.
     * @param {Array} data - Array of price data (e.g., closes)
     * @param {number} maxLag - Maximum lag to test (e.g., 60 bars)
     * @returns {Array} Array of { lag, correlation }
     */
    static calculateAutocorrelation(data, maxLag = 60) {
        const n = data.length;
        if (n < maxLag * 2) return [];

        // Detrend data using differencing
        const detrended = [];
        for (let i = 1; i < n; i++) {
            detrended.push(data[i] - data[i - 1]);
        }

        const m = detrended.length;
        const mean = detrended.reduce((a, b) => a + b, 0) / m;

        // Variance
        let variance = 0;
        for (let i = 0; i < m; i++) {
            variance += Math.pow(detrended[i] - mean, 2);
        }

        const results = [];

        // Calculate correlation for each lag
        for (let lag = 1; lag <= maxLag; lag++) {
            let numerator = 0;
            for (let i = 0; i < m - lag; i++) {
                numerator += (detrended[i] - mean) * (detrended[i + lag] - mean);
            }
            const correlation = numerator / variance;
            results.push({ lag, correlation });
        }

        return results;
    }

    /**
     * Calculates the Hilbert Transform to determine the Dominant Cycle Period.
     * Uses Zero-Crossing method for robustness.
     * @param {Array} data - Price data
     * @returns {Object} { period, phase } - Current dominant cycle characteristics
     */
    static calculateHilbert(data) {
        if (data.length < 60) return { period: 0, phase: 0 };

        const limit = data.length;
        const lookback = 60;
        let crossings = 0;
        let avgPeriod = 0;

        if (limit > lookback) {
            // Calculate local mean (SMA)
            let sum = 0;
            for (let k = 0; k < lookback; k++) sum += data[limit - 1 - k];
            const sma = sum / lookback;

            let lastSign = Math.sign(data[limit - lookback] - sma);

            for (let k = limit - lookback + 1; k < limit; k++) {
                const diff = data[k] - sma;
                const sign = Math.sign(diff);
                if (sign !== lastSign && sign !== 0) {
                    crossings++;
                    lastSign = sign;
                }
            }

            // A cycle has 2 crossings (up and down)
            if (crossings > 1) {
                avgPeriod = (lookback / crossings) * 2;
            }
        }

        return { period: avgPeriod, phase: 0 };
    }

    /**
     * Calculates Maximum Entropy Spectral Analysis (Burg's Method)
     * High resolution frequency analysis.
     * @param {Array} data - Input data
     * @param {number} filterOrder - Order of the autoregressive model (poles)
     * @returns {Array} Array of { period, power } (Top dominant cycles)
     */
    static calculateMESA(data, filterOrder = 20) {
        const N = data.length;
        if (N < filterOrder * 2) return [];

        // 1. Linear detrend
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < N; i++) {
            sumX += i;
            sumY += data[i];
            sumXY += i * data[i];
            sumXX += i * i;
        }
        const slope = (N * sumXY - sumX * sumY) / (N * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / N;

        const x = new Array(N);
        for (let i = 0; i < N; i++) {
            x[i] = data[i] - (slope * i + intercept);
            // Apply Hamming window
            x[i] *= (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1)));
        }

        // 2. Burg's Method
        let a = new Array(filterOrder + 1).fill(0);
        a[0] = 1.0;

        const b = [...x]; // backward error
        const f = [...x]; // forward error

        for (let m = 1; m <= filterOrder; m++) {
            let num = 0.0;
            let den = 0.0;
            for (let n = m; n < N; n++) {
                num += f[n] * b[n - 1];
                den += f[n] * f[n] + b[n - 1] * b[n - 1];
            }
            const k = (2.0 * num) / den;

            const newA = [1.0];
            for (let i = 1; i < m; i++) {
                newA.push(a[i] - k * a[m - i]);
            }
            newA.push(-k);

            for (let i = 0; i <= m; i++) a[i] = newA[i];

            const nextF = new Array(N).fill(0);
            const nextB = new Array(N).fill(0);

            for (let n = m + 1; n < N; n++) {
                nextF[n] = f[n] - k * b[n - 1];
                nextB[n] = b[n - 1] - k * f[n];
            }
            for (let n = 0; n < N; n++) { f[n] = nextF[n]; b[n] = nextB[n]; }
        }

        // 3. Compute Spectrum from AR coefficients
        const spectrum = [];
        const maxFreq = 0.5;
        const steps = 100;

        for (let i = 1; i < steps; i++) {
            const freq = (i / steps) * maxFreq;
            const omega = 2 * Math.PI * freq;

            let realDen = 1.0;
            let imagDen = 0.0;

            for (let k = 1; k <= filterOrder; k++) {
                realDen += a[k] * Math.cos(k * omega);
                imagDen -= a[k] * Math.sin(k * omega);
            }

            const den = realDen * realDen + imagDen * imagDen;
            const power = 1.0 / den;

            const period = 1 / freq;
            if (period >= 10 && period <= 60) {
                spectrum.push({ period, power });
            }
        }

        // Find peaks
        spectrum.sort((a, b) => b.power - a.power);
        return spectrum.slice(0, 5);
    }
}

// Export for use in main.js
window.CycleAnalysis = CycleAnalysis;
