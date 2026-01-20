class CycleDetector {
    constructor() {
        this.minDuration = 24;
        this.maxDuration = 44;
        // RSI/Stochastic data for confirmation
        this.rsiValues = [];
        this.stochK = [];
        this.stochD = [];
        this.useRsiStochConfirmation = false;
    }

    /**
     * Set RSI and Stochastic data for confirmation
     * @param {Array} rsi - Array of RSI values
     * @param {Array} stochK - Array of Stochastic %K values
     * @param {Array} stochD - Array of Stochastic %D values
     * @param {boolean} enabled - Whether to use RSI/Stoch confirmation
     */
    setIndicators(rsi, stochK, stochD, enabled = true) {
        this.rsiValues = rsi || [];
        this.stochK = stochK || [];
        this.stochD = stochD || [];
        this.useRsiStochConfirmation = enabled;
    }

    /**
     * Detects cycles in the provided candlestick data.
     * @param {Array} candles - Array of {open, high, low, close, volume}
     * @param {boolean} useMomentum - Whether to enforce momentum rules
     * @param {Array} momentumValues - Array of momentum values corresponding to candles
     * @param {boolean} invert - Whether to detect inverted cycles (Low -> High -> Low)
     * @param {number} minDuration - Minimum cycle duration (default 24)
     * @param {number} maxDuration - Maximum cycle duration (default 44)
     * @param {number} maxDuration - Maximum cycle duration (default 44)
     * @param {boolean} priorityMinDuration - Prioritize shorter valid cycles
     * @param {Object} manualCycle - Manual cycle definition
     * @param {number} sensitivity - Swing strength (1-3)
     * @returns {Array} List of detected cycles
     */
    detectCycles(candles, useMomentum = false, momentumValues = [], invert = false, minDuration = 24, maxDuration = 44, priorityMinDuration = true, manualCycle = null, sensitivity = 1) {
        let cycles = [];
        let i = 0;

        // Use passed duration or fallback to class defaults (though defaults are in params now)
        const minDur = minDuration || this.minDuration;
        const maxDur = maxDuration || this.maxDuration;

        // If Manual Cycle is provided, we split detection:
        // 1. Detect UP TO manual cycle start
        // 2. Insert Manual Cycle
        // 3. Detect FROM manual cycle end

        let limitIndex = candles.length;
        if (manualCycle) {
            limitIndex = manualCycle.startIndex;
        }

        // Phase 1: Detect up to limit
        while (i < limitIndex - minDur) {
            // Check for Start Condition at index i
            if (this.isStartCondition(candles, i, useMomentum, momentumValues, invert, sensitivity)) {
                // Look for End Condition
                // Important: Cycle must end at or before limitIndex if we want to enforce continuity?
                // For now, let's just run standard detection. If a cycle overshoots manual start, we might need to trim or discard.
                // Simplification: Allow standard detection, but stop loop if we pass limit.

                const cycle = this.findCycleEnd(candles, i, useMomentum, momentumValues, invert, minDur, maxDur, priorityMinDuration, sensitivity);

                if (cycle) {
                    // Check if this cycle overlaps significantly or goes past manual start?
                    // Let's just add it.
                    if (cycle.duration >= minDur) {
                        // If manual cycle exists, ensure we don't go past it
                        if (manualCycle && cycle.endIndex > manualCycle.startIndex) {
                            // This cycle conflicts with manual start.
                            // Option A: Discard it.
                            // Option B: Accept it and have overlap.
                            // Let's Discard to keep manual cycle as the "barrier".
                            i++;
                            continue;
                        }

                        cycles.push(cycle);

                        // The end of this cycle is the potential start of the next.
                        if (this.isStartCondition(candles, cycle.endIndex, useMomentum, momentumValues, invert, sensitivity)) {
                            i = cycle.endIndex;
                        } else {
                            i = cycle.endIndex + 1;
                        }
                    } else {
                        i++;
                    }
                } else {
                    i++;
                }
            } else {
                i++;
            }
        }

        // Phase 2: Insert Manual Cycle
        if (manualCycle) {
            // We need to build the full cycle object for the manual points
            // manualCycle has {startIndex, endIndex, type?}
            // We need to find the min/max in between to make it a valid cycle object for rendering
            const fullManualCycle = this.buildManualCycle(candles, manualCycle.startIndex, manualCycle.endIndex, invert);
            cycles.push(fullManualCycle);

            // Phase 3: Detect FROM manual cycle end
            i = manualCycle.endIndex;

            // Resume detection loop from manual end
            while (i < candles.length - minDur) {
                // Same logic as above
                if (this.isStartCondition(candles, i, useMomentum, momentumValues, invert, sensitivity)) {
                    const cycle = this.findCycleEnd(candles, i, useMomentum, momentumValues, invert, minDur, maxDur, priorityMinDuration, sensitivity);

                    if (cycle) {
                        if (cycle.duration >= minDur) {
                            cycles.push(cycle);
                            if (this.isStartCondition(candles, cycle.endIndex, useMomentum, momentumValues, invert, sensitivity)) {
                                i = cycle.endIndex;
                            } else {
                                i = cycle.endIndex + 1;
                            }
                        } else {
                            i++;
                        }
                    } else {
                        i++;
                    }
                } else {
                    i++;
                }
            }
        }

        return cycles;
    }

    buildManualCycle(candles, startIndex, endIndex, invert) {
        // Find extremum between start and end
        let extremumIndex = -1;
        let extremumValue = invert ? -Infinity : Infinity; // Inverted needs Max (High), Normal needs Min (Low)

        // Wait, Inverted: Start(Low) -> Max(High) -> End(Low)
        // Normal: Start(High) -> Min(Low) -> End(High)

        if (invert) {
            // Find Max High
            let maxHigh = -Infinity;
            for (let k = startIndex + 1; k < endIndex; k++) {
                if (candles[k].high > maxHigh) {
                    maxHigh = candles[k].high;
                    extremumIndex = k;
                }
            }
            // Fallback if no intermediate bars (shouldn't happen with min duration check, but manual might be short)
            if (extremumIndex === -1) extremumIndex = Math.floor((startIndex + endIndex) / 2);

            return this.buildCycle(candles, startIndex, extremumIndex, endIndex, invert, endIndex);
        } else {
            // Find Min Low
            let minLow = Infinity;
            for (let k = startIndex + 1; k < endIndex; k++) {
                if (candles[k].low < minLow) {
                    minLow = candles[k].low;
                    extremumIndex = k;
                }
            }
            if (extremumIndex === -1) extremumIndex = Math.floor((startIndex + endIndex) / 2);

            return this.buildCycle(candles, startIndex, extremumIndex, endIndex, invert, endIndex);
        }
    }

    isStartCondition(candles, index, useMomentum, momentumValues, invert, sensitivity = 1) {
        // Basic bounds check
        if (index >= candles.length - 1) return false;

        // Momentum Rule
        if (useMomentum) {
            if (!momentumValues || index >= momentumValues.length) return false;
            const mom = momentumValues[index];
            if (mom === undefined || isNaN(mom)) return false;

            if (invert) {
                // Inverted: Start must be in Red Phase (Momentum <= 0)
                if (mom > 0) return false;
            } else {
                // Normal: Start must be in Green Phase (Momentum >= 0)
                if (mom < 0) return false;
            }
        }

        if (invert) {
            // Inverted: Start is Local Min
            return this.checkLocalMin(candles, index, sensitivity);
        } else {
            // Normal: Start is Local Max
            return this.checkLocalMax(candles, index, sensitivity);
        }
    }



    checkLocalMax(candles, index, strength = 1) {
        if (index < strength) return false;
        if (index >= candles.length - strength) return false;

        // Swing High Check: Must be higher than 'strength' bars to left AND right
        const currentHigh = candles[index].high;

        for (let i = 1; i <= strength; i++) {
            if (candles[index - i].high >= currentHigh) return false;
            if (candles[index + i].high > currentHigh) return false; // Strict > on right to avoid double tops? Or >=?
            // Usually >= is safer to filter flats.
        }

        // RSI/Stochastic confirmation for MAX (overbought/bearish)
        if (this.useRsiStochConfirmation && this.rsiValues.length > 0) {
            // ... (keep existing RSI logic) ...
            const rsi = this.rsiValues[index];
            const prevRsi = index > 0 ? this.rsiValues[index - 1] : null;
            const stochK = this.stochK[index];
            const stochD = this.stochD[index];
            const prevStochK = index > 0 ? this.stochK[index - 1] : null;
            const prevStochD = index > 0 ? this.stochD[index - 1] : null;

            // Check if bearish confirmation exists (overbought RSI or bearish stoch crossover)
            const isBearishConfirmed = Indicators.isBearishConfirmation({
                rsi, prevRsi, stochK, stochD, prevStochK, prevStochD,
                rsiOverbought: this.rsiOverbought,
                stochOverbought: this.stochOverbought
            });

            if (!isBearishConfirmed) return false;
        }

        const maxHigh = candles[index].high;

        // Confirmation Logic (Red Candle)
        // Keep existing logic, maybe search further if strength is high?
        // Standardizing confirmation search to strength + 2 bars?
        const searchLimit = Math.max(3, strength + 1);

        for (let i = 1; i <= searchLimit; i++) {
            const checkIndex = index + i;
            if (checkIndex >= candles.length) break;

            const candle = candles[checkIndex];
            // Rule 5: No subsequent bar should CLOSE above the max high
            if (candle.close >= maxHigh) return false;

            const isRed = candle.close < candle.open;
            const range = candle.high - candle.low;
            const body = Math.abs(candle.close - candle.open);

            // Require substantial body (30%)
            if (isRed && range > 0 && (body / range) >= 0.30) {
                return true;
            }
        }

        return false;
    }

    checkLocalMin(candles, index, strength = 1) {
        if (index < strength) return false;
        if (index >= candles.length - strength) return false;

        // Swing Low Check: Must be lower than 'strength' bars to left AND right
        const currentLow = candles[index].low;

        for (let i = 1; i <= strength; i++) {
            if (candles[index - i].low <= currentLow) return false;
            if (candles[index + i].low < currentLow) return false;
        }

        // RSI/Stochastic confirmation for MIN (oversold/bullish)
        if (this.useRsiStochConfirmation && this.rsiValues.length > 0) {
            // ... (keep existing RSI logic) ...
            const rsi = this.rsiValues[index];
            const prevRsi = index > 0 ? this.rsiValues[index - 1] : null;
            const stochK = this.stochK[index];
            const stochD = this.stochD[index];
            const prevStochK = index > 0 ? this.stochK[index - 1] : null;
            const prevStochD = index > 0 ? this.stochD[index - 1] : null;

            const isBullishConfirmed = Indicators.isBullishConfirmation({
                rsi, prevRsi, stochK, stochD, prevStochK, prevStochD,
                rsiOversold: this.rsiOversold,
                stochOversold: this.stochOversold
            });

            if (!isBullishConfirmed) return false;
        }

        const minLow = candles[index].low;

        // Confirmation Logic (Green Candle)
        const searchLimit = Math.max(3, strength + 1);

        for (let i = 1; i <= searchLimit; i++) {
            const checkIndex = index + i;
            if (checkIndex >= candles.length) break;

            const candle = candles[checkIndex];
            // Rule 5: No subsequent bar should CLOSE below the min low
            if (candle.close <= minLow) return false;

            const isGreen = candle.close > candle.open;
            const range = candle.high - candle.low;
            const body = Math.abs(candle.close - candle.open);

            if (isGreen && range > 0 && (body / range) >= 0.30) {
                return true;
            }
        }

        return false;
    }


    findCycleEnd(candles, startIndex, useMomentum, momentumValues, invert, minDuration, maxDuration, priorityMinDuration = true, sensitivity = 1) {
        // Cycle must end between startIndex + minDuration and startIndex + maxDuration
        const minEndIndex = startIndex + minDuration;
        const maxEndIndex = Math.min(startIndex + maxDuration, candles.length - 1);

        // Helper to check if a specific index is a valid end
        const isValidEnd = (j) => {
            // Momentum Rule
            if (useMomentum) {
                if (!momentumValues || j >= momentumValues.length) return false;
                const mom = momentumValues[j];
                if (mom === undefined || isNaN(mom)) return false;

                if (invert) {
                    if (mom > 0) return false;
                } else {
                    if (mom < 0) return false;
                }
            }

            if (invert) {
                // Inverted: End is Local Min
                if (!this.checkLocalMin(candles, j)) return false;

                // Find highest high between start and end for the cycle shape (not required, just for drawing)
                let highestHigh = -Infinity;
                let highestIndex = -1;
                for (let k = startIndex + 1; k < j; k++) {
                    if (candles[k].high > highestHigh) {
                        highestHigh = candles[k].high;
                        highestIndex = k;
                    }
                }
                // If no intermediate max found, use midpoint
                if (highestIndex === -1) highestIndex = Math.floor((startIndex + j) / 2);
                return { minIndex: highestIndex };

            } else {
                // Normal: End is Local Max
                if (!this.checkLocalMax(candles, j)) return false;

                // Find lowest low between start and end for the cycle shape (not required, just for drawing)
                let lowestLow = Infinity;
                let lowestIndex = -1;
                for (let k = startIndex + 1; k < j; k++) {
                    if (candles[k].low < lowestLow) {
                        lowestLow = candles[k].low;
                        lowestIndex = k;
                    }
                }
                // If no intermediate min found, use midpoint
                if (lowestIndex === -1) lowestIndex = Math.floor((startIndex + j) / 2);
                return { minIndex: lowestIndex };
            }
        };

        // Track first potential end
        let firstValidEnd = null;
        let bestCandidate = null;
        let bestExtremum = invert ? Infinity : -Infinity;

        // 1. Check at minDuration first (for firstValidEnd tracking)
        if (minEndIndex <= maxEndIndex) {
            const checkMin = isValidEnd(minEndIndex);
            if (checkMin) {
                firstValidEnd = minEndIndex;
                bestCandidate = { endIndex: minEndIndex, minIndex: checkMin.minIndex };
                if (invert) {
                    bestExtremum = candles[minEndIndex].low;
                } else {
                    bestExtremum = candles[minEndIndex].high;
                }
            }
        }

        // 2. Search ALL valid bars from minDuration+1 to maxDuration for better extremums
        for (let j = minEndIndex + 1; j <= maxEndIndex; j++) {
            const check = isValidEnd(j);
            if (check) {
                if (firstValidEnd === null) {
                    firstValidEnd = j;
                    bestCandidate = { endIndex: j, minIndex: check.minIndex };
                    if (invert) {
                        bestExtremum = candles[j].low;
                    } else {
                        bestExtremum = candles[j].high;
                    }
                    continue;
                }

                // Check if this is a BETTER extremum
                if (invert) {
                    // Index Cycle: Want LOWEST low
                    if (candles[j].low < bestExtremum) {
                        bestCandidate = { endIndex: j, minIndex: check.minIndex };
                        bestExtremum = candles[j].low;
                    }
                } else {
                    // Inverse Cycle: Want HIGHEST high
                    if (candles[j].high > bestExtremum) {
                        bestCandidate = { endIndex: j, minIndex: check.minIndex };
                        bestExtremum = candles[j].high;
                    }
                }
            }
        }

        if (bestCandidate) {
            return this.buildCycle(candles, startIndex, bestCandidate.minIndex, bestCandidate.endIndex, invert, firstValidEnd);
        }

        return null;
    }

    buildCycle(candles, startIndex, minIndex, endIndex, invert, firstPotentialEnd = endIndex) {
        if (invert) {
            return {
                startIndex: startIndex,
                maxIndex: minIndex, // Intermediate is Max
                endIndex: endIndex,
                duration: endIndex - startIndex,
                amplitude: candles[minIndex].high - candles[startIndex].low, // Amplitude: Max - StartLow
                startPrice: candles[startIndex].low,
                maxPrice: candles[minIndex].high,
                endPrice: candles[endIndex].low,
                firstPotentialEnd: firstPotentialEnd,
                type: 'inverted'
            };
        } else {
            return {
                startIndex: startIndex,
                minIndex: minIndex, // Intermediate is Min
                endIndex: endIndex,
                duration: endIndex - startIndex,
                amplitude: candles[startIndex].high - candles[minIndex].low,
                startPrice: candles[startIndex].high,
                minPrice: candles[minIndex].low,
                endPrice: candles[endIndex].high,
                firstPotentialEnd: firstPotentialEnd,
                type: 'normal'
            };
        }
    }
}
