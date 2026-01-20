// Application state
let chart;
let cycleDetector;
let cycleMomentum;
let cycleBot;
let currentSymbol = 'SUIUSDT';
let currentTimeframe = '1h';
let isLoading = false;
let currentManualCycle = null; // {startIndex, endIndex}
let preWalkForwardConfig = null; // Store user config before WF optimization

// Trade table filter/sort state
let tradeFilterType = 'all';
let tradeFilterExit = 'all';
let tradeFilterResult = 'all';
let tradeSortColumn = 'time';
let tradeSortDirection = 'desc';



// Timeframe mapping for Binance API
const timeframeMap = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d'
};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('chart-canvas');
    chart = new CandlestickChart(canvas);
    window.chart = chart; // Expose for NeuralNet
    cycleDetector = new CycleDetector();
    cycleMomentum = new CycleSwingMomentum();
    cycleBot = new CycleTradingBot();
    window.neuralNet = new CycleNeuralNet();

    setupEventListeners();
    setupBotWidget();
    setupTradeTableFilters();
    loadChartData();

    // Auto-refresh every 5 seconds
    setInterval(() => {
        loadChartData(true);
    }, 5000);

    // Candle countdown timer - update every second
    setInterval(updateCandleCountdown, 1000);
    updateCandleCountdown();
});

// Calculate and update candle countdown
function updateCandleCountdown() {
    const countdownEl = document.getElementById('candle-countdown');
    if (!countdownEl) return;

    // Get timeframe in milliseconds
    const timeframeMs = {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '30m': 30 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000
    };

    const intervalMs = timeframeMs[currentTimeframe] || 60000;
    const now = Date.now();
    const candleStart = Math.floor(now / intervalMs) * intervalMs;
    const candleEnd = candleStart + intervalMs;
    const remaining = candleEnd - now;

    // Format as MM:SS or HH:MM:SS
    const totalSeconds = Math.floor(remaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let display;
    if (hours > 0) {
        display = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
        display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    countdownEl.textContent = display;
}

function setupEventListeners() {
    // Cryptocurrency selector
    const cryptoSelect = document.getElementById('crypto-select');
    cryptoSelect.addEventListener('change', (e) => {
        currentSymbol = e.target.value;
        window.isWalkForwardOptimized = false; // Reset WF on pair change
        loadChartData();
    });

    // Mobile Menu Toggle
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const controlsPanel = document.querySelector('.controls-panel');
    const menuOverlay = document.getElementById('menu-overlay');

    function toggleMenu() {
        controlsPanel.classList.toggle('active');
        menuOverlay.classList.toggle('active');
        document.body.style.overflow = controlsPanel.classList.contains('active') ? 'hidden' : ''; // Prevent body scroll
    }

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleMenu);
    if (menuOverlay) menuOverlay.addEventListener('click', toggleMenu);

    // Timeframe buttons
    const tfButtons = document.querySelectorAll('.tf-btn');
    tfButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tfButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTimeframe = e.target.dataset.timeframe;

            // Apply specific defaults for 15-minute timeframe
            //if (currentTimeframe === '15m') {
            //    document.getElementById('use-momentum-rule').checked = false; // Momentum filter OFF
            //    document.getElementById('priority-24-bars').checked = true;   // Force 24 bar ON
            //    document.getElementById('custom-min').value = 5;               // Range from 5
            //   document.getElementById('custom-max').value = 23;              // Range to 23
            //   document.getElementById('bot-opp-close').checked = true;       // Opp Close ON
            //    document.getElementById('bot-ma-trend').checked = true;        // MA Trend ON
            //   document.getElementById('bot-fees').checked = true;            // Fees ON
            //}

            window.isWalkForwardOptimized = false; // Reset WF on timeframe change
            loadChartData();
        });
    });

    // Reset button
    document.getElementById('reset-btn').addEventListener('click', () => {
        chart.reset();
    });

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        window.isWalkForwardOptimized = false; // Reset WF on manual refresh
        loadChartData();
    });

    // Vertical Scale Slider
    const vScaleSlider = document.getElementById('v-scale');
    const vScaleValue = document.getElementById('v-scale-value');
    vScaleSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        vScaleValue.textContent = value + '%';
        chart.verticalZoom = value / 100;
        chart.render();
    });

    // Cycle Indicator Controls
    const updateConfig = () => {
        chart.updateConfig({
            showLabels: document.getElementById('show-labels').checked,
            showParabola: document.getElementById('show-parabola').checked,
            showMin: document.getElementById('show-min').checked,
            showProjections: document.getElementById('show-projections').checked,
            minDuration: parseInt(document.getElementById('custom-min').value) || 24,
            maxDuration: parseInt(document.getElementById('custom-max').value) || 44
        });
    };

    // Initialize Config
    updateConfig();

    document.getElementById('show-labels').addEventListener('change', updateConfig);
    document.getElementById('show-parabola').addEventListener('change', updateConfig);
    document.getElementById('show-min').addEventListener('change', updateConfig);

    // Momentum Rule Toggle
    document.getElementById('use-momentum-rule').addEventListener('change', () => {
        window.isWalkForwardOptimized = false;
        loadChartData(); // Re-run detection
    });



    // Stats Window removed - no longer using makeDraggable

    // Projections Toggle
    // Projections Toggle
    document.getElementById('show-projections').addEventListener('change', updateConfig);

    // Inverse Cycles Toggle

    document.getElementById('show-index-cycles').addEventListener('change', () => {
        loadChartData();
    });
    document.getElementById('show-inverse-cycles').addEventListener('change', () => {
        loadChartData();
    });

    // Priority 24 Bars Toggle
    document.getElementById('priority-24-bars').addEventListener('change', () => {
        window.isWalkForwardOptimized = false;
        loadChartData();
    });

    // Walk-Forward Toggle
    document.getElementById('bot-walk-forward').addEventListener('change', (e) => {
        const isEnabled = e.target.checked;

        if (isEnabled) {
            // Save current config before optimization potentially changes it
            preWalkForwardConfig = {
                min: document.getElementById('custom-min').value,
                max: document.getElementById('custom-max').value
            };
        } else {
            // Restore previous config if available
            if (preWalkForwardConfig) {
                document.getElementById('custom-min').value = preWalkForwardConfig.min;
                document.getElementById('custom-max').value = preWalkForwardConfig.max;
                // Update chart config with restored values
                updateConfig();
                preWalkForwardConfig = null;
            }
        }

        window.isWalkForwardOptimized = false; // Reset optimization flag
        loadChartData();
    });



    // Custom Cycle Range - ensure visual config updates too
    document.getElementById('custom-min').addEventListener('change', () => {
        updateConfig();
        loadChartData();
    });
    document.getElementById('custom-max').addEventListener('change', () => {
        updateConfig();
        loadChartData();
    });

    // Precision Toggle
    document.getElementById('cycle-precision').addEventListener('change', () => {
        loadChartData();
    });

    // Momentum Parameters
    const momInputs = ['mom-cycs', 'mom-lbl', 'mom-lbr', 'mom-min', 'mom-max'];
    momInputs.forEach(id => {
        document.getElementById(id).addEventListener('change', () => loadChartData());
    });

    // AI Toggle Listener
    const aiToggle = document.getElementById('ai-enabled');
    if (aiToggle) {
        aiToggle.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;
            if (isEnabled) {
                // Trigger immediate update if we have data
                if (chart && chart.data && chart.data.length > 0) {
                    recalculateIndicatorsAndCycles(chart.data);
                }
            } else {
                // Clear UI
                const container = document.getElementById('neural-result-content');
                if (container) container.innerHTML = '<span style="font-size: 10px; color: #6b7280; font-style: italic;">Disabled</span>';
            }
        });
    }

    // Manual Cycle Controls
    const manualBtn = document.getElementById('manual-mode-btn');
    const clearManualBtn = document.getElementById('clear-manual-btn');

    manualBtn.addEventListener('click', () => {
        chart.manualMode = true;
        chart.manualPoints = [];
        chart.canvas.style.cursor = 'crosshair';
        // Visual feedback?
        manualBtn.textContent = 'Click Start & End...';
        setTimeout(() => manualBtn.textContent = 'Set Manual', 2000);
    });

    clearManualBtn.addEventListener('click', () => {
        currentManualCycle = null;
        chart.manualPoints = [];
        loadChartData();
    });

    // Chart Callback
    chart.onManualCycleComplete = (startPoint, endPoint) => {
        currentManualCycle = {
            startIndex: startPoint.index,
            endIndex: endPoint.index
        };
        console.log('Manual Cycle Set:', currentManualCycle);
        loadChartData();
    };



    // Unified Heatmap Simulation Function - runs all 3 at once
    const runAllHeatmapSimulations = async (triggeredBy) => {
        if (!chart.data || chart.data.length < 60) {
            alert('Not enough data for simulation');
            return;
        }

        // Disable all buttons and show loading
        const idxBtn = document.getElementById('idx-heatmap-btn');
        const invBtn = document.getElementById('inv-heatmap-btn');
        const combinedBtn = document.getElementById('combined-heatmap-btn');
        const allBtns = [idxBtn, invBtn, combinedBtn].filter(b => b);

        allBtns.forEach(btn => {
            btn.dataset.originalText = btn.textContent;
            btn.textContent = '⏳...';
            btn.disabled = true;
        });

        await new Promise(r => setTimeout(r, 50));

        try {
            const useMomentum = document.getElementById('use-momentum-rule').checked;
            const momentumValues = cycleMomentum.calculate(chart.data);
            const currentMin = parseInt(document.getElementById('custom-min').value) || 24;
            const currentMax = parseInt(document.getElementById('custom-max').value) || 44;

            // Run Index (Long only) simulation
            const idxCanvas = document.getElementById('idx-heatmap');
            if (idxCanvas) {
                const idxData = calculateRangeGains(chart.data, true, momentumValues, useMomentum);
                window.idxHeatmapData = idxData;
                drawHeatmap(idxCanvas, idxData, currentMin, currentMax);
            }

            await new Promise(r => setTimeout(r, 10)); // Allow UI update

            // Run Inverse (Short only) simulation
            const invCanvas = document.getElementById('inv-heatmap');
            if (invCanvas) {
                const invData = calculateRangeGains(chart.data, false, momentumValues, useMomentum);
                window.invHeatmapData = invData;
                drawHeatmap(invCanvas, invData, currentMin, currentMax);
            }

            await new Promise(r => setTimeout(r, 10)); // Allow UI update

            // Run Combined (Long + Short) simulation
            const combinedCanvas = document.getElementById('combined-heatmap');
            if (combinedCanvas) {
                const combinedData = calculateCombinedRangeGains(chart.data, momentumValues, useMomentum);
                window.combinedHeatmapData = combinedData;
                drawHeatmap(combinedCanvas, combinedData, currentMin, currentMax);
            }

            console.log('All 3 heatmap simulations completed');

        } catch (e) {
            console.error('Heatmap simulation error:', e);
        }

        // Restore all buttons
        allBtns.forEach(btn => {
            btn.textContent = btn.dataset.originalText || 'Simulate';
            btn.disabled = false;
        });
    };

    // Connect all 3 buttons to the same unified function
    ['idx-heatmap-btn', 'inv-heatmap-btn', 'combined-heatmap-btn'].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => runAllHeatmapSimulations(btnId));
        }
    });
}

function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = document.getElementById(element.id + "header") || element.querySelector('.window-header');

    if (header) {
        // if present, the header is where you move the DIV from:
        header.onmousedown = dragMouseDown;
    } else {
        // otherwise, move the DIV from anywhere inside the DIV:
        element.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        // Skip drag if clicking on input, label, select, or checkbox
        const tag = e.target.tagName.toUpperCase();
        if (tag === 'INPUT' || tag === 'LABEL' || tag === 'SELECT' || tag === 'SPAN') {
            return; // Let input handle the event normally
        }
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

let ws = null;

async function loadChartData(isBackground = false) {
    if (isLoading) return;

    isLoading = true;
    if (!isBackground) showLoading();

    try {
        const interval = timeframeMap[currentTimeframe];
        const limitPerRequest = 1500; // Binance max
        const targetCandles = 1000;
        let allData = [];

        const baseUrl = 'https://fapi.binance.com/fapi/v1/klines';

        let endTime = ''; // Fetch latest first

        while (allData.length < targetCandles) {
            let url = `${baseUrl}?symbol=${currentSymbol}&interval=${interval}&limit=${limitPerRequest}`;
            if (endTime) {
                url += `&endTime=${endTime}`;
            }

            const response = await fetch(url);
            if (!response.ok) {
                if (allData.length > 0) break; // Use what we have if error
                throw new Error(`Failed to fetch data: ${response.statusText}`);
            }
            const data = await response.json();

            if (!data || data.length === 0) break; // No more data

            // Prepend data (older data comes first in array from API, but we act as if we are going backwards)
            // Actually Binance returns Oldest -> Newest.
            // So if we ask for latest (no endTime), we get [T-1499... T].
            // Next request we need endTime = (T-1499).openTime - 1.
            // And that request returns [T-2999 ... T-1500].
            // So we need to put the NEW batch at the BEGINNING of allData.

            allData = [...data, ...allData];

            // Update endTime for next batch (oldest candle's open time - 1ms)
            endTime = data[0][0] - 1;

            // Optional: prevent too many requests/rate limit if needed, but for 7 calls it should be fine.
        }

        // Clip to exactly targetCandles if we over-fetched? Not strictly necessary but clean.
        if (allData.length > targetCandles) {
            allData = allData.slice(allData.length - targetCandles);
        }

        // Transform Binance data to our format
        // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
        // IMPORTANT: Exclude the last candle if it's still forming (closeTime > now)
        const now = Date.now();
        const completeCandles = allData.filter(candle => candle[6] < now); // closeTime < now means complete

        const candlesticks = completeCandles.map(candle => ({
            time: candle[0], // Open time
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            volume: parseFloat(candle[5])
        }));

        chart.setData(candlesticks);

        // Initial Calculation
        recalculateIndicatorsAndCycles(candlesticks);

        hideLoading();

        // Start WebSocket for live updates (only if not background, or check if WS exists)
        if (!isBackground) {
            startWebSocket(currentSymbol, interval);
        }

    } catch (error) {
        console.error('Error loading chart data:', error);
        if (!isBackground) {
            hideLoading();
            // Show full stack for debugging
            alert(`Detailed Error: ${error.name}: ${error.message}\n${error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : ''}`);
            showError(`Failed to load chart data: ${error.message}`);
        }
    } finally {
        isLoading = false;
    }
}

function recalculateIndicatorsAndCycles(candlesticks, lastIsOpening = false) {
    // 1. Indicators: Use all candles (including opening one) for live updates
    const closes = candlesticks.map(c => c.close);
    const highs = candlesticks.map(c => c.high);
    const lows = candlesticks.map(c => c.low);

    // Update Momentum Parameters
    const mCycs = 50, mLbL = 5, mLbR = 5, mMin = 5, mMax = 60;
    cycleMomentum.cycs = mCycs;
    cycleMomentum.lbL = mLbL;
    cycleMomentum.lbR = mLbR;
    cycleMomentum.rangeLower = mMin;
    cycleMomentum.rangeUpper = mMax;

    const momentumValues = cycleMomentum.calculate(closes);
    chart.setMomentum(momentumValues);

    const divergences = cycleMomentum.detectDivergences(momentumValues, highs, lows);
    chart.setDivergences(divergences);

    // 2. Detection: Use only closed candles for cycles and bot
    const closedCandles = lastIsOpening ? candlesticks.slice(0, -1) : candlesticks;
    const closedMomentum = lastIsOpening ? momentumValues.slice(0, -1) : momentumValues;

    const useMomentum = document.getElementById('use-momentum-rule').checked;
    const showIndexCycles = document.getElementById('show-index-cycles').checked;
    const showInverseCycles = document.getElementById('show-inverse-cycles').checked;
    const minDuration = parseInt(document.getElementById('custom-min').value) || 24;
    const maxDuration = parseInt(document.getElementById('custom-max').value) || 44;

    if (chart) {
        chart.minDuration = minDuration;
        chart.maxDuration = maxDuration;
    }

    const priorityMinDuration = document.getElementById('priority-24-bars').checked;
    const sensitivity = parseInt(document.getElementById('cycle-precision').value) || 1;

    let cycles = [];

    // Use closedCandles/closedMomentum for detection
    const invertedCyclesForTarget = cycleDetector.detectCycles(closedCandles, useMomentum, closedMomentum, true, minDuration, maxDuration, priorityMinDuration, null, sensitivity);

    if (showIndexCycles) {
        const cyclesToIndex = cycleDetector.detectCycles(closedCandles, useMomentum, closedMomentum, true, minDuration, maxDuration, priorityMinDuration, currentManualCycle, sensitivity);
        cycles = cycles.concat(cyclesToIndex);
    }
    if (showInverseCycles) {
        const cyclesToInverse = cycleDetector.detectCycles(closedCandles, useMomentum, closedMomentum, false, minDuration, maxDuration, priorityMinDuration, currentManualCycle, sensitivity);
        cycles = cycles.concat(cyclesToInverse);
    }

    cycles.sort((a, b) => a.startIndex - b.startIndex);
    chart.setCycles(cycles);

    // Range End Line
    if (cycles.length > 0) {
        const lastCycle = cycles[cycles.length - 1];
        const currentBarIndex = closedCandles.length - 1; // Base it on last closed bar
        const cycleEndAtMax = lastCycle.startIndex + maxDuration;

        if (currentBarIndex < cycleEndAtMax) {
            const rangeColor = (lastCycle.type === 'inverted') ? '#3b82f6' : '#ef4444';
            chart.setRangeEndLine(lastCycle.startIndex, maxDuration, rangeColor);
        } else {
            chart.setRangeEndLine(null, null);
        }
    } else {
        chart.setRangeEndLine(null, null);
    }

    updateStatistics(cycles, invertedCyclesForTarget, closedMomentum, useMomentum);

    // Closure Markers
    const closureMarkers = cycles.map(c => {
        const potentialEnd = (c.firstPotentialEnd !== undefined && c.firstPotentialEnd !== null) ? c.firstPotentialEnd : c.endIndex;
        const time = closedCandles[potentialEnd]?.time;
        if (!time) return { time: null };
        return { time: String(time), type: c.type };
    }).filter(m => m.time);

    chart.clearClosureMarkers();
    chart.addClosureMarkers(closureMarkers);

    // Bot Trading: Also strictly on closed data
    const indexCyclesForBot = cycleDetector.detectCycles(closedCandles, useMomentum, closedMomentum, true, minDuration, maxDuration, priorityMinDuration);
    const inverseCyclesForBot = cycleDetector.detectCycles(closedCandles, useMomentum, closedMomentum, false, minDuration, maxDuration, priorityMinDuration);

    cycleBot.simulateLiveTrading(
        closedCandles,
        cycleDetector,
        closedMomentum,
        useMomentum,
        minDuration,
        maxDuration,
        priorityMinDuration,
        showIndexCycles,
        showInverseCycles,
        sensitivity
    );

    if (typeof voiceAnnouncer !== 'undefined') {
        voiceAnnouncer.process(cycleBot.trades, closedCandles.length - 1);
    }
    updateBotWidget();
    updateFFT(closedCandles);
    updateAdvancedCycleAnalysis(closedCandles);

    // --- Walk-Forward Analysis ---
    const walkForwardEnabled = document.getElementById('bot-walk-forward')?.checked;
    if (walkForwardEnabled && candlesticks.length >= 900) {
        chart.walkForwardSplitIndex = 900;

        // Auto-Optimize if not already done for current data
        if (!window.isWalkForwardOptimized) {
            console.log('Running Walk-Forward Optimization on first 900 bars...');
            window.isWalkForwardOptimized = true;

            // Run this in timeout to not block UI immediately
            setTimeout(async () => {
                const trainData = candlesticks.slice(0, 900);
                const trainMomentum = cycleMomentum.calculate(trainData.map(c => c.close));
                const useMom = document.getElementById('use-momentum-rule').checked;

                // Show some feedback
                const wfLabel = document.querySelector('label[title*="900 bars"]');
                if (wfLabel) wfLabel.style.color = '#f59e0b';

                const result = calculateCombinedRangeGains(trainData, trainMomentum, useMom, showIndexCycles, showInverseCycles);

                let bestMin = 24, bestMax = 44, bestPnl = -Infinity;
                const { data, minRange, maxRange, step } = result;

                for (let r = 0; r < data.length; r++) {
                    const minD = minRange + r * step;
                    for (let c = 0; c < data[r].length; c++) {
                        const maxD = minRange + c * step;
                        if (data[r][c] !== null && data[r][c] > bestPnl) {
                            bestPnl = data[r][c];
                            bestMin = minD;
                            bestMax = maxD;
                        }
                    }
                }

                console.log(`WF Best Found: ${bestMin}-${bestMax} (PnL: ${bestPnl.toFixed(2)}%)`);

                // Update inputs without triggering loadChartData yet
                document.getElementById('custom-min').value = bestMin;
                document.getElementById('custom-max').value = bestMax;

                if (wfLabel) wfLabel.style.color = '';

                // Trigger one final recalculation with newfound parameters
                console.log('Optimization Complete. Applying new params:', bestMin, bestMax);
                recalculateIndicatorsAndCycles(candlesticks);
            }, 0);
            return; // Exit this call, wait for the optimized one
        }
    } else {
        chart.walkForwardSplitIndex = null;
    }

    // --- Neural Network Analysis ---
    if (window.neuralNet) {
        const aiEnabled = document.getElementById('ai-enabled')?.checked;

        if (aiEnabled) {
            // Collect all detected cycles - ALWAYS use ALL data for NN training
            // (Walk Forward only affects bot trading simulation, not NN training)
            const allCycles = [...indexCyclesForBot, ...inverseCyclesForBot];

            // Train (Async)
            setTimeout(() => {
                const stochValues = calculateStochastic(candlesticks, 14, 3, 3);
                window.neuralNet.train(allCycles, candlesticks, closedMomentum, stochValues);
            }, 100);
        }
    }

    // FORCE RENDER
    chart.render();
}

/**
 * Update Advanced Cycle Analysis Panel
 */
function updateAdvancedCycleAnalysis(candlesticks) {
    if (!window.CycleAnalysis || candlesticks.length < 60) return;

    const closes = candlesticks.map(c => c.close);

    // 1. MESA Spectrum
    try {
        const mesaPeaks = CycleAnalysis.calculateMESA(closes, 20);
        const mesaResultEl = document.getElementById('mesa-result');
        const mesaPeaksEl = document.getElementById('mesa-peaks');

        if (mesaPeaks && mesaPeaks.length > 0) {
            const dominant = mesaPeaks[0];
            mesaResultEl.textContent = `${dominant.period.toFixed(1)} Bars`;

            // Show top 3 peaks as badges
            if (mesaPeaksEl) {
                mesaPeaksEl.innerHTML = mesaPeaks.slice(0, 3).map((p, i) =>
                    `<span style="background: rgba(59,130,246,${0.3 - i * 0.1}); padding: 2px 6px; border-radius: 4px; font-size: 10px; color: #93c5fd;">
                        ${p.period.toFixed(0)}b
                    </span>`
                ).join('');
            }
        } else {
            mesaResultEl.textContent = 'No signal';
            if (mesaPeaksEl) mesaPeaksEl.innerHTML = '';
        }
    } catch (e) {
        console.error('MESA Error:', e);
    }

    // 2. Hilbert Transform
    try {
        const hilbert = CycleAnalysis.calculateHilbert(closes);
        const hilbertResultEl = document.getElementById('hilbert-result');

        if (hilbert && hilbert.period > 0) {
            hilbertResultEl.textContent = `${hilbert.period.toFixed(1)} Bars`;
        } else {
            hilbertResultEl.textContent = 'Unstable';
        }
    } catch (e) {
        console.error('Hilbert Error:', e);
    }

    // 3. Autocorrelation
    try {
        const correlations = CycleAnalysis.calculateAutocorrelation(closes, 60);
        const autocorrResultEl = document.getElementById('autocorr-result');
        const autocorrConfEl = document.getElementById('autocorr-confidence');

        // Find first significant peak after lag 5
        let bestLag = -1;
        let maxCorr = -1;

        if (correlations.length > 10) {
            for (let i = 5; i < correlations.length - 1; i++) {
                if (correlations[i].correlation > correlations[i - 1].correlation &&
                    correlations[i].correlation > correlations[i + 1].correlation) {
                    if (correlations[i].correlation > maxCorr) {
                        maxCorr = correlations[i].correlation;
                        bestLag = correlations[i].lag;
                    }
                }
            }
        }

        if (bestLag > 0) {
            autocorrResultEl.textContent = `${bestLag} Bars`;
            const confidence = Math.min(100, Math.abs(maxCorr * 100));
            autocorrConfEl.textContent = `Confidence: ${confidence.toFixed(0)}%`;
        } else {
            autocorrResultEl.textContent = 'No clear cycle';
            autocorrConfEl.textContent = '';
        }
    } catch (e) {
        console.error('Autocorrelation Error:', e);
    }
}

function startWebSocket(symbol, interval) {
    if (ws) {
        ws.close();
    }

    // Use Binance Futures WebSocket (fstream) instead of Spot (stream)
    const wsUrl = `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${interval}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.e === 'kline') {
            const k = message.k;
            const candle = {
                time: k.t,
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume: parseFloat(k.v)
            };

            updateChartData(candle, k.x);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function updateChartData(newCandle, isClosed) {
    const currentData = chart.data;
    if (currentData.length === 0) return;

    const lastCandle = currentData[currentData.length - 1];

    if (newCandle.time === lastCandle.time) {
        // Update existing candle
        currentData[currentData.length - 1] = newCandle;
    } else {
        // New candle started
        currentData.push(newCandle);
        // Keep limit to avoid memory issues (optional, but good practice)
        if (currentData.length > 1000) {
            currentData.shift();
        }
    }

    // Update Chart Data (this triggers a redraw of candles)
    chart.setData(currentData);

    // Update Chart Data (this triggers a redraw of candles)
    chart.setData(currentData);

    // Recalculate everything: 
    // Indicators use full data, detection strictly on closed candles
    recalculateIndicatorsAndCycles(currentData, !isClosed);

    // Update open trade display in real-time
    if (typeof updateOpenTradeDisplay === 'function') {
        updateOpenTradeDisplay();
    }
}

function updateStatistics(cycles, invertedCyclesForTarget = null, momentumValues = [], useMomentum = false) {
    // Separate cycles by type
    const indexCycles = cycles.filter(c => c.type === 'inverted'); // Inverted in code = Index (L-H-L)
    const inverseCycles = cycles.filter(c => c.type !== 'inverted'); // Normal in code = Inverse (H-L-H)
    const candles = chart.data;

    // Helper to calculate comprehensive stats for a cycle set
    const calcCycleStats = (cycleSet, prefix) => {
        const countEl = document.getElementById(`${prefix}-count`);
        const avgDurEl = document.getElementById(`${prefix}-avg-dur`);
        const maxPriceEl = document.getElementById(`${prefix}-max-price`);
        const stdEl = document.getElementById(`${prefix}-std`);
        const volPreEl = document.getElementById(`${prefix}-vol-pre`);
        const volPostEl = document.getElementById(`${prefix}-vol-post`);
        const trendCanvas = document.getElementById(`${prefix}-trend-chart`);
        const distCanvas = document.getElementById(`${prefix}-dist-chart`);
        const volCanvas = document.getElementById(`${prefix}-vol-chart`);

        if (!cycleSet || cycleSet.length === 0) {
            countEl.textContent = '0';
            avgDurEl.textContent = '-';
            maxPriceEl.textContent = '-';
            stdEl.textContent = '-';
            volPreEl.textContent = '-';
            volPostEl.textContent = '-';
            clearCanvas(trendCanvas);
            clearCanvas(distCanvas);
            clearCanvas(volCanvas);
            return null;
        }

        // Basic stats
        const durations = cycleSet.map(c => c.duration);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / cycleSet.length;
        const variance = durations.reduce((a, b) => a + Math.pow(b - avgDuration, 2), 0) / cycleSet.length;
        const stdDev = Math.sqrt(variance);

        // Max price variation within cycle
        const priceVariations = cycleSet.map(c => {
            if (c.type === 'inverted') {
                // Index (L-H-L): max variation from low to high
                return ((c.maxPrice - c.startPrice) / c.startPrice) * 100;
            } else {
                // Inverse (H-L-H): max variation from high to low
                return ((c.startPrice - c.minPrice) / c.startPrice) * 100;
            }
        });
        const maxPriceVar = Math.max(...priceVariations);
        const avgPriceVar = priceVariations.reduce((a, b) => a + b, 0) / priceVariations.length;

        // Volume Delta (3 bars vs 10 bars before/after cycle close)
        // Collect per-cycle data for the chart
        const volPreData = [];
        const volPostData = [];
        let totalVolPre = 0, totalVolPost = 0, volCount = 0;

        cycleSet.forEach(cycle => {
            const closeIndex = cycle.endIndex;
            if (closeIndex < 13 || closeIndex > candles.length - 4) return;

            // 3 bars before close vs 10 bars before those
            let vol3Pre = 0, vol10Pre = 0;
            for (let i = 1; i <= 3; i++) vol3Pre += candles[closeIndex - i]?.volume || 0;
            vol3Pre /= 3;
            for (let i = 4; i <= 13; i++) vol10Pre += candles[closeIndex - i]?.volume || 0;
            vol10Pre /= 10;

            let deltaPre = 0, deltaPost = 0;
            if (vol10Pre > 0) {
                deltaPre = ((vol3Pre - vol10Pre) / vol10Pre) * 100;
                totalVolPre += deltaPre;
            }

            // 3 bars after close vs baseline
            let vol3Post = 0;
            for (let i = 1; i <= 3; i++) vol3Post += candles[closeIndex + i]?.volume || 0;
            vol3Post /= 3;
            if (vol10Pre > 0) {
                deltaPost = ((vol3Post - vol10Pre) / vol10Pre) * 100;
                totalVolPost += deltaPost;
            }

            volPreData.push(deltaPre);
            volPostData.push(deltaPost);

            // Attach to cycle for reliability calculation
            cycle.volChangePre = deltaPre;
            cycle.volChangePost = deltaPost;

            volCount++;
        });

        const avgVolPre = volCount > 0 ? totalVolPre / volCount : 0;
        const avgVolPost = volCount > 0 ? totalVolPost / volCount : 0;

        // Calculate First→End (bars from first valid close position to actual close)
        // minDuration is available from the outer scope
        const firstEndDeltas = cycleSet.map(c => {
            const firstEnd = c.firstPotentialEnd || c.endIndex;
            return c.endIndex - firstEnd;
        }).filter(d => d >= 0);
        const avgFirstEnd = firstEndDeltas.length > 0
            ? firstEndDeltas.reduce((a, b) => a + b, 0) / firstEndDeltas.length
            : 0;

        // Update DOM
        const firstEndEl = document.getElementById(`${prefix}-first-end`);
        const avgPumpDropEl = document.getElementById(`${prefix}-avg-pump`) || document.getElementById(`${prefix}-avg-drop`);

        countEl.textContent = cycleSet.length;
        avgDurEl.textContent = avgDuration.toFixed(1) + ' bars';

        // Update avg pump/drop
        if (avgPumpDropEl) {
            avgPumpDropEl.textContent = avgPriceVar.toFixed(2) + '%';
        }

        maxPriceEl.textContent = maxPriceVar.toFixed(2) + '%';
        stdEl.textContent = stdDev.toFixed(1);
        firstEndEl.textContent = avgFirstEnd.toFixed(1) + ' bars';
        volPreEl.textContent = (avgVolPre >= 0 ? '+' : '') + avgVolPre.toFixed(1) + '%';
        volPreEl.style.color = avgVolPre >= 0 ? '#10b981' : '#ef4444';
        volPostEl.textContent = (avgVolPost >= 0 ? '+' : '') + avgVolPost.toFixed(1) + '%';
        volPostEl.style.color = avgVolPost >= 0 ? '#10b981' : '#ef4444';

        // Money Management Stats (Theoretical with TP Rules)
        const lev = parseFloat(document.getElementById('bot-leverage').value) || 20;
        const bal = parseFloat(document.getElementById('bot-balance').value) || 1000;
        const cap = parseFloat(document.getElementById('bot-capital').value) || 30;

        // TP Settings
        const tp1PctOfAvg = parseFloat(document.getElementById('bot-tp1-pct').value) || 50;
        const tp1ClosePct = parseFloat(document.getElementById('bot-tp1-close').value) || 50;
        const tp2PctOfAvg = parseFloat(document.getElementById('bot-tp2-pct').value) || 150;

        // Calculate absolute TP targets based on the Average Cycle Move involved
        // avgPriceVar is the Average Pump (Index) or Drop (Inverse)
        const tp1Target = (avgPriceVar * tp1PctOfAvg) / 100;
        const tp2Target = (avgPriceVar * tp2PctOfAvg) / 100;

        let totalCycleRoi = 0;
        let profitableCycles = 0;

        cycleSet.forEach(c => {
            let maxExcursion = 0;
            let endResult = 0;

            if (c.type === 'inverted') {
                // Index: Long
                maxExcursion = ((c.maxPrice - c.startPrice) / c.startPrice) * 100;
                endResult = ((c.endPrice - c.startPrice) / c.startPrice) * 100;
            } else {
                // Inverse: Short
                maxExcursion = ((c.startPrice - c.minPrice) / c.startPrice) * 100;
                endResult = ((c.startPrice - c.endPrice) / c.startPrice) * 100;
            }

            let tradeRoi = 0;
            let remainingPos = 1.0;

            // Loop maintained for other stats (count, distributions) but MM calculation is now formula-based
            // "considering trade closed in profit" -> Filter for winners ONLY (kept for consistency with other metrics if needed, but MM ROI is derived below)
            if (tradeRoi > 0) {
                totalCycleRoi += tradeRoi;
                profitableCycles++;
            }
        });

        // Money Management: Fixed 50/50 Probabilistic Model
        // Win Scenario (50%): Gain from TP1
        // Loss Scenario (50%): Loss equal to 10% of Avg Move * TP1 Close %

        const tp1Decimal = tp1PctOfAvg / 100;       // e.g. 0.50
        const closeDecimal = tp1ClosePct / 100;     // e.g. 0.50
        const lossFactor = 0.10;                    // 10% of Avg Move (Updated from 20%)

        // Win ROI (Strict TP1)
        const winScenarioRoi = (avgPriceVar * tp1Decimal) * lev * closeDecimal;

        // Loss ROI (10% of Avg Move * Close %)
        const lossScenarioRoi = (avgPriceVar * lossFactor) * lev * closeDecimal;

        // Expectancy (50% Win, 50% Loss)
        const expectedRoi = (winScenarioRoi * 0.5) - (lossScenarioRoi * 0.5);

        // Fees (0.08% * Lev, applied to every trade)
        const feeRoi = 0.08 * lev;

        const netRoi = expectedRoi - feeRoi;

        // Profit Calculation
        const investedAmount = bal * (cap / 100);
        const estProfit = investedAmount * (netRoi / 100);

        // Update DOM
        const estRoiEl = document.getElementById(`${prefix}-est-roi`);
        const estProfitEl = document.getElementById(`${prefix}-est-profit`);
        const statusEl = document.getElementById(`${prefix}-mm-status`);

        if (estRoiEl) {
            estRoiEl.textContent = (netRoi >= 0 ? '+' : '') + netRoi.toFixed(2) + '%';
            estRoiEl.className = 'value ' + (netRoi >= 0 ? 'positive' : 'negative');
            // Tooltip to explain details
            estRoiEl.title = `Based on Avg Move ${avgPriceVar.toFixed(2)}%\nTP1: ${tp1Target.toFixed(2)}% (${tp1PctOfAvg}% of Avg)\nAvg Win of Profitable Cycles Only`;
        }
        if (estProfitEl) {
            estProfitEl.textContent = (estProfit >= 0 ? '+' : '') + '$' + estProfit.toFixed(2);
            estProfitEl.className = 'value ' + (estProfit >= 0 ? 'positive' : 'negative');
        }
        if (statusEl) {
            const isProfitable = netRoi > 0;
            statusEl.textContent = isProfitable ? 'PROFIT' : 'LOSS';
            statusEl.style.color = isProfitable ? '#10b981' : '#ef4444';
            statusEl.style.fontWeight = 'bold';
        }

        // Draw charts
        drawTrendChart(trendCanvas, durations);
        // Distribution chart removed - replaced with Range Heatmap (drawn separately)
        drawVolumeChart(volCanvas, volPreData, volPostData);

        // Reliability Gauge
        const reliability = calculateReliability(cycleSet);
        const gaugeCanvas = document.getElementById(`${prefix}-gauge-chart`);
        drawGauge(gaugeCanvas, reliability);

        return { avgDuration, stdDev };
    };

    // Calculate stats for both cycle types
    calcCycleStats(indexCycles, 'idx');
    calcCycleStats(inverseCycles, 'inv');

    // Heatmaps are now on-demand via button click (too slow to run automatically)
    // Only show placeholder if no simulation has been run yet
    const drawHeatmapPlaceholder = (canvasId, dataKey) => {
        // Skip if we already have simulation data
        if (window[dataKey]) return;

        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(30, 30, 40, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('Click "Simulate"', canvas.width / 2, canvas.height / 2);
    };
    drawHeatmapPlaceholder('idx-heatmap', 'idxHeatmapData');
    drawHeatmapPlaceholder('inv-heatmap', 'invHeatmapData');

    // Calculate avgDrop for target line calculation
    let avgDrop = 0;
    if (cycles.length > 0) {
        const drops = cycles.map(c => {
            if (c.type === 'inverted') {
                return ((c.maxPrice - c.endPrice) / c.maxPrice) * 100;
            } else {
                return ((c.startPrice - c.minPrice) / c.startPrice) * 100;
            }
        });
        avgDrop = drops.reduce((a, b) => a + b, 0) / cycles.length;
    }

    // Target line logic
    if (invertedCyclesForTarget && invertedCyclesForTarget.length > 0) {
        const lastInvertedCycle = invertedCyclesForTarget[invertedCyclesForTarget.length - 1];
        const candlesticks = chart.data;
        const isCycleClosed = lastInvertedCycle.endIndex < candlesticks.length - 1;

        if (isCycleClosed) {
            const targetPrice = lastInvertedCycle.endPrice - (lastInvertedCycle.endPrice * avgDrop / 100);
            chart.setTargetLine(targetPrice, avgDrop);
        } else {
            chart.setTargetLine(null);
        }
    } else {
        chart.setTargetLine(null);
    }
}

function clearCanvas(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawTrendChart(canvas, durations) {
    if (!canvas || durations.length < 5) {
        clearCanvas(canvas);
        return;
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Calculate rolling 5 average
    const rollingData = [];
    for (let i = 4; i < durations.length; i++) {
        const window = durations.slice(i - 4, i + 1);
        const avg = window.reduce((a, b) => a + b, 0) / 5;
        rollingData.push(avg);
    }

    if (rollingData.length < 2) {
        clearCanvas(canvas);
        return;
    }

    const min = Math.min(...rollingData) * 0.9;
    const max = Math.max(...rollingData) * 1.1;
    const range = max - min || 1;

    // Padding: left for scale, others for margin
    const leftPadding = 35;
    const padding = 8;
    const plotWidth = width - leftPadding - padding;
    const plotHeight = height - padding * 2;
    const xStep = plotWidth / (rollingData.length - 1);

    // Draw vertical scale
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const scaleSteps = 4;
    for (let i = 0; i <= scaleSteps; i++) {
        const val = min + (range * i / scaleSteps);
        const y = padding + plotHeight - (i / scaleSteps) * plotHeight;
        ctx.fillText(Math.round(val).toString(), leftPadding - 5, y);

        // Draw horizontal grid line
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(leftPadding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }

    // Draw rolling average line
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.beginPath();

    rollingData.forEach((d, i) => {
        const x = leftPadding + i * xStep;
        const y = padding + plotHeight - ((d - min) / range) * plotHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });

    ctx.stroke();

    // Add "Rolling 5" label
    ctx.fillStyle = '#6366f1';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Rolling 5', leftPadding + 2, padding + 8);
}

function drawVolumeChart(canvas, preData, postData) {
    if (!canvas || preData.length < 2) {
        clearCanvas(canvas);
        return;
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Combine data to find range
    const allData = [...preData, ...postData];
    const min = Math.min(...allData, 0) * 1.1;
    const max = Math.max(...allData, 0) * 1.1;
    const range = (max - min) || 1;

    const leftPadding = 30;
    const padding = 8;
    const plotWidth = width - leftPadding - padding;
    const plotHeight = height - padding * 2;
    const xStep = plotWidth / (preData.length - 1 || 1);

    // Draw zero line
    const zeroY = padding + plotHeight - ((0 - min) / range) * plotHeight;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(leftPadding, zeroY);
    ctx.lineTo(width - padding, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw scale
    ctx.fillStyle = '#9ca3af';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(max) + '%', leftPadding - 3, padding);
    ctx.fillText('0%', leftPadding - 3, zeroY);
    ctx.fillText(Math.round(min) + '%', leftPadding - 3, height - padding);

    // Draw Pre line (green)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    preData.forEach((d, i) => {
        const x = leftPadding + i * xStep;
        const y = padding + plotHeight - ((d - min) / range) * plotHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Post line (red/orange)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    postData.forEach((d, i) => {
        const x = leftPadding + i * xStep;
        const y = padding + plotHeight - ((d - min) / range) * plotHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Legend
    ctx.font = '8px Inter, sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.textAlign = 'left';
    ctx.fillText('Pre', leftPadding + 2, padding + 6);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('Post', leftPadding + 25, padding + 6);
}

function drawDistributionChart(canvas, durations) {
    if (!canvas || durations.length < 3) {
        clearCanvas(canvas);
        return;
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Create histogram bins
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const range = max - min || 1;
    const binCount = Math.min(10, durations.length);
    const binWidth = range / binCount;

    const bins = new Array(binCount).fill(0);
    durations.forEach(d => {
        const binIndex = Math.min(binCount - 1, Math.floor((d - min) / binWidth));
        bins[binIndex]++;
    });

    const maxBin = Math.max(...bins);
    const padding = 5;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;
    const barWidth = plotWidth / binCount;

    // Draw bars
    ctx.fillStyle = 'rgba(139, 92, 246, 0.6)';
    bins.forEach((count, i) => {
        const barHeight = (count / maxBin) * plotHeight;
        const x = padding + i * barWidth;
        const y = padding + plotHeight - barHeight;
        ctx.fillRect(x, y, barWidth - 1, barHeight);
    });

    // Draw gaussian curve overlay
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 0) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let x = 0; x < plotWidth; x++) {
            const val = min + (x / plotWidth) * range;
            const gaussian = Math.exp(-Math.pow(val - mean, 2) / (2 * stdDev * stdDev));
            const y = padding + plotHeight - gaussian * plotHeight;
            if (x === 0) ctx.moveTo(padding + x, y);
            else ctx.lineTo(padding + x, y);
        }

        ctx.stroke();
    }
}

function calculateReliability(cycles) {
    if (!cycles || cycles.length < 3) return 0;

    // 1. Duration Stability (Weight: 35%)
    // Consistency of cycle length implies predictability
    const durations = cycles.map(c => c.duration);
    const meanDur = durations.reduce((a, b) => a + b, 0) / durations.length;
    const varDur = durations.reduce((a, b) => a + Math.pow(b - meanDur, 2), 0) / durations.length;
    const stdDevDur = Math.sqrt(varDur);
    const cvDur = meanDur > 0 ? stdDevDur / meanDur : 1; // Coefficient of Variation
    const scoreDur = Math.max(0, Math.min(100, 100 - (cvDur * 200))); // CV 0.1 -> 80, CV 0.5 -> 0

    // 2. Amplitude Stability (Weight: 15%)
    // Consistent power is better than erratic spikes
    const amps = cycles.map(c => c.amplitude);
    const meanAmp = amps.reduce((a, b) => a + b, 0) / amps.length;
    const varAmp = amps.reduce((a, b) => a + Math.pow(b - meanAmp, 2), 0) / amps.length;
    const stdDevAmp = Math.sqrt(varAmp);
    const cvAmp = meanAmp > 0 ? stdDevAmp / meanAmp : 1;
    const scoreAmp = Math.max(0, Math.min(100, 100 - (cvAmp * 200)));

    // 3. Detection Precision / Lag (Weight: 30%)
    // Measures how "late" the cycle close detection is relative to the ideal first potential close
    // Lag = EndIndex - FirstPotentialEnd
    // RelLag = Lag / Duration
    const precisionScores = cycles.map(c => {
        const firstEnd = c.firstPotentialEnd || c.endIndex;
        const lag = Math.max(0, c.endIndex - firstEnd);
        // Avoid division by zero
        const relLag = c.duration > 0 ? lag / c.duration : 0;
        // If lag is 0 -> Score 100. If lag is 10% of duration -> Score 80. If lag is 50% -> Score 0.
        return Math.max(0, 100 - (relLag * 200));
    });
    const scorePrecision = precisionScores.reduce((a, b) => a + b, 0) / precisionScores.length;

    // 4. Volume Consistency (Weight: 20%)
    // Measures stability of Pre/Post volume deltas. Consistent changes are reliable.
    // We only filter cycles that have valid volume data attached (might be missing for edges)
    const volCycles = cycles.filter(c => c.volChangePre !== undefined);
    let scoreVol = 50; // Default if no data

    if (volCycles.length > 2) {
        const volPres = volCycles.map(c => c.volChangePre);
        const meanVol = volPres.reduce((a, b) => a + b, 0) / volPres.length;
        const varVol = volPres.reduce((a, b) => a + Math.pow(b - meanVol, 2), 0) / volPres.length;
        const stdDevVol = Math.sqrt(varVol);

        // If volume deltas are chaotic (High CV), score is low.
        // We use absolute mean because delta can be negative? No, % change usually signed.
        // If we expect positive spikes, mean should be positive.
        // CV = StdDev / Mean.
        let cvVol = 1;
        if (Math.abs(meanVol) > 1) {
            cvVol = stdDevVol / Math.abs(meanVol);
        } else {
            cvVol = stdDevVol; // Fallback
        }
        scoreVol = Math.max(0, Math.min(100, 100 - (cvVol * 100)));
    }

    // Combined Weighted Score
    const finalScore = (scoreDur * 0.35) + (scoreAmp * 0.15) + (scorePrecision * 0.30) + (scoreVol * 0.20);

    return Math.round(finalScore);
}

function drawGauge(canvas, score) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height - 10;
    const radius = Math.min(width / 2, height) - 15;

    // Draw Arc Background (Gradient)
    // Need to draw segments because gradient along arc is hard in raw canvas 
    // Simplified: Red (Left), Yellow (Top), Green (Right)

    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;

    // Segment 1: Red (0-33%)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, Math.PI + (Math.PI / 3));
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ef4444';
    ctx.stroke();

    // Segment 2: Yellow (33-66%)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI + (Math.PI / 3), Math.PI + (2 * Math.PI / 3));
    ctx.strokeStyle = '#eab308';
    ctx.stroke();

    // Segment 3: Green (66-100%)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI + (2 * Math.PI / 3), 2 * Math.PI);
    ctx.strokeStyle = '#10b981';
    ctx.stroke();

    // Needle
    const needleAngle = Math.PI + (score / 100) * Math.PI;
    const needleLen = radius - 5;
    const needleX = centerX + Math.cos(needleAngle) * needleLen;
    const needleY = centerY + Math.sin(needleAngle) * needleLen;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(needleX, needleY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff'; // White needle
    ctx.stroke();

    // Pivot Point
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Score Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(`${score}%`, centerX, centerY - 5);
}

/**
 * Calculate P&L for all Min/Max range combinations using bot simulation
 * @param {Array} candles - Candlestick data
 * @param {boolean} isIndex - true for Index (LONG), false for Inverse (SHORT)
 * @param {Array} momentumValues - Momentum array
 * @param {boolean} useMomentum - Whether to use momentum filter
 * @returns {Object} { data: 2D array [minDur][maxDur] = P&L%, minVal, maxVal }
 */
function calculateRangeGains(candles, isIndex, momentumValues, useMomentum) {
    const MIN_RANGE = 5;
    const MAX_RANGE = 55;
    const STEP = 2; // Step of 2 to reduce calculation time (51/2 = ~25 values per axis)
    const size = Math.ceil((MAX_RANGE - MIN_RANGE + 1) / STEP);

    // Initialize results matrix
    const data = [];
    for (let i = 0; i < size; i++) {
        data.push(new Array(size).fill(null));
    }

    let minVal = Infinity;
    let maxVal = -Infinity;

    // Get ALL current bot config from UI (must match main bot exactly)
    const startingBalance = parseFloat(document.getElementById('bot-balance').value) || 1000;
    const leverage = parseFloat(document.getElementById('bot-leverage').value) || 20;
    const capitalPct = parseFloat(document.getElementById('bot-capital').value) || 30;
    const tp1Pct = parseFloat(document.getElementById('bot-tp1-pct').value) || 50;
    const tp1Close = parseFloat(document.getElementById('bot-tp1-close').value) || 60;
    const tp2Pct = parseFloat(document.getElementById('bot-tp2-pct').value) || 150;
    const threeBar = document.getElementById('bot-3bar').checked;
    const feesEnabled = document.getElementById('bot-fees').checked;
    const sensitivity = parseInt(document.getElementById('cycle-precision').value) || 1;

    // Risk Management settings
    const maxLossPercent = parseFloat(document.getElementById('bot-max-loss-pct').value) || 5;
    const closeOnOpposite = document.getElementById('bot-opp-close').checked;
    const maTrendFilter = document.getElementById('bot-ma-trend').checked;
    const maxLossEnabled = document.getElementById('bot-max-loss').checked;
    const multiTradeEnabled = document.getElementById('bot-multi-trade').checked;

    // Advanced Filters
    const volFilterEnabled = document.getElementById('bot-vol-filter').checked;
    const volFactor = parseFloat(document.getElementById('bot-vol-factor').value) || 1.2;

    // Trailing Stop
    const trailingStopEnabled = document.getElementById('bot-trailing').checked;
    const trailingActivation = parseFloat(document.getElementById('bot-trail-act').value) || 0.5;
    const trailingCallback = parseFloat(document.getElementById('bot-trail-callback').value) || 0.2;

    // Dynamic Exits
    const dynamicExitEnabled = document.getElementById('bot-dyn-exit').checked;
    const dynamicSLMult = parseFloat(document.getElementById('bot-dyn-sl-mult').value) || 2.0;
    const dynamicTPMult = parseFloat(document.getElementById('bot-dyn-tp-mult').value) || 3.0;

    const detector = new CycleDetector();

    // Loop through combinations with step
    for (let minIdx = 0; minIdx < size; minIdx++) {
        const minDur = MIN_RANGE + minIdx * STEP;
        for (let maxIdx = 0; maxIdx < size; maxIdx++) {
            const maxDur = MIN_RANGE + maxIdx * STEP;

            // Skip invalid combinations (max must be > min + some buffer)
            if (maxDur <= minDur + 3) continue;

            try {
                // Create fresh bot with EXACT same config as main bot
                const testBot = new CycleTradingBot();
                testBot.updateConfig({
                    startingBalance: startingBalance,
                    leverage: leverage,
                    capitalPercentage: capitalPct,
                    feesEnabled: feesEnabled,
                    tp1AvgPercent: tp1Pct,
                    tp1CloseFraction: tp1Close,
                    tp2AvgPercent: tp2Pct,
                    threeBarConfirmation: threeBar,
                    maxLossPercent: maxLossPercent,
                    closeOnOpposite: closeOnOpposite,
                    maTrendFilter: maTrendFilter,
                    maxLossEnabled: maxLossEnabled,
                    multiTradeEnabled: multiTradeEnabled,
                    volFilterEnabled: volFilterEnabled,
                    volFactor: volFactor,
                    trailingStopEnabled: trailingStopEnabled,
                    trailingActivation: trailingActivation,
                    trailingCallback: trailingCallback,
                    dynamicExitEnabled: dynamicExitEnabled,
                    dynamicSLMult: dynamicSLMult,
                    dynamicTPMult: dynamicTPMult
                });

                // Run simulation - enable only the relevant cycle type
                const enableLong = isIndex;
                const enableShort = !isIndex;

                testBot.simulateLiveTrading(
                    candles,
                    detector,
                    momentumValues,
                    useMomentum,
                    minDur,
                    maxDur,
                    true, // priorityMinDuration
                    enableLong,
                    enableShort,
                    sensitivity
                );

                // Skip if not enough trades
                if (testBot.trades.length < 3) continue;

                // Calculate P&L %
                const pnlPct = ((testBot.currentBalance - 1000) / 1000) * 100;
                data[minIdx][maxIdx] = pnlPct;

                if (pnlPct < minVal) minVal = pnlPct;
                if (pnlPct > maxVal) maxVal = pnlPct;

            } catch (e) {
                // Skip failed combinations
            }
        }
    }

    return { data, minVal, maxVal, minRange: MIN_RANGE, maxRange: MAX_RANGE, step: STEP };
}

/**
 * Calculate combined P&L for all Min/Max range combinations (Both Long AND Short enabled)
 * This matches how the main bot works when both Index and Inverse cycles are visible
 */
function calculateCombinedRangeGains(candles, momentumValues, useMomentum, forceEnableLong = null, forceEnableShort = null) {
    const MIN_RANGE = 5;
    const MAX_RANGE = 55;
    const STEP = 2;
    const size = Math.ceil((MAX_RANGE - MIN_RANGE + 1) / STEP);

    const data = [];
    for (let i = 0; i < size; i++) {
        data.push(new Array(size).fill(null));
    }

    let minVal = Infinity;
    let maxVal = -Infinity;

    // Get ALL current bot config from UI (must match main bot exactly)
    const startingBalance = parseFloat(document.getElementById('bot-balance').value) || 1000;
    const leverage = parseFloat(document.getElementById('bot-leverage').value) || 20;
    const capitalPct = parseFloat(document.getElementById('bot-capital').value) || 30;
    const tp1Pct = parseFloat(document.getElementById('bot-tp1-pct').value) || 50;
    const tp1Close = parseFloat(document.getElementById('bot-tp1-close').value) || 60;
    const tp2Pct = parseFloat(document.getElementById('bot-tp2-pct').value) || 150;
    const threeBar = document.getElementById('bot-3bar').checked;
    const feesEnabled = document.getElementById('bot-fees').checked;
    const sensitivity = parseInt(document.getElementById('cycle-precision').value) || 1;

    const maxLossPercent = parseFloat(document.getElementById('bot-max-loss-pct').value) || 5;
    const closeOnOpposite = document.getElementById('bot-opp-close').checked;
    const maTrendFilter = document.getElementById('bot-ma-trend').checked;
    const maxLossEnabled = document.getElementById('bot-max-loss').checked;
    const multiTradeEnabled = document.getElementById('bot-multi-trade').checked;
    const volFilterEnabled = document.getElementById('bot-vol-filter').checked;
    const volFactor = parseFloat(document.getElementById('bot-vol-factor').value) || 1.2;
    const trailingStopEnabled = document.getElementById('bot-trailing').checked;
    const trailingActivation = parseFloat(document.getElementById('bot-trail-act').value) || 0.5;
    const trailingCallback = parseFloat(document.getElementById('bot-trail-callback').value) || 0.2;
    const dynamicExitEnabled = document.getElementById('bot-dyn-exit').checked;
    const dynamicSLMult = parseFloat(document.getElementById('bot-dyn-sl-mult').value) || 2.0;
    const dynamicTPMult = parseFloat(document.getElementById('bot-dyn-tp-mult').value) || 3.0;

    const detector = new CycleDetector();

    for (let minIdx = 0; minIdx < size; minIdx++) {
        const minDur = MIN_RANGE + minIdx * STEP;
        for (let maxIdx = 0; maxIdx < size; maxIdx++) {
            const maxDur = MIN_RANGE + maxIdx * STEP;

            if (maxDur <= minDur + 3) continue;

            try {
                const testBot = new CycleTradingBot();
                testBot.updateConfig({
                    startingBalance: startingBalance,
                    leverage: leverage,
                    capitalPercentage: capitalPct,
                    feesEnabled: feesEnabled,
                    tp1AvgPercent: tp1Pct,
                    tp1CloseFraction: tp1Close,
                    tp2AvgPercent: tp2Pct,
                    threeBarConfirmation: threeBar,
                    maxLossPercent: maxLossPercent,
                    closeOnOpposite: closeOnOpposite,
                    maTrendFilter: maTrendFilter,
                    maxLossEnabled: maxLossEnabled,
                    multiTradeEnabled: multiTradeEnabled,
                    volFilterEnabled: volFilterEnabled,
                    volFactor: volFactor,
                    trailingStopEnabled: trailingStopEnabled,
                    trailingActivation: trailingActivation,
                    trailingCallback: trailingCallback,
                    dynamicExitEnabled: dynamicExitEnabled,
                    dynamicSLMult: dynamicSLMult,
                    dynamicTPMult: dynamicTPMult
                });

                // Run simulation with BOTH Long AND Short enabled (combined)
                testBot.simulateLiveTrading(
                    candles,
                    detector,
                    momentumValues,
                    useMomentum,
                    minDur,
                    maxDur,
                    true,
                    forceEnableLong !== null ? forceEnableLong : document.getElementById('show-index-cycles').checked,
                    forceEnableShort !== null ? forceEnableShort : document.getElementById('show-inverse-cycles').checked,
                    sensitivity
                );

                if (testBot.trades.length < 3) continue;

                const pnlPct = ((testBot.currentBalance - startingBalance) / startingBalance) * 100;
                data[minIdx][maxIdx] = pnlPct;

                if (pnlPct < minVal) minVal = pnlPct;
                if (pnlPct > maxVal) maxVal = pnlPct;

            } catch (e) {
                // Skip failed
            }
        }
    }

    return { data, minVal, maxVal, minRange: MIN_RANGE, maxRange: MAX_RANGE, step: STEP };
}
/**
 * Calculate Stochastic Oscillator
 * @param {Array} candles - Array of candle objects
 * @param {number} period - Lookback period (default 14)
 * @param {number} smoothK - Smoothing for %K (default 3)
 * @param {number} smoothD - Smoothing for %D (default 3)
 * @returns {Array} Array of { k, d } objects aligned with candles
 */
function calculateStochastic(candles, period = 14, smoothK = 3, smoothD = 3) {
    // IMPORTANT: Use map to create unique objects, not fill (which shares references)
    const results = Array.from({ length: candles.length }, () => ({ k: 50, d: 50 }));

    // SMA Helper
    const sma = (arr, p) => {
        const res = [];
        for (let i = 0; i < arr.length; i++) {
            if (i < p - 1) {
                res.push(arr[i]); // Should be null but keep logical
                continue;
            }
            let sum = 0;
            for (let j = 0; j < p; j++) sum += arr[i - j];
            res.push(sum / p);
        }
        return res;
    };

    const rawK = [];

    for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) {
            rawK.push(50);
            continue;
        }

        let lowestLow = Infinity;
        let highestHigh = -Infinity;

        for (let j = 0; j < period; j++) {
            const c = candles[i - j];
            if (c.low < lowestLow) lowestLow = c.low;
            if (c.high > highestHigh) highestHigh = c.high;
        }

        const currentClose = candles[i].close;
        const numerator = currentClose - lowestLow;
        const denominator = highestHigh - lowestLow;

        let k = 50;
        if (denominator !== 0) {
            k = (numerator / denominator) * 100;
        }
        rawK.push(k);
    }

    // Smooth K and Calculate D
    const smoothedK = sma(rawK, smoothK);
    const smoothedD = sma(smoothedK, smoothD);

    for (let i = 0; i < candles.length; i++) {
        results[i] = {
            k: isNaN(smoothedK[i]) ? 50 : smoothedK[i],
            d: isNaN(smoothedD[i]) ? 50 : smoothedD[i]
        };
    }

    return results;
}

/**
 * Draw a heatmap on the given canvas
 * @param {HTMLCanvasElement} canvas 
 * @param {Object} heatmapData - Result from calculateRangeGains
 * @param {number} currentMin - Currently selected min duration
 * @param {number} currentMax - Currently selected max duration
 */
function drawHeatmap(canvas, heatmapData, currentMin, currentMax) {
    if (!canvas || !heatmapData) return;

    const ctx = canvas.getContext('2d');
    const { data, minVal, maxVal, minRange, maxRange, step = 1 } = heatmapData;
    const size = data.length;

    const width = canvas.width;
    const height = canvas.height;
    const padding = { left: 25, right: 5, top: 12, bottom: 18 };

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const cellWidth = chartWidth / size;
    const cellHeight = chartHeight / size;

    ctx.clearRect(0, 0, width, height);

    // Normalize colors relative to the actual min/max in the dataset
    // This ensures the full color range is used regardless of absolute P&L values
    const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal), 1);

    const getColor = (value) => {
        if (value === null) return 'rgba(40, 40, 50, 0.4)';

        // Normalize to -1 to +1 range
        const normalized = Math.max(-1, Math.min(1, value / absMax));

        if (normalized >= 0) {
            // Positive: Green gradient using HSL for smooth transition
            // normalized 0 = dark green, normalized 1 = bright lime green
            const hue = 120; // Green
            const saturation = 60 + normalized * 40; // 60-100%
            const lightness = 20 + normalized * 45; // 20-65% (darker to brighter)
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        } else {
            // Negative: Red gradient using HSL
            // normalized -1 = bright red, normalized 0 = dark red
            const intensity = Math.abs(normalized);
            const hue = 0; // Red
            const saturation = 60 + intensity * 40; // 60-100%
            const lightness = 20 + intensity * 35; // 20-55%
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        }
    };

    // Draw cells
    for (let minIdx = 0; minIdx < size; minIdx++) {
        for (let maxIdx = 0; maxIdx < size; maxIdx++) {
            const value = data[minIdx][maxIdx];
            const x = padding.left + maxIdx * cellWidth;
            const y = padding.top + minIdx * cellHeight;

            ctx.fillStyle = getColor(value);
            ctx.fillRect(x, y, cellWidth, cellHeight);

            // Highlight current selection (approximate match due to step)
            const cellMinDur = minRange + minIdx * step;
            const cellMaxDur = minRange + maxIdx * step;
            if (Math.abs(cellMinDur - currentMin) <= step && Math.abs(cellMaxDur - currentMax) <= step) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, cellWidth, cellHeight);
            }
        }
    }

    // Draw axes labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '7px Inter';
    ctx.textAlign = 'center';

    // X-axis (Max Duration) - show 5 labels
    const xLabelStep = Math.floor(size / 5);
    for (let i = 0; i <= size; i += xLabelStep) {
        const x = padding.left + i * cellWidth;
        ctx.fillText(String(minRange + i * step), x, height - 5);
    }

    // Y-axis (Min Duration) - show 5 labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= size; i += xLabelStep) {
        const y = padding.top + i * cellHeight + 3;
        ctx.fillText(String(minRange + i * step), padding.left - 2, y);
    }

    // Show best value
    let bestMin = 0, bestMax = 0, bestVal = -Infinity;
    for (let minIdx = 0; minIdx < size; minIdx++) {
        for (let maxIdx = 0; maxIdx < size; maxIdx++) {
            if (data[minIdx][maxIdx] !== null && data[minIdx][maxIdx] > bestVal) {
                bestVal = data[minIdx][maxIdx];
                bestMin = minRange + minIdx * step;
                bestMax = minRange + maxIdx * step;
            }
        }
    }

    if (bestVal > -Infinity) {
        ctx.fillStyle = bestVal >= 0 ? '#10b981' : '#ef4444';
        ctx.font = 'bold 8px Inter';
        ctx.textAlign = 'left';
        ctx.fillText(`Best: ${bestMin}-${bestMax} (${bestVal.toFixed(0)}%)`, padding.left, padding.top - 2);
    }
}
function calculateRollingMedian(cycles, windowSize) {
    if (cycles.length < windowSize) return [];

    const medians = [];
    const durations = cycles.map(c => c.duration);

    for (let i = windowSize - 1; i < durations.length; i++) {
        const window = durations.slice(i - windowSize + 1, i + 1);
        // Sort to find median
        window.sort((a, b) => a - b);
        const mid = Math.floor(window.length / 2);
        const median = window.length % 2 !== 0 ? window[mid] : (window[mid - 1] + window[mid]) / 2;
        medians.push(median);
    }
    return medians;
}

function drawStatsChart(data) {
    const canvas = document.getElementById('stats-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (data.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('Not enough data (need 10+ cycles)', width / 2, height / 2);
        return;
    }

    // Scale
    const minVal = Math.min(...data) * 0.9;
    const maxVal = Math.max(...data) * 1.1;
    const range = maxVal - minVal || 1;

    const padding = 10;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    const xStep = plotWidth / (data.length - 1 || 1);

    // Draw Line
    ctx.beginPath();
    ctx.strokeStyle = '#6366f1'; // Accent color
    ctx.lineWidth = 2;

    data.forEach((val, i) => {
        const x = padding + i * xStep;
        const y = height - padding - ((val - minVal) / range) * plotHeight;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });

    ctx.stroke();

    // Draw Points
    ctx.fillStyle = '#8b5cf6';
    data.forEach((val, i) => {
        const x = padding + i * xStep;
        const y = height - padding - ((val - minVal) / range) * plotHeight;

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    });
}

function showLoading() {
    const loading = document.getElementById('loading');
    loading.classList.remove('hidden');
}

function hideLoading() {
    const loading = document.getElementById('loading');
    loading.classList.add('hidden');
}

function showError(message) {
    // Create error notification
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        z-index: 1000;
        animation: slideInRight 0.3s ease-out;
        font-family: Inter, sans-serif;
        max-width: 400px;
    `;
    errorDiv.textContent = message;

    document.body.appendChild(errorDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        errorDiv.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => errorDiv.remove(), 300);
    }, 5000);
}

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ===== BOT WIDGET FUNCTIONS =====

function setupBotWidget() {
    // Bot is now a fixed section, no longer draggable

    // Listen for settings changes
    const balanceInput = document.getElementById('bot-balance');
    const leverageInput = document.getElementById('bot-leverage');
    const capitalInput = document.getElementById('bot-capital');
    const feesToggle = document.getElementById('bot-fees');
    const tp1PctInput = document.getElementById('bot-tp1-pct');
    const tp1CloseInput = document.getElementById('bot-tp1-close');
    const tp2PctInput = document.getElementById('bot-tp2-pct');
    const threeBarToggle = document.getElementById('bot-3bar');

    const updateBotConfig = () => {
        cycleBot.updateConfig({
            startingBalance: balanceInput.value,
            leverage: leverageInput.value,
            capitalPercentage: capitalInput.value,
            feesEnabled: feesToggle.checked,
            tp1AvgPercent: tp1PctInput ? tp1PctInput.value : 20,
            tp1CloseFraction: tp1CloseInput ? tp1CloseInput.value : 80,
            tp2AvgPercent: tp2PctInput ? tp2PctInput.value : 150,
            threeBarConfirmation: threeBarToggle ? threeBarToggle.checked : false,
            maxLossPercent: document.getElementById('bot-max-loss-pct').value,
            closeOnOpposite: document.getElementById('bot-opp-close').checked,
            maTrendFilter: document.getElementById('bot-ma-trend').checked,
            maxLossEnabled: document.getElementById('bot-max-loss').checked,
            multiTradeEnabled: document.getElementById('bot-multi-trade').checked,

            // Advanced Filters
            atrFilterEnabled: false, // Removed
            atrThreshold: 5,
            volFilterEnabled: document.getElementById('bot-vol-filter').checked,
            volFactor: parseFloat(document.getElementById('bot-vol-factor').value),
            adxFilterEnabled: false, // Removed
            adxThreshold: 20,

            // Risk Management
            trailingStopEnabled: document.getElementById('bot-trailing').checked,
            trailingActivation: document.getElementById('bot-trail-act').value,
            trailingCallback: document.getElementById('bot-trail-callback').value,
            dynamicExitEnabled: document.getElementById('bot-dyn-exit').checked,
            dynamicSLMult: document.getElementById('bot-dyn-sl-mult').value,
            dynamicTPMult: document.getElementById('bot-dyn-tp-mult').value,
            pyramidingEnabled: document.getElementById('bot-pyramiding').checked
        });
        // Recalculate with new settings
        if (chart.data && chart.data.length > 0) {
            recalculateIndicatorsAndCycles(chart.data);
        }
    };

    // Add both 'change' and 'input' events for immediate updates
    ['change', 'input'].forEach(evt => {
        balanceInput.addEventListener(evt, updateBotConfig);
        leverageInput.addEventListener(evt, updateBotConfig);
        capitalInput.addEventListener(evt, updateBotConfig);
        if (tp1PctInput) tp1PctInput.addEventListener(evt, updateBotConfig);
        if (tp1CloseInput) tp1CloseInput.addEventListener(evt, updateBotConfig);
        if (tp2PctInput) tp2PctInput.addEventListener(evt, updateBotConfig);
        document.getElementById('bot-max-loss-pct').addEventListener(evt, updateBotConfig);

        // Advanced Inputs

        document.getElementById('bot-vol-filter').addEventListener(evt, updateBotConfig);
        document.getElementById('bot-vol-factor').addEventListener(evt, updateBotConfig);
        document.getElementById('bot-trail-act').addEventListener(evt, updateBotConfig);
        document.getElementById('bot-trail-callback').addEventListener(evt, updateBotConfig);
        document.getElementById('bot-dyn-sl-mult').addEventListener(evt, updateBotConfig);
        document.getElementById('bot-dyn-tp-mult').addEventListener(evt, updateBotConfig);
    });
    feesToggle.addEventListener('change', updateBotConfig);
    if (threeBarToggle) threeBarToggle.addEventListener('change', updateBotConfig);
    document.getElementById('bot-opp-close').addEventListener('change', updateBotConfig);
    document.getElementById('bot-ma-trend').addEventListener('change', updateBotConfig);
    document.getElementById('bot-max-loss').addEventListener('change', updateBotConfig);
    document.getElementById('bot-multi-trade').addEventListener('change', updateBotConfig);

    // Advanced Toggles
    document.getElementById('bot-vol-filter').addEventListener('change', updateBotConfig);
    document.getElementById('bot-trailing').addEventListener('change', updateBotConfig);
    document.getElementById('bot-dyn-exit').addEventListener('change', updateBotConfig);
    document.getElementById('bot-pyramiding').addEventListener('change', updateBotConfig);

    // Bot toggle
    const botToggle = document.getElementById('bot-enabled');
    const botStatus = document.getElementById('bot-status');

    botToggle.addEventListener('change', () => {
        const isEnabled = botToggle.checked;
        botStatus.textContent = isEnabled ? 'ON' : 'OFF';
        botStatus.classList.toggle('active', isEnabled);

        if (isEnabled) {
            // Recalculate to get trades
            if (chart.data && chart.data.length > 0) {
                recalculateIndicatorsAndCycles(chart.data);
            }
        } else {
            // Clear trade markers when disabled
            chart.clearTradeMarkers();
            // Reset widget stats
            document.getElementById('bot-pnl').textContent = '$0.00';
            document.getElementById('bot-winrate').textContent = '0%';
            document.getElementById('bot-trades').textContent = '0';
            document.getElementById('bot-current-balance').textContent = '$' + cycleBot.startingBalance.toFixed(2);
        }
    });

    // Initial status
    botStatus.textContent = botToggle.checked ? 'ON' : 'OFF';
    botStatus.classList.toggle('active', botToggle.checked);
}

function isBotEnabled() {
    const toggle = document.getElementById('bot-enabled');
    return toggle && toggle.checked;
}

function updateBotWidget() {
    if (!isBotEnabled()) {
        chart.clearTradeMarkers();
        return;
    }

    const stats = cycleBot.getStats();

    // Update PnL
    const pnlEl = document.getElementById('bot-pnl');
    const pnlValue = stats.totalPnL;
    pnlEl.textContent = (pnlValue >= 0 ? '+' : '') + '$' + pnlValue.toFixed(2);
    pnlEl.className = 'stat-value ' + (pnlValue >= 0 ? 'positive' : 'negative');

    // Update PnL %
    const pnlPercentEl = document.getElementById('bot-pnl-percent');
    const pnlPercentValue = stats.pnlPercent;
    pnlPercentEl.textContent = (pnlPercentValue >= 0 ? '+' : '') + pnlPercentValue.toFixed(2) + '%';
    pnlPercentEl.className = 'stat-value ' + (pnlPercentValue >= 0 ? 'positive' : 'negative');

    // Update Win Rate
    const winrateEl = document.getElementById('bot-winrate');
    winrateEl.textContent = stats.winRate.toFixed(1) + '%';

    // Update Trades count
    document.getElementById('bot-trades').textContent = stats.totalTrades;

    // Update Current Balance
    const balanceEl = document.getElementById('bot-current-balance');
    balanceEl.textContent = '$' + stats.currentBalance.toFixed(2);
    balanceEl.className = 'stat-value ' + (stats.currentBalance >= cycleBot.startingBalance ? 'positive' : 'negative');

    // Walk-Forward Separated Stats
    const walkForwardEnabled = document.getElementById('bot-walk-forward')?.checked;
    const wfStatsRow = document.getElementById('wf-stats-row');
    if (walkForwardEnabled && wfStatsRow) {
        wfStatsRow.style.display = 'flex';
        const trades = cycleBot.getTrades();
        const splitIndex = chart.walkForwardSplitIndex || 900;
        const trainTrades = trades.filter(t => t.entryIndex < splitIndex);
        const testTrades = trades.filter(t => t.entryIndex >= splitIndex);

        const calcWFStats = (tList) => {
            const pnl = tList.reduce((s, t) => s + (t.pnl || 0), 0);
            const wins = tList.filter(t => (t.pnl || 0) > 0).length;
            const wr = tList.length > 0 ? (wins / tList.length) * 100 : 0;
            return { pnl, wr };
        };

        const trainStats = calcWFStats(trainTrades);
        const testStats = calcWFStats(testTrades);

        const setWFEl = (id, val, isPnl) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = isPnl ? (val >= 0 ? '+' : '') + '$' + val.toFixed(2) : val.toFixed(1) + '%';
            el.style.color = val >= 0 ? '#10b981' : '#ef4444';
        };

        setWFEl('wf-train-pnl', trainStats.pnl, true);
        setWFEl('wf-train-wr', trainStats.wr, false);
        setWFEl('wf-test-pnl', testStats.pnl, true);
        setWFEl('wf-test-wr', testStats.wr, false);
    } else if (wfStatsRow) {
        wfStatsRow.style.display = 'none';
    }

    // Set trade markers on chart (filtered by same filters as table)
    const trades = cycleBot.getTrades();
    const filteredTrades = filterTrades(trades);
    console.log('Bot trades:', trades.length, 'trades, filtered:', filteredTrades.length);
    chart.setTradeMarkers(filteredTrades);
    chart.setExitMarkers(filteredTrades);
    chart.setTradeLines(filteredTrades);

    // Update detailed trade stats table
    updateTradeStatsTable(trades);

    // Update trades history table
    updateTradesHistoryTable(trades);

    // Update open trade display
    updateOpenTradeDisplay();

    // Draw Equity Chart
    drawEquityChart();
}

function updateOpenTradeDisplay() {
    const typeEl = document.getElementById('open-trade-type');
    const entryEl = document.getElementById('open-trade-entry');
    const pnlEl = document.getElementById('open-trade-pnl');
    const tp1El = document.getElementById('open-trade-tp1');
    const tp2El = document.getElementById('open-trade-tp2');
    const slEl = document.getElementById('open-trade-sl');

    if (!typeEl) {
        console.log('Open trade elements not found');
        return;
    }

    const pos = cycleBot ? cycleBot.openPosition : null;

    // If no openPosition, check for last trade that might still be "open" (exit at last candle)
    let currentPos = pos;
    if (!currentPos && cycleBot) {
        const trades = cycleBot.getTrades();
        const lastTrade = trades[trades.length - 1];
        const dataLen = chart.data ? chart.data.length : 0;
        // If last trade exits at last candle or close to it, it's effectively "current"
        if (lastTrade && lastTrade.exitIndex >= dataLen - 2) {
            // This trade is still "active" in the current view - show it
            currentPos = {
                type: lastTrade.type,
                entryPrice: lastTrade.entryPrice,
                capitalUsed: lastTrade.pnl > 0 ? lastTrade.pnl / 10 : 200, // Estimate
                slPrice: null
            };
        }
    }

    console.log('Display pos:', currentPos);

    if (!currentPos) {
        typeEl.textContent = '-';
        typeEl.className = 'open-type';
        entryEl.textContent = '-';
        pnlEl.textContent = '-';
        pnlEl.className = 'open-val';
        tp1El.textContent = '-';
        tp2El.textContent = '-';
        slEl.textContent = '-';
        chart.clearTPLines();
        chart.clearOpenPosition();
        return;
    }

    // Type
    typeEl.textContent = currentPos.type;
    typeEl.className = 'open-type ' + currentPos.type.toLowerCase();

    // Entry
    entryEl.textContent = currentPos.entryPrice.toFixed(3);

    // Calculate unrealized PnL
    const lastCandle = chart.data[chart.data.length - 1];
    const currentPrice = lastCandle ? lastCandle.close : currentPos.entryPrice;
    let unrealizedPnL;
    if (currentPos.type === 'LONG') {
        unrealizedPnL = ((currentPrice - currentPos.entryPrice) / currentPos.entryPrice) * (currentPos.capitalUsed || 200) * cycleBot.leverage;
    } else {
        unrealizedPnL = ((currentPos.entryPrice - currentPrice) / currentPos.entryPrice) * (currentPos.capitalUsed || 200) * cycleBot.leverage;
    }
    pnlEl.textContent = (unrealizedPnL >= 0 ? '+' : '') + '$' + unrealizedPnL.toFixed(2);
    pnlEl.className = 'open-val ' + (unrealizedPnL >= 0 ? 'positive' : 'negative');

    // Calculate TP1 level (based on 50% of avg cycle move from last 10 cycles)
    // Calculate TP2 level (based on tp2AvgPercent of avg cycle move)
    // Use TP levels stored in the position (Dynamic ATR or Default)
    let tp1Price = currentPos.tp1Price;
    let tp2Price = currentPos.tp2Price;

    // Fallback recalculation only if missing (legacy support)
    if (!tp1Price || !tp2Price) {
        const tp1Percent = cycleBot.tp1AvgPercent / 100;
        const tp2Percent = cycleBot.tp2AvgPercent / 100;

        if (currentPos.type === 'LONG') {
            const avgPump = cycleBot.avgIndexPump || 1;
            tp1Price = currentPos.entryPrice * (1 + (avgPump * tp1Percent) / 100);
            tp2Price = currentPos.entryPrice * (1 + (avgPump * tp2Percent) / 100);
        } else {
            const avgDrop = cycleBot.avgInverseDrop || 1;
            tp1Price = currentPos.entryPrice * (1 - (avgDrop * tp1Percent) / 100);
            tp2Price = currentPos.entryPrice * (1 - (avgDrop * tp2Percent) / 100);
        }
    }

    tp1El.textContent = tp1Price.toFixed(3);
    tp2El.textContent = tp2Price.toFixed(3);
    slEl.textContent = currentPos.slPrice ? currentPos.slPrice.toFixed(3) : '-';

    // Draw TP lines on chart
    chart.setTPLines(tp1Price, tp2Price, currentPos.type);

    // Draw open position entry and SL lines on chart
    chart.setOpenPosition(currentPos.entryPrice, currentPos.type, currentPos.slPrice);
}

function updateTradeStatsTable(trades) {
    const longTrades = trades.filter(t => t.type === 'LONG');
    const shortTrades = trades.filter(t => t.type === 'SHORT');

    // Count by exit reason - use 'reason' field
    const countByReason = (arr, reason) => arr.filter(t => t.reason && t.reason.includes(reason)).length;
    const sumByReason = (arr, reason) => arr.filter(t => t.reason && t.reason.includes(reason)).reduce((s, t) => s + (t.pnl || 0), 0);

    // Qty
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setEl('stat-long-qty', longTrades.length);
    setEl('stat-short-qty', shortTrades.length);
    setEl('stat-total-qty', trades.length);

    // Failed (SL)
    // Now searching for 'SL' or 'stop_loss' (legacy)
    const countSL = (arr) => arr.filter(t => t.reason && (t.reason.includes('SL') || t.reason.includes('stop_loss') || t.reason.includes('sl'))).length;
    const longFailed = countSL(longTrades);
    const shortFailed = countSL(shortTrades);
    setEl('stat-long-failed', longFailed);
    setEl('stat-short-failed', shortFailed);
    setEl('stat-total-failed', longFailed + shortFailed);

    // TP1
    // Now searching for 'TP1' (uppercase) which matches 'Exit_TP1_Partial'
    const countTP1 = (arr) => arr.filter(t => t.reason && (t.reason.includes('TP1') || t.reason.includes('tp1'))).length;
    const longTP1 = countTP1(longTrades);
    const shortTP1 = countTP1(shortTrades);
    setEl('stat-long-tp1', longTP1);
    setEl('stat-short-tp1', shortTP1);
    setEl('stat-total-tp1', longTP1 + shortTP1);

    // TP2
    const countTP2 = (arr) => arr.filter(t => t.reason && (t.reason.includes('TP2') || t.reason.includes('tp2'))).length;
    const longTP2 = countTP2(longTrades);
    const shortTP2 = countTP2(shortTrades);
    setEl('stat-long-tp2', longTP2);
    setEl('stat-short-tp2', shortTP2);
    setEl('stat-total-tp2', longTP2 + shortTP2);

    // Cycle End (Everything else)
    // If not SL, TP1, or TP2, it's Cycle End (time exit or manual close)
    // Actually, simple count of 'cycle' logic is 'cycle_end' or similar
    // We can count explicitly 'cycle_end' or just total - (TP + SL)
    // But let's stick to string matching: 'cycle' logic is broad.
    const longCycle = countByReason(longTrades, 'cycle');
    const shortCycle = countByReason(shortTrades, 'cycle');
    setEl('stat-long-cycle', longCycle);
    setEl('stat-short-cycle', shortCycle);
    setEl('stat-total-cycle', longCycle + shortCycle);

    // Gain TP1 - Only POSITIVE PnL from TP1 exits
    const sumTP1 = (arr) => arr.filter(t => t.reason && (t.reason.includes('TP1') || t.reason.includes('tp1'))).reduce((s, t) => s + (t.pnl || 0), 0);
    const longGainTP1 = sumTP1(longTrades);
    const shortGainTP1 = sumTP1(shortTrades);
    setEl('stat-long-gain-tp1', '$' + longGainTP1.toFixed(0));
    setEl('stat-short-gain-tp1', '$' + shortGainTP1.toFixed(0));
    setEl('stat-total-gain-tp1', '$' + (longGainTP1 + shortGainTP1).toFixed(0));

    // Gain TP2 - Only POSITIVE PnL from TP2 exits
    const sumTP2 = (arr) => arr.filter(t => t.reason && (t.reason.includes('TP2') || t.reason.includes('tp2'))).reduce((s, t) => s + (t.pnl || 0), 0);
    const longGainTP2 = sumTP2(longTrades);
    const shortGainTP2 = sumTP2(shortTrades);
    setEl('stat-long-gain-tp2', '$' + longGainTP2.toFixed(0));
    setEl('stat-short-gain-tp2', '$' + shortGainTP2.toFixed(0));
    setEl('stat-total-gain-tp2', '$' + (longGainTP2 + shortGainTP2).toFixed(0));

    // Loss SL - Negative PnL from SL/Stop exits
    const sumLossSL = (arr) => arr.filter(t => t.pnl < 0 && t.reason && (t.reason.includes('SL') || t.reason.includes('sl') || t.reason.includes('stop'))).reduce((s, t) => s + (t.pnl || 0), 0);
    const longLossSL = sumLossSL(longTrades);
    const shortLossSL = sumLossSL(shortTrades);
    setEl('stat-long-loss-sl', '$' + longLossSL.toFixed(0));
    setEl('stat-short-loss-sl', '$' + shortLossSL.toFixed(0));
    setEl('stat-total-loss-sl', '$' + (longLossSL + shortLossSL).toFixed(0));

    // Loss Cycle - Negative PnL from Cycle exits (or anything not SL)
    // We can just subtract SL loss from Total Loss to be precise and cover all cases
    // Total Loss calculation:
    const longTotalLoss = longTrades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0);
    const shortTotalLoss = shortTrades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0);

    const longLossCycle = longTotalLoss - longLossSL;
    const shortLossCycle = shortTotalLoss - shortLossSL;

    setEl('stat-long-loss-cycle', '$' + longLossCycle.toFixed(0));
    setEl('stat-short-loss-cycle', '$' + shortLossCycle.toFixed(0));
    setEl('stat-total-loss-cycle', '$' + (longLossCycle + shortLossCycle).toFixed(0));

    // Gain Cycle - Positive PnL from Cycle exits (cycle_update, cycle_end, etc.)
    const sumCycleGain = (arr) => arr.filter(t => t.reason && t.reason.includes('cycle') && t.pnl > 0).reduce((s, t) => s + (t.pnl || 0), 0);
    const longGainCycle = sumCycleGain(longTrades);
    const shortGainCycle = sumCycleGain(shortTrades);
    setEl('stat-long-gain-cycle', '$' + longGainCycle.toFixed(0));
    setEl('stat-short-gain-cycle', '$' + shortGainCycle.toFixed(0));
    setEl('stat-total-gain-cycle', '$' + (longGainCycle + shortGainCycle).toFixed(0));

    // Total Gain (all positive PnL trades)
    const longGain = longTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const shortGain = shortTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    setEl('stat-long-total-gain', '$' + longGain.toFixed(0));
    setEl('stat-short-total-gain', '$' + shortGain.toFixed(0));
    setEl('stat-total-total-gain', '$' + (longGain + shortGain).toFixed(0));

    // Net PnL (should match header)
    const netLongPnL = longTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const netShortPnL = shortTrades.reduce((s, t) => s + (t.pnl || 0), 0);
    const netPnLEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = (val >= 0 ? '+' : '') + '$' + val.toFixed(0);
            el.style.color = val >= 0 ? '#10b981' : '#ef4444';
            el.style.fontWeight = '700';
        }
    };
    netPnLEl('stat-long-net-pnl', netLongPnL);
    netPnLEl('stat-short-net-pnl', netShortPnL);
    netPnLEl('stat-total-net-pnl', netLongPnL + netShortPnL);
}

// Helper function to filter trades based on current filter settings
function filterTrades(trades) {
    let filtered = trades.slice();

    // Filter by type
    if (tradeFilterType !== 'all') {
        filtered = filtered.filter(t => t.type === tradeFilterType);
    }

    // Filter by exit reason
    if (tradeFilterExit !== 'all') {
        filtered = filtered.filter(t => {
            const reason = (t.reason || '').toLowerCase();
            if (tradeFilterExit === 'tp1') return reason.includes('tp1');
            if (tradeFilterExit === 'tp2') return reason.includes('tp2');
            if (tradeFilterExit === 'sl') return reason.includes('sl') || reason.includes('stop');
            if (tradeFilterExit === 'be') return reason.includes('break_even');
            if (tradeFilterExit === 'cycle') return reason.includes('cycle');
            return true;
        });
    }

    // Filter by result (win/loss)
    if (tradeFilterResult !== 'all') {
        filtered = filtered.filter(t => {
            if (tradeFilterResult === 'win') return (t.pnl || 0) > 0;
            if (tradeFilterResult === 'loss') return (t.pnl || 0) < 0;
            return true;
        });
    }

    return filtered;
}

function updateTradesHistoryTable(trades) {
    const tbody = document.getElementById('trades-history-body');
    const timeframeEl = document.getElementById('trades-timeframe');

    if (!tbody) return;

    // Update timeframe display
    if (timeframeEl) {
        const activeBtn = document.querySelector('.tf-btn.active');
        timeframeEl.textContent = activeBtn ? activeBtn.dataset.timeframe : '1m';
    }

    if (!trades || trades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="no-trades">No trades yet</td></tr>';
        return;
    }

    // First pass: assign trade IDs to each operation
    const tradeIdToDisplayId = {};
    let displayIdCounter = 1;

    const sortedForIds = trades.slice().sort((a, b) => a.entryIndex - b.entryIndex);
    sortedForIds.forEach(t => {
        const key = t.tradeId !== undefined && t.tradeId !== null
            ? `id_${t.tradeId}`
            : `entry_${t.entryIndex}_${t.type}`;
        if (!tradeIdToDisplayId[key]) {
            tradeIdToDisplayId[key] = displayIdCounter++;
        }
    });

    // Apply filters
    let filteredTrades = trades.slice();

    // Filter by type
    if (tradeFilterType !== 'all') {
        filteredTrades = filteredTrades.filter(t => t.type === tradeFilterType);
    }

    // Filter by exit reason
    if (tradeFilterExit !== 'all') {
        filteredTrades = filteredTrades.filter(t => {
            const reason = (t.reason || '').toLowerCase();
            if (tradeFilterExit === 'tp1') return reason.includes('tp1');
            if (tradeFilterExit === 'tp2') return reason.includes('tp2');
            if (tradeFilterExit === 'sl') return reason.includes('sl') || reason.includes('stop');
            if (tradeFilterExit === 'be') return reason.includes('break_even');
            if (tradeFilterExit === 'cycle') return reason.includes('cycle');
            return true;
        });
    }

    // Filter by result (win/loss)
    if (tradeFilterResult !== 'all') {
        filteredTrades = filteredTrades.filter(t => {
            if (tradeFilterResult === 'win') return (t.pnl || 0) > 0;
            if (tradeFilterResult === 'loss') return (t.pnl || 0) < 0;
            return true;
        });
    }

    // Apply sorting
    filteredTrades.sort((a, b) => {
        let valA, valB;
        switch (tradeSortColumn) {
            case 'id':
                const keyA = a.tradeId !== undefined ? `id_${a.tradeId}` : `entry_${a.entryIndex}_${a.type}`;
                const keyB = b.tradeId !== undefined ? `id_${b.tradeId}` : `entry_${b.entryIndex}_${b.type}`;
                valA = tradeIdToDisplayId[keyA] || 0;
                valB = tradeIdToDisplayId[keyB] || 0;
                break;
            case 'time':
                valA = a.entryIndex || 0;
                valB = b.entryIndex || 0;
                break;
            case 'cycle':
                valA = a.cycleAmplitude || 0;
                valB = b.cycleAmplitude || 0;
                break;
            case 'lagopen':
                // Lag Open = realCycleEndIndex - entryIndex (bars from entry to real cycle end)
                valA = (a.realCycleEndIndex || a.entryIndex || 0) - (a.entryIndex || 0);
                valB = (b.realCycleEndIndex || b.entryIndex || 0) - (b.entryIndex || 0);
                break;
            case 'lag':
                valA = (a.exitIndex || 0) - (a.entryIndex || 0);
                valB = (b.exitIndex || 0) - (b.entryIndex || 0);
                break;
            case 'fees':
                valA = a.fees || 0;
                valB = b.fees || 0;
                break;
            case 'pnl':
                valA = a.pnl || 0;
                valB = b.pnl || 0;
                break;
            default:
                valA = a.entryIndex || 0;
                valB = b.entryIndex || 0;
        }
        if (tradeSortDirection === 'asc') {
            return valA - valB;
        } else {
            return valB - valA;
        }
    });

    // Build table rows
    const rows = filteredTrades.map(t => {
        const key = t.tradeId !== undefined && t.tradeId !== null
            ? `id_${t.tradeId}`
            : `entry_${t.entryIndex}_${t.type}`;
        const displayId = tradeIdToDisplayId[key] || '-';

        const entryCandle = chart.data[t.entryIndex];
        const entryTime = entryCandle ? formatTradeTime(entryCandle.time) : '-';

        const cyclePct = (t.cycleAmplitude !== undefined && t.cycleAmplitude !== null && !isNaN(t.cycleAmplitude))
            ? t.cycleAmplitude.toFixed(2) + '%'
            : '-';

        // Lag Open: bars from trade entry to when cycle really ended
        // Uses realCycleEndIndex if tracked, otherwise exitIndex as fallback
        let lagOpen = '-';
        const realEndIdx = t.realCycleEndIndex !== undefined ? t.realCycleEndIndex : t.exitIndex;
        if (realEndIdx !== undefined && t.entryIndex !== undefined) {
            lagOpen = (realEndIdx - t.entryIndex).toString();
        }

        // Lag: trade duration (exitIndex - entryIndex)
        let lag = '-';
        if (t.exitIndex !== undefined && t.exitIndex !== null && t.entryIndex !== undefined) {
            lag = (t.exitIndex - t.entryIndex).toString();
        }

        const exitText = formatReason(t.reason) || '-';
        const exitClass = getReasonClass(t.reason || '');

        const fees = t.fees || 0;
        const feesText = fees > 0 ? '-$' + fees.toFixed(2) : '$0.00';

        const pnl = t.pnl || 0;
        const pnlClass = pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
        const pnlText = (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2);

        const typeClass = 'type-' + t.type.toLowerCase();

        return `<tr>
            <td>${displayId}</td>
            <td>${entryTime}</td>
            <td class="${typeClass}">${t.type}</td>
            <td>${t.entryPrice.toFixed(4)}</td>
            <td class="level-val sl">${t.slPrice ? t.slPrice.toFixed(4) : '-'}</td>
            <td class="level-val tp">${t.tp1Price ? t.tp1Price.toFixed(4) : '-'}</td>
            <td class="level-val tp">${t.tp2Price ? t.tp2Price.toFixed(4) : '-'}</td>
            <td>${cyclePct}</td>
            <td>${lagOpen}</td>
            <td>${lag}</td>
            <td>${t.exitPrice ? t.exitPrice.toFixed(4) : '-'}</td>
            <td class="${exitClass}">${exitText}</td>
            <td class="dd-val" style="color: #ef4444;">${t.maxDrawdown ? t.maxDrawdown.toFixed(2) + '%' : '0.00%'}</td>
            <td>${feesText}</td>
            <td class="${pnlClass}">${pnlText}</td>
        </tr>`;
    });

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" class="no-trades">No trades match filters</td></tr>';
    } else {
        tbody.innerHTML = rows.join('');
    }
}

// Setup trade table filter/sort event listeners
function setupTradeTableFilters() {
    // Helper to update chart markers with current filters
    const updateChartMarkers = () => {
        if (cycleBot && chart) {
            const trades = cycleBot.getTrades();
            const filtered = filterTrades(trades);
            chart.setTradeMarkers(filtered);
            chart.setExitMarkers(filtered);
            chart.setTradeLines(filtered);
        }
    };

    // Filter dropdowns
    const filterType = document.getElementById('filter-type');
    const filterExit = document.getElementById('filter-exit');
    const filterResult = document.getElementById('filter-result');

    if (filterType) {
        filterType.addEventListener('change', (e) => {
            tradeFilterType = e.target.value;
            if (cycleBot) updateTradesHistoryTable(cycleBot.getTrades());
            updateChartMarkers();
        });
    }

    if (filterExit) {
        filterExit.addEventListener('change', (e) => {
            tradeFilterExit = e.target.value;
            if (cycleBot) updateTradesHistoryTable(cycleBot.getTrades());
            updateChartMarkers();
        });
    }

    if (filterResult) {
        filterResult.addEventListener('change', (e) => {
            tradeFilterResult = e.target.value;
            if (cycleBot) updateTradesHistoryTable(cycleBot.getTrades());
            updateChartMarkers();
        });
    }

    // Sortable column headers
    const sortableHeaders = document.querySelectorAll('.trades-history-table th.sortable');
    sortableHeaders.forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (tradeSortColumn === column) {
                // Toggle direction
                tradeSortDirection = tradeSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                tradeSortColumn = column;
                tradeSortDirection = 'desc';
            }

            // Update visual indicators
            sortableHeaders.forEach(h => h.classList.remove('asc', 'desc'));
            th.classList.add(tradeSortDirection);

            if (cycleBot) updateTradesHistoryTable(cycleBot.getTrades());
        });
    });
}

function formatTradeTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month} ${hours}:${minutes}`;
}

function getReasonClass(reason) {
    if (!reason) return '';
    if (reason.includes('tp1')) return 'reason-tp1';
    if (reason.includes('tp2')) return 'reason-tp2';
    if (reason.includes('sl') || reason.includes('stop')) return 'reason-sl';
    if (reason.includes('cycle')) return 'reason-cycle';
    return '';
}

function formatReason(reason) {
    if (!reason) return '-';
    if (reason.includes('tp1')) return 'TP1';
    if (reason.includes('tp2')) return 'TP2';
    if (reason.includes('sl_cycle_min')) return 'SL (Min)';
    if (reason.includes('sl_cycle_max')) return 'SL (Max)';
    if (reason.includes('break_even')) return 'BE';
    if (reason.includes('cycle_end')) return 'Cycle';
    if (reason.includes('opposite')) return 'Flip';
    return reason;
}

function drawEquityChart() {
    const canvas = document.getElementById('bot-equity-chart');
    if (!canvas) return;

    // High DPI Setup
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Set actual size in memory (scaled to account for extra pixel density)
    // Only resize if needed to prevent flickering
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
    }

    const ctx = canvas.getContext('2d');

    // Normalize coordinate system to use css pixels
    ctx.resetTransform(); // Reset any previous transform
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const equityCurve = cycleBot.getEquityCurve();

    // Config
    const padding = 10;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    if (equityCurve.length < 2) {
        // Draw starting balance line (dashed)
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#9ca3af';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No trades yet', width / 2, height / 2);
        return;
    }

    // Get balance data including starting
    const balances = [cycleBot.startingBalance, ...equityCurve.map(e => e.balance)];
    const minBal = Math.min(...balances);
    const maxBal = Math.max(...balances);

    // Add 5% padding to range
    const rangePadding = (maxBal - minBal) * 0.1 || 10; // Min range 10
    const yMin = minBal - rangePadding;
    const yMax = maxBal + rangePadding;
    const yRange = yMax - yMin;

    const xStep = plotWidth / (balances.length - 1);

    // Helper to get Y coord
    const getY = (val) => padding + plotHeight - ((val - yMin) / yRange) * plotHeight;

    // Draw reference line at starting balance
    const startY = getY(cycleBot.startingBalance);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding, startY);
    ctx.lineTo(width - padding, startY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Create Path
    ctx.beginPath();
    balances.forEach((bal, i) => {
        const x = padding + i * xStep;
        const y = getY(bal);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });

    // Draw gradient fill
    ctx.save();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)'); // Emerald transparent
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

    // Close path for fill
    ctx.lineTo(padding + (balances.length - 1) * xStep, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    // Draw main line segments
    // Check for Walk-Forward split
    const wfSplitIndex = chart.walkForwardSplitIndex; // e.g., 800

    // Color based on overall PnL
    const isProfitable = balances[balances.length - 1] >= cycleBot.startingBalance;

    for (let i = 0; i < balances.length - 1; i++) {
        const x1 = padding + i * xStep;
        const y1 = getY(balances[i]);
        const x2 = padding + (i + 1) * xStep;
        const y2 = getY(balances[i + 1]);

        // Determine if this segment is in Walk Forward (Test) zone
        // We need to map the equity curve index 'i' back to candle index
        // equityCurve array in bot has {index: candleIndex, balance: ...}
        // But here 'balances' is just an array of numbers.
        // We need to access the source equityCurve from cycleBot to know real times.
        // 'equityCurve' is passed to this function? No, global 'cycleBot.equityCurve' exists.
        // Wait, 'cycleBot.equityCurve' has {index, balance}. 
        // AND 'balances' array created above includes 'startingBalance' at index 0.
        // So balances[i] corresponds to:
        // i=0 -> Start (no trade)
        // i=1 -> cycleBot.equityCurve[0]

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        let isWF = false;
        if (i > 0 && wfSplitIndex && cycleBot.equityCurve[i - 1]) {
            if (cycleBot.equityCurve[i - 1].index >= wfSplitIndex) isWF = true;
        }

        ctx.strokeStyle = isWF ? '#fbbf24' : (isProfitable ? '#10b981' : '#ef4444');
        ctx.stroke();
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;

    // isProfitable already defined above
    ctx.strokeStyle = isProfitable ? '#10b981' : '#ef4444';

    // Add glow effect
    // Add glow effect (only to main color for now or disable matching multi-color)
    // Complex to do multi-color glow efficiently without separate paths. 
    // Simplified: Just skip shadowBlur for multi-color line for clarity, or apply generic.
    // ctx.shadowColor = ... 
    // ctx.stroke(); // Already stroked in loop

    ctx.shadowBlur = 0; // Reset shadow

    // Draw current balance dot
    const lastBal = balances[balances.length - 1];
    const lastX = padding + (balances.length - 1) * xStep;
    const lastY = getY(lastBal);

    // Draw points for trades
    // Optimization: Only draw points if not too many
    if (balances.length < 200) {
        balances.forEach((bal, i) => {
            if (i === 0) return; // Skip start
            const x = padding + i * xStep;
            const y = getY(bal);

            let isWF = false;
            // Check real index
            if (wfSplitIndex && cycleBot.equityCurve[i - 1]) {
                if (cycleBot.equityCurve[i - 1].index >= wfSplitIndex) isWF = true;
            }

            ctx.fillStyle = isWF ? '#fbbf24' : (isProfitable ? '#10b981' : '#ef4444');
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    ctx.fillStyle = isProfitable ? '#10b981' : '#ef4444';
    // Override last point color if WF
    if (wfSplitIndex && cycleBot.equityCurve.length > 0) {
        if (cycleBot.equityCurve[cycleBot.equityCurve.length - 1].index >= wfSplitIndex) {
            ctx.fillStyle = '#fbbf24';
        }
    }

    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Add white center to dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2);
    ctx.fill();
}

// ========== FFT ANALYSIS ==========
function updateFFT(candles) {
    const canvas = document.getElementById('fft-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Use last N candles (power of 2 preferably, or just max reasonable length)
    // For visual speed, let's take last 256 or 512
    const N = Math.min(candles.length, 512); // Limit to 512 for performance
    if (N < 32) return;

    // Extract closes and detrend (simple linear detrend)
    const data = [];
    const startIndex = candles.length - N;

    // Linear regression to find trend
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < N; i++) {
        const x = i;
        const y = candles[startIndex + i].close;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
    }
    const slope = (N * sumXY - sumX * sumY) / (N * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / N;

    // Detrend
    for (let i = 0; i < N; i++) {
        const y = candles[startIndex + i].close;
        const trend = slope * i + intercept;
        data.push(y - trend);
    }

    // Simple DFT (Discrete Fourier Transform)
    // We only care about periods from ~4 to ~100 (cycles of interest)
    const spectrum = [];
    const MAX_PERIOD = N / 2;
    const MIN_PERIOD = 4;

    for (let period = MIN_PERIOD; period <= Math.min(MAX_PERIOD, 150); period++) {
        // Frequency k = N / Period
        // To be precise with DFT frequency bins, k must be integer. 
        // But for "Cycle Scanner", we can test specific periods directly (Correlation / Goertzel-like)
        // Let's stick to standard k integers to be mathematically valid for DFT

        // k from 1 to N/2
        // Period = N / k
        // We want periods ~4 to ~100
        // k range: N/100 to N/4
    }

    // Actually, calculate standard spectrum k=1..N/2
    const amplitudes = [];
    let maxAmp = 0;

    for (let k = 1; k < N / 2; k++) {
        let re = 0;
        let im = 0;
        for (let n = 0; n < N; n++) {
            const angle = (2 * Math.PI * k * n) / N;
            re += data[n] * Math.cos(angle);
            im -= data[n] * Math.sin(angle);
        }
        const amp = Math.sqrt(re * re + im * im);
        const period = N / k;

        if (period >= 4 && period <= 200) {
            amplitudes.push({ period, amp });
            if (amp > maxAmp) maxAmp = amp;
        }
    }

    // Sort by period descending for display (Left = Long cycles, Right = Short cycles?? 
    // Usually FFT is High Freq (Short Period) to Low Freq. 
    // Let's Draw Period on X axis: 0 -> 100+

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background style
    // ctx.fillStyle = '#1e293b';
    // ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (amplitudes.length === 0) return;

    // Draw
    const padding = 30;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;

    ctx.beginPath();
    ctx.fillStyle = '#a855f7'; // Purple fill for bars

    // Find Peaks (Local Maxima)
    const peaks = [];
    for (let i = 1; i < amplitudes.length - 1; i++) {
        const prev = amplitudes[i - 1].amp;
        const curr = amplitudes[i].amp;
        const next = amplitudes[i + 1].amp;

        if (curr > prev && curr > next) {
            peaks.push(amplitudes[i]);
        }
    }

    // Filter peaks: keep only significant ones (e.g. > 30% of max amplitude)
    // and limit to top 8 to avoid clutter
    peaks.sort((a, b) => b.amp - a.amp); // Sort by amp desc
    const topPeaks = peaks.slice(0, 8); // Top 8

    // Sort back by period for display logic if we want them ordered by period on X axis, 
    // BUT user wants distinct bars. 
    // Let's create evenly spaced bars for these specific dominant cycles
    topPeaks.sort((a, b) => a.period - b.period);

    // Clear and Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (topPeaks.length === 0) return;

    // Recalculate maxAmp among top peaks for scaling
    // actually global maxAmp is fine or max of topPeaks
    const displayMaxAmp = topPeaks.reduce((max, p) => Math.max(max, p.amp), 0);

    // const padding = 30; // Already defined
    // const width = canvas.width - padding * 2; // Already defined
    // const height = canvas.height - padding * 2; // Already defined

    // Draw bars evenly spaced
    const barSlotWidth = width / topPeaks.length;
    const barWidth = Math.min(40, barSlotWidth * 0.6); // Max 40px wide or 60% of slot

    ctx.textAlign = 'center';
    ctx.font = '12px Inter';
    ctx.fillStyle = '#94a3b8'; // Label color

    // Find the true dominant (max amp) from the topPeaks set to highlighting
    const maxPeakVal = Math.max(...topPeaks.map(p => p.amp));

    for (let i = 0; i < topPeaks.length; i++) {
        const item = topPeaks[i];
        const isDominant = item.amp === maxPeakVal;

        // Center of slot
        const x = padding + i * barSlotWidth + (barSlotWidth / 2);
        const barHeight = (item.amp / displayMaxAmp) * height;
        const y = padding + height - barHeight;

        // Draw Bar
        // Color based on strength - Purple theme
        // Dominant gets special bright purple and full opacity
        if (isDominant) {
            ctx.fillStyle = '#d8b4fe'; // Bright Purple
            ctx.shadowColor = '#a855f7';
            ctx.shadowBlur = 10;
        } else {
            const opacity = 0.4 + 0.4 * (item.amp / displayMaxAmp);
            ctx.fillStyle = `rgba(168, 85, 247, ${opacity})`; // Purple base
            ctx.shadowBlur = 0;
        }

        ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);
        ctx.shadowBlur = 0; // Reset

        // Label (Period)
        ctx.fillStyle = isDominant ? '#ffffff' : '#cbd5e1';
        ctx.font = isDominant ? 'bold 12px Inter' : '11px Inter';
        ctx.fillText(Math.round(item.period), x, y - 5);

        // Label "DOM" for dominant
        if (isDominant) {
            ctx.fillStyle = '#d8b4fe';
            ctx.font = '9px Inter';
            ctx.fillText('DOM', x, y - 18);
        }
    }

    // Axis Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Cycle Period (Bars)', canvas.width / 2, canvas.height - 5);
}

// ========== OPTIMIZER FUNCTIONALITY ==========
function setupOptimizer() {
    const optimizeBtn = document.getElementById('optimize-btn');
    if (!optimizeBtn) return;
    optimizeBtn.addEventListener('click', () => runOptimization());
}

async function runOptimization() {
    const optimizeBtn = document.getElementById('optimize-btn');
    const originalText = optimizeBtn.innerHTML;
    optimizeBtn.innerHTML = '⏳ Optimizing...';
    optimizeBtn.disabled = true;

    const candles = chart.data;
    if (!candles || candles.length < 100) {
        alert('Not enough data. Load more candles first.');
        optimizeBtn.innerHTML = originalText;
        optimizeBtn.disabled = false;
        return;
    }

    // Calculate momentum values once
    const momentumValues = cycleMomentum ? cycleMomentum.calculate(candles) : [];

    const results = [];

    // Parameter ranges - Reduced by 50% (User req: too slow)
    const minDurs = [6, 7, 8, 10, 12, 13, 14, 16, 18, 20, 22, 25, 28];
    const maxDurs = [20, 24, 26, 28, 32, 36, 38, 40, 44, 48, 52, 56, 60, 70, 80];
    const tp1Pcts = [15, 20];
    const leverages = [10, 20];
    const capitalPcts = [20, 30];
    const threeBarOptions = [true, false];
    const momentumOptions = [false];
    const priorityMinOptions = [true, false];

    await new Promise(r => setTimeout(r, 50));

    let tested = 0;
    const total = minDurs.length * maxDurs.length * tp1Pcts.length * leverages.length *
        capitalPcts.length * threeBarOptions.length * momentumOptions.length * priorityMinOptions.length;

    for (const minDur of minDurs) {
        for (const maxDur of maxDurs) {
            if (maxDur <= minDur) continue;
            for (const tp1Pct of tp1Pcts) {
                for (const leverage of leverages) {
                    for (const capitalPct of capitalPcts) {
                        for (const threeBar of threeBarOptions) {
                            for (const useMom of momentumOptions) {
                                for (const priorityMin of priorityMinOptions) {
                                    tested++;

                                    try {
                                        const detector = new CycleDetector();
                                        const bot = new CycleTradingBot();

                                        bot.updateConfig({
                                            startingBalance: 1000,
                                            leverage: leverage,
                                            capitalPercentage: capitalPct,
                                            feesEnabled: true, // Always test with fees
                                            tp1AvgPercent: tp1Pct,
                                            tp1CloseFraction: 60,
                                            tp2AccountPercent: 1,
                                            threeBarConfirmation: threeBar,
                                            closeOnOpposite: false,
                                            multiTradeEnabled: false,
                                            volFilterEnabled: false,
                                            maxLossEnabled: false,
                                            maTrendFilter: false,
                                            dynamicExitEnabled: false
                                        });

                                        // Full call with all parameters: enableLong=true, enableShort=true, sensitivity=1
                                        bot.simulateLiveTrading(candles, detector, momentumValues, useMom, minDur, maxDur, priorityMin, true, true, 1);

                                        const pnl = bot.currentBalance - 1000;
                                        if (bot.trades.length > 5) { // Need minimum trades
                                            const stats = bot.getStats();
                                            results.push({
                                                minDur, maxDur, tp1Pct, leverage, capitalPct,
                                                threeBar, useMom, priorityMin,
                                                pnl,
                                                pnlPct: (pnl / 1000) * 100,
                                                trades: bot.trades.length,
                                                winRate: stats.winRate || 0
                                            });
                                        }
                                    } catch (e) {
                                        // Skip failed
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    results.sort((a, b) => b.pnl - a.pnl);

    optimizeBtn.innerHTML = originalText;
    optimizeBtn.disabled = false;

    showOptimizationResults(results, tested);
}

function showOptimizationResults(results, tested) {
    const existing = document.getElementById('optimize-modal');
    if (existing) existing.remove();

    const best = results[0];
    const hasProfitable = best && best.pnl > 0;

    // Voice notification using Text-to-Speech
    try {
        const msg = new SpeechSynthesisUtterance();
        msg.text = hasProfitable ? 'Optimization found! Profit detected.' : 'Optimization complete. No profit found.';
        msg.rate = 1.1;
        msg.pitch = hasProfitable ? 1.2 : 0.8;
        msg.volume = 1;
        speechSynthesis.speak(msg);
    } catch (e) { console.log('Speech error:', e); }


    const modal = document.createElement('div');
    modal.id = 'optimize-modal';
    modal.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #334155;
        border-radius: 12px; padding: 24px; z-index: 10000; min-width: 420px; max-width: 500px;
        box-shadow: 0 25px 50px rgba(0,0,0,0.5); color: white; font-family: sans-serif;
    `;

    let html = `
        <h3 style="margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px;">
            🔍 Optimization Results
            <span style="color: #9ca3af; font-size: 12px; font-weight: normal;">(${tested} combinations tested)</span>
            <button onclick="document.getElementById('optimize-modal').remove()" 
                    style="background: none; border: none; color: #9ca3af; font-size: 20px; cursor: pointer; margin-left: auto;">×</button>
        </h3>
    `;

    if (hasProfitable) {
        html += `
            <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <div style="font-weight: bold; color: #10b981; margin-bottom: 12px;">✅ Best Settings Found (With Fees)</div>
                <table style="width: 100%; font-size: 13px; line-height: 1.6;">
                    <tr><td style="color: #9ca3af;">Range:</td><td style="text-align: right; font-weight: bold;">${best.minDur} - ${best.maxDur} bars</td></tr>
                    <tr><td style="color: #9ca3af;">TP1%:</td><td style="text-align: right; font-weight: bold;">${best.tp1Pct}%</td></tr>
                    <tr><td style="color: #9ca3af;">Leverage:</td><td style="text-align: right; font-weight: bold;">${best.leverage}x</td></tr>
                    <tr><td style="color: #9ca3af;">Capital%:</td><td style="text-align: right; font-weight: bold;">${best.capitalPct}%</td></tr>
                    <tr><td style="color: #9ca3af;">3-Bar Conf:</td><td style="text-align: right; font-weight: bold;">${best.threeBar ? '✓ ON' : '✗ OFF'}</td></tr>
                    <tr><td style="color: #9ca3af;">Mom Filter:</td><td style="text-align: right; font-weight: bold;">${best.useMom ? '✓ ON' : '✗ OFF'}</td></tr>
                    <tr><td style="color: #9ca3af;">Force Min:</td><td style="text-align: right; font-weight: bold;">${best.priorityMin ? '✓ ON' : '✗ OFF'}</td></tr>
                </table>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #10b981; font-size: 20px; font-weight: bold;">+$${best.pnl.toFixed(0)} (${best.pnlPct.toFixed(1)}%)</span>
                        <span style="color: #9ca3af; font-size: 12px;">${best.trades} trades | ${best.winRate.toFixed(0)}% WR</span>
                    </div>
                </div>
            </div>
            <button id="apply-optimize-btn" style="
                width: 100%; padding: 14px; background: linear-gradient(135deg, #10b981, #059669);
                border: none; border-radius: 8px; color: white; font-weight: bold; font-size: 15px;
                cursor: pointer;
            ">
                ✨ Apply Best Settings
            </button>
        `;
    } else {
        html += `
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px; padding: 16px;">
                <div style="font-weight: bold; color: #ef4444;">❌ No Profitable Settings Found</div>
                <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">
                    Try a longer timeframe (15m, 1h) where cycle patterns are more reliable.
                </p>
            </div>
        `;
    }

    modal.innerHTML = html;
    document.body.appendChild(modal);

    if (hasProfitable) {
        document.getElementById('apply-optimize-btn').addEventListener('click', () => {
            applyOptimizedSettings(best);
            modal.remove();
        });
    }
}

function applyOptimizedSettings(settings) {
    try {
        // 1. Apply Range Settings
        const customMin = document.getElementById('custom-min');
        const customMax = document.getElementById('custom-max');
        if (customMin) customMin.value = settings.minDur;
        if (customMax) customMax.value = settings.maxDur;

        // 2. Apply Bot Settings (match optimizer exactly)
        const levInput = document.getElementById('bot-leverage');
        const capInput = document.getElementById('bot-capital');
        const tp1Input = document.getElementById('bot-tp1-pct');
        const tp1CloseInput = document.getElementById('bot-tp1-close');

        if (levInput) levInput.value = settings.leverage;
        if (capInput) capInput.value = settings.capitalPct;
        if (tp1Input) tp1Input.value = settings.tp1Pct;
        if (tp1CloseInput) tp1CloseInput.value = 60; // Optimizer uses 60%

        // 3. Apply Toggle Settings (RESET ALL to match optimizer conditions)
        const threeBarEl = document.getElementById('bot-3bar');
        const momFilterEl = document.getElementById('use-momentum-rule');
        const priorityEl = document.getElementById('priority-24-bars');
        const feesEl = document.getElementById('bot-fees');
        const rsiStochEl = document.getElementById('use-rsi-stoch');
        const multiTradeEl = document.getElementById('bot-multi-trade');
        const volFilterEl = document.getElementById('bot-vol-filter');
        const maxLossEl = document.getElementById('bot-max-loss');
        const maTrendEl = document.getElementById('bot-ma-trend');
        const oppCloseEl = document.getElementById('bot-opp-close');
        const dynExitEl = document.getElementById('bot-dyn-exit');
        const precisionEl = document.getElementById('cycle-precision');

        // Set values exactly as optimizer tests
        if (threeBarEl) threeBarEl.checked = settings.threeBar;
        if (momFilterEl) momFilterEl.checked = settings.useMom;
        if (priorityEl) priorityEl.checked = settings.priorityMin;
        if (feesEl) feesEl.checked = true;

        // CRITICAL: Reset these to match optimizer (all disabled during testing)
        if (rsiStochEl) rsiStochEl.checked = false;
        if (multiTradeEl) multiTradeEl.checked = false;
        if (volFilterEl) volFilterEl.checked = false;
        if (maxLossEl) maxLossEl.checked = false;
        if (maTrendEl) maTrendEl.checked = false;
        if (oppCloseEl) oppCloseEl.checked = false;
        if (dynExitEl) dynExitEl.checked = false;
        if (precisionEl) precisionEl.value = '1'; // Default precision

        // CRITICAL: Enable both Index and Inverse cycles (optimizer tests with both)
        const showIndexEl = document.getElementById('show-index-cycles');
        const showInverseEl = document.getElementById('show-inverse-cycles');
        if (showIndexEl) showIndexEl.checked = true;
        if (showInverseEl) showInverseEl.checked = true;

        // 4. Update bot config directly (FULL config to match optimizer)
        cycleBot.updateConfig({
            startingBalance: 1000,
            leverage: settings.leverage,
            capitalPercentage: settings.capitalPct,
            feesEnabled: true,
            tp1AvgPercent: settings.tp1Pct,
            tp1CloseFraction: 60,
            tp2AccountPercent: 1,
            threeBarConfirmation: settings.threeBar,
            closeOnOpposite: false,
            multiTradeEnabled: false,
            volFilterEnabled: false,
            maxLossEnabled: false,
            maTrendFilter: false,
            dynamicExitEnabled: false
        });

        // 5. Trigger recalculation
        if (chart.data && chart.data.length > 0) {
            recalculateIndicatorsAndCycles(chart.data);
        }

        // 6. Show success toast
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; background: #10b981; color: white;
            padding: 12px 20px; border-radius: 8px; font-weight: bold; z-index: 10001;
        `;
        toast.innerHTML = '✅ Settings applied! (All filters reset to optimizer defaults)';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);

    } catch (e) {
        console.error('Error applying settings:', e);
        alert('Error applying settings. Check console for details.');
    }
}

// Initialize optimizer
document.addEventListener('DOMContentLoaded', () => setTimeout(setupOptimizer, 100));

const voiceAnnouncer = {
    enabled: false,
    lastTradesState: new Map(),

    init() {
        const toggle = document.getElementById('voice-enabled');
        if (toggle) {
            this.enabled = toggle.checked;
            toggle.addEventListener('change', () => {
                this.enabled = toggle.checked;
                if (this.enabled) this.speak('Voice notifications enabled');
            });
        }
    },

    speak(text) {
        if (!this.enabled) return;
        const msg = new SpeechSynthesisUtterance(text);
        msg.rate = 1.0;
        window.speechSynthesis.speak(msg);
    },

    process(trades, currentCandleIndex) {
        if (!this.enabled || !trades) return;

        trades.forEach(trade => {
            const id = trade.id;
            const prevState = this.lastTradesState.get(id);

            if (!prevState) {
                if (trade.entryIndex >= currentCandleIndex - 1) {
                    const type = trade.type === 'LONG' ? 'Long' : 'Short';
                    this.speak(`${type} Taken`);
                }
                this.lastTradesState.set(id, {
                    exitReason: trade.reason,
                    closed: trade.exitIndex !== undefined
                });
                return;
            }

            const currentReason = trade.reason || '';
            const previousReason = prevState.exitReason || '';

            if (currentReason !== previousReason) {
                if (currentReason.includes('break_even') && !previousReason.includes('break_even')) {
                    if (trade.exitIndex >= currentCandleIndex - 1) this.speak('Break Even Taken');
                }

                if (currentReason.includes('tp1') && !previousReason.includes('tp1')) {
                    if (trade.exitIndex >= currentCandleIndex - 1) this.speak('TP One Taken');
                }

                if (currentReason.includes('cycle') && !previousReason.includes('cycle')) {
                    if (trade.exitIndex >= currentCandleIndex - 1) this.speak('Cycle Closed');
                }

                prevState.exitReason = currentReason;
                prevState.closed = trade.exitIndex !== undefined;
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => voiceAnnouncer.init());
