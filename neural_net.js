/**
 * Neural Network for Cycle Analysis - Stable Version
 * Features: Gradual targets, better features, compatible architecture
 */
class CycleNeuralNet {
    constructor() {
        this.model = null;
        this.windowSize = 44;
        this.isTraining = false;
        this.lastPrediction = null;
    }

    createModel() {
        const model = tf.sequential();

        model.add(tf.layers.lstm({
            units: 64,
            returnSequences: false,
            inputShape: [this.windowSize, 9] // 9 features
        }));

        model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
        model.add(tf.layers.dense({ units: 2, activation: 'sigmoid' }));

        model.compile({
            optimizer: tf.train.adam(0.005),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });

        return model;
    }

    processData(candles, cycles, momentumValues, stochValues) {
        const indexStarts = new Array(candles.length).fill(0);
        const inverseStarts = new Array(candles.length).fill(0);

        cycles.forEach(c => {
            const arr = c.type === 'inverted' ? indexStarts : inverseStarts;
            for (let i = c.startIndex; i < Math.min(c.endIndex + 20, candles.length); i++) {
                arr[i] = i - c.startIndex;
            }
        });

        // Simple RSI calculation
        const rsi = [];
        const period = 14;
        for (let i = 0; i < candles.length; i++) {
            if (i < period) {
                rsi.push(50);
            } else {
                let gains = 0, losses = 0;
                for (let j = i - period + 1; j <= i; j++) {
                    const change = candles[j].close - candles[j - 1].close;
                    if (change > 0) gains += change;
                    else losses -= change;
                }
                const avgGain = gains / period;
                const avgLoss = losses / period;
                const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
                rsi.push(100 - (100 / (1 + rs)));
            }
        }

        const data = [];
        const startIdx = Math.max(50, this.windowSize);

        for (let i = startIdx; i < candles.length; i++) {
            const prevC = candles[i - 1];
            const currC = candles[i];

            const priceChange = (currC.close - prevC.close) / prevC.close * 100;
            const volume = Math.log(currC.volume + 1);
            const mom = momentumValues[i] || 0;
            const k = (stochValues[i]?.k || 50) / 100;
            const d = (stochValues[i]?.d || 50) / 100;
            const rsiVal = rsi[i] / 100;
            const idxAge = Math.min(indexStarts[i], 100) / 100;
            const invAge = Math.min(inverseStarts[i], 100) / 100;
            // Body ratio (bullish/bearish strength)
            const bodyRatio = currC.high !== currC.low ?
                (currC.close - currC.open) / (currC.high - currC.low) : 0;

            data.push([priceChange, volume, mom, k, d, rsiVal, idxAge, invAge, bodyRatio]);
        }

        return { data, offset: startIdx };
    }

    generateTargets(candles, cycles, offset) {
        const indexProb = new Array(candles.length).fill(0);
        const inverseProb = new Array(candles.length).fill(0);

        cycles.forEach(c => {
            const arr = c.type === 'inverted' ? indexProb : inverseProb;
            // Gradual ramp: 3 bars before
            for (let i = -3; i <= 1; i++) {
                const idx = c.endIndex + i;
                if (idx >= 0 && idx < candles.length) {
                    const prob = i <= 0 ? (4 + i) / 4 : 0.5; // 0.25, 0.5, 0.75, 1.0, 0.5
                    arr[idx] = Math.max(arr[idx], prob);
                }
            }
        });

        const targets = [];
        for (let i = offset; i < candles.length; i++) {
            targets.push([indexProb[i], inverseProb[i]]);
        }
        return targets;
    }

    normalize(data, rollingWindow = 200) {
        // If rollingWindow is provided, we calculate min/max for each bar 
        // using only data available up to that point.
        if (rollingWindow) {
            return data.map((row, i) => {
                const start = Math.max(0, i - rollingWindow);
                const windowData = data.slice(start, i + 1);

                const min = new Array(row.length).fill(Infinity);
                const max = new Array(row.length).fill(-Infinity);

                for (const winRow of windowData) {
                    for (let j = 0; j < winRow.length; j++) {
                        if (winRow[j] < min[j]) min[j] = winRow[j];
                        if (winRow[j] > max[j]) max[j] = winRow[j];
                    }
                }

                return row.map((val, j) => {
                    if (max[j] - min[j] !== 0) {
                        return (val - min[j]) / (max[j] - min[j]);
                    }
                    return 0.5;
                });
            });
        }

        // Fallback to global normalization if no window (internal use only)
        const min = new Array(data[0].length).fill(Infinity);
        const max = new Array(data[0].length).fill(-Infinity);

        for (const row of data) {
            for (let j = 0; j < row.length; j++) {
                if (row[j] < min[j]) min[j] = row[j];
                if (row[j] > max[j]) max[j] = row[j];
            }
        }

        return data.map(row => {
            return row.map((val, j) => {
                if (max[j] - min[j] !== 0) {
                    return (val - min[j]) / (max[j] - min[j]);
                }
                return 0.5;
            });
        });
    }

    async train(cycles, candles, momentumValues, stochValues) {
        if (this.isTraining) return;
        this.isTraining = true;

        console.log('NeuralNet: Starting...');

        try {
            const { data, offset } = this.processData(candles, cycles, momentumValues, stochValues);
            const targets = this.generateTargets(candles, cycles, offset);

            console.log(`NeuralNet: data=${data.length}, targets=${targets.length}`);

            if (data.length < this.windowSize + 50) {
                console.warn('NeuralNet: Not enough data');
                return;
            }

            const normalized = this.normalize(data);
            const xs = [];
            const ys = [];

            const maxSamples = Math.min(data.length - this.windowSize, targets.length - this.windowSize);
            for (let i = 0; i < maxSamples; i++) {
                xs.push(normalized.slice(i, i + this.windowSize));
                ys.push(targets[i + this.windowSize - 1] || [0, 0]);
            }

            if (xs.length === 0) {
                console.error('NeuralNet: No samples');
                return;
            }

            if (!this.model) {
                this.model = this.createModel();
            }

            console.log(`NeuralNet: Training ${xs.length} samples...`);

            const xTensor = tf.tensor3d(xs);
            const yTensor = tf.tensor2d(ys);

            await this.model.fit(xTensor, yTensor, {
                epochs: 10,
                batchSize: 64,
                shuffle: true,
                verbose: 0
            });

            xTensor.dispose();
            yTensor.dispose();

            console.log('NeuralNet: Done!');

            // Update chart
            if (typeof chart !== 'undefined' && chart.setNeuralProbabilities) {
                const probs = await this.predictHistory(candles, cycles, momentumValues, stochValues);
                chart.setNeuralProbabilities(probs);

                const future = await this.predictFuture(20, normalized);
                if (chart.setNeuralFuture) chart.setNeuralFuture(future);

                // Calculate and set predicted closure bars
                const closurePredictions = this.getPredictedClosureBars(future, candles.length);
                if (chart.setPredictedClosures) chart.setPredictedClosures(closurePredictions);
            }

            this.predictLive(normalized);

        } catch (error) {
            console.error('NeuralNet Error:', error);
        } finally {
            this.isTraining = false;
        }
    }

    async predictLive(normalizedData) {
        if (!this.model || normalizedData.length < this.windowSize) return;

        const lastWindow = normalizedData.slice(-this.windowSize);
        const input = tf.tensor3d([lastWindow]);
        const prediction = this.model.predict(input);
        const probs = await prediction.data();

        input.dispose();
        prediction.dispose();

        this.lastPrediction = {
            indexCloseProb: probs[0],
            inverseCloseProb: probs[1]
        };

        this.updateUI();
    }

    updateUI() {
        const container = document.getElementById('neural-result-content');
        if (!container || !this.lastPrediction) return;

        const { indexCloseProb, inverseCloseProb } = this.lastPrediction;
        const idxPct = (indexCloseProb * 100).toFixed(0);
        const invPct = (inverseCloseProb * 100).toFixed(0);

        const idxColor = indexCloseProb > 0.6 ? '#22c55e' : '#3b82f6';
        const invColor = inverseCloseProb > 0.6 ? '#22c55e' : '#ef4444';

        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:3px; padding:0;">
                <div style="display:flex; align-items:center; gap:4px; font-size:11px;">
                    <span style="color:${idxColor}; width:40px;">Index</span>
                    <div style="flex:1; height:6px; background:#1f2937; border-radius:3px;">
                        <div style="width:${idxPct}%; height:100%; background:${idxColor}; border-radius:3px;"></div>
                    </div>
                    <span style="width:30px; text-align:right;">${idxPct}%</span>
                </div>
                <div style="display:flex; align-items:center; gap:4px; font-size:11px;">
                    <span style="color:${invColor}; width:40px;">Inverse</span>
                    <div style="flex:1; height:6px; background:#1f2937; border-radius:3px;">
                        <div style="width:${invPct}%; height:100%; background:${invColor}; border-radius:3px;"></div>
                    </div>
                    <span style="width:30px; text-align:right;">${invPct}%</span>
                </div>
            </div>
        `;
    }

    async predictHistory(candles, cycles, momentumValues, stochValues) {
        if (!this.model) return [];

        const { data, offset } = this.processData(candles, cycles, momentumValues, stochValues);
        const normalized = this.normalize(data);

        const xs = [];
        const indices = [];

        for (let i = 0; i < normalized.length - this.windowSize; i++) {
            xs.push(normalized.slice(i, i + this.windowSize));
            indices.push(offset + i + this.windowSize);
        }

        if (xs.length === 0) return [];

        const input = tf.tensor3d(xs);
        const predictions = this.model.predict(input);
        const probs = await predictions.data();

        input.dispose();
        predictions.dispose();

        const results = new Array(candles.length).fill(null);
        for (let i = 0; i < indices.length; i++) {
            results[indices[i]] = {
                indexProb: probs[i * 2],
                inverseProb: probs[i * 2 + 1]
            };
        }

        return results;
    }

    async predictFuture(steps, fullNormalizedData) {
        if (!this.model || !fullNormalizedData || fullNormalizedData.length < this.windowSize) {
            return [];
        }

        const futureProbs = [];
        let currentWindow = [...fullNormalizedData.slice(-this.windowSize)];

        for (let step = 0; step < steps; step++) {
            const input = tf.tensor3d([currentWindow]);
            const prediction = this.model.predict(input);
            const probs = await prediction.data();

            input.dispose();
            prediction.dispose();

            futureProbs.push({
                indexProb: probs[0],
                inverseProb: probs[1]
            });

            const avgProb = (probs[0] + probs[1]) / 2;
            const last = currentWindow[currentWindow.length - 1];

            const next = [
                last[0] * (1 - avgProb * 0.5),
                last[1],
                last[2] * (1 - avgProb * 0.3),
                last[3], last[4], last[5],
                Math.min(1, last[6] + 0.02),
                Math.min(1, last[7] + 0.02),
                last[8]
            ];

            currentWindow = [...currentWindow.slice(1), next];
        }

        return futureProbs;
    }

    /**
     * Find the most likely closure bar for Index and Inverse cycles
     * based on future probability predictions
     * @param {Array} futureProbs - Array of {indexProb, inverseProb} from predictFuture
     * @param {number} lastCandleIndex - Index of the last candle in the chart
     * @returns {Object} {indexClosureBar, inverseClosureBar} - Predicted bar indices
     */
    getPredictedClosureBars(futureProbs, lastCandleIndex) {
        if (!futureProbs || futureProbs.length === 0) {
            return { indexClosureBar: null, inverseClosureBar: null };
        }

        let maxIndexProb = 0;
        let maxInverseProb = 0;
        let indexClosureBar = null;
        let inverseClosureBar = null;

        for (let i = 0; i < futureProbs.length; i++) {
            const barIndex = lastCandleIndex + i + 1; // Future bars start after last candle

            if (futureProbs[i].indexProb > maxIndexProb) {
                maxIndexProb = futureProbs[i].indexProb;
                indexClosureBar = barIndex;
            }

            if (futureProbs[i].inverseProb > maxInverseProb) {
                maxInverseProb = futureProbs[i].inverseProb;
                inverseClosureBar = barIndex;
            }
        }

        console.log(`NeuralNet: Predicted closure - Index: bar ${indexClosureBar} (${(maxIndexProb * 100).toFixed(1)}%), Inverse: bar ${inverseClosureBar} (${(maxInverseProb * 100).toFixed(1)}%)`);

        return {
            indexClosureBar,
            inverseClosureBar,
            indexMaxProb: maxIndexProb,
            inverseMaxProb: maxInverseProb
        };
    }
}
