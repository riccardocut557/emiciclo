const fs = require('fs');

// Mock data
const closes = Array.from({ length: 200 }, (_, i) => Math.sin(i * 0.1) * 100 + 1000);

// PASTE THE CAPTURED CLASS HERE
class CycleSwingMomentum {
    constructor() {
        this.cycs = 50;
        this.lbR = 5;
        this.lbL = 5;
        this.rangeUpper = 60;
        this.rangeLower = 5;
    }

    Cycle1(i, waveThrottle, cycs) {
        let ret = 6.0 * waveThrottle + 1.0;
        if (i === 0) ret = 1.0 + waveThrottle;
        else if (i === 1) ret = 1.0 + waveThrottle * 5.0;
        else if (i === cycs - 1) ret = 1.0 + waveThrottle;
        else if (i === cycs - 2) ret = 1.0 + waveThrottle * 5.0;
        return ret;
    }

    Cycle2(i, waveThrottle, cycs) {
        let ret = -4.0 * waveThrottle;
        if (i === 0) ret = -2.0 * waveThrottle;
        else if (i === cycs - 1) ret = 0.0;
        else if (i === cycs - 2) ret = -2.0 * waveThrottle;
        return ret;
    }

    Cycle3(i, waveThrottle, cycs) {
        let ret = waveThrottle;
        if (i === cycs - 1) ret = 0.0;
        else if (i === cycs - 2) ret = 0.0;
        return ret;
    }

    iWTT_CSI_processor(CycleCount, closes) {
        const results = [];
        const cycs = this.cycs;
        const waveThrottle = 160 * CycleCount;

        for (let k = 0; k < closes.length; k++) {
            if (k < cycs - 1) {
                results.push(0);
                continue;
            }

            let wtt1 = 0.0;
            let wtt2 = 0.0;
            let wtt3 = 0.0;
            let wtt4 = 0.0;
            let wtt5 = 0.0;
            let _wtt1 = 0.0;
            let _wtt2 = 0.0;
            let _wtt3 = 0.0;
            let _wtt4 = 0.0;
            let _wtt5 = 0.0;
            let momentum = 0.0;
            let acceleration = 0.0;
            let swing = 0.0;
            let currentVal = 0.0;

            for (let i = 0; i < cycs; i++) {
                swing = this.Cycle1(i, waveThrottle, cycs) - wtt4 * wtt1 - _wtt5 * _wtt2;
                if (swing === 0) break;

                momentum = this.Cycle2(i, waveThrottle, cycs);
                _wtt1 = wtt1;
                wtt1 = (momentum - wtt4 * wtt2) / swing;

                acceleration = this.Cycle3(i, waveThrottle, cycs);
                _wtt2 = wtt2;
                wtt2 = acceleration / swing;

                const lookbackIndex = (cycs - 1) - i;
                const valToUse = closes[k - lookbackIndex];

                if (valToUse === undefined) {
                    currentVal = 0;
                    break;
                }

                currentVal = (valToUse - _wtt3 * _wtt5 - wtt3 * wtt4) / swing;
                _wtt3 = wtt3;
                wtt3 = currentVal;
                wtt4 = momentum - wtt5 * _wtt1;
                _wtt5 = wtt5;
                wtt5 = acceleration;
            }
            results.push(currentVal);
        }
        return results;
    }

    calculate(closes) {
        console.log(`[CycleSwingMomentum DEBUG] Calculating with cycs=${this.cycs}`);
        const thrust1 = this.iWTT_CSI_processor(1, closes);
        const thrust2 = this.iWTT_CSI_processor(10, closes);

        const csiBuffer = [];
        for (let i = 0; i < closes.length; i++) {
            csiBuffer.push(thrust1[i] - thrust2[i]);
        }
        return csiBuffer;
    }
}

// Test Execution
const detector = new CycleSwingMomentum();

// Run with cycs = 50
detector.cycs = 50;
const results50 = detector.calculate(closes);

// Run with cycs = 20
detector.cycs = 20;
const results20 = detector.calculate(closes);

// Compare
let diffCount = 0;
let maxDiff = 0;
// Compare range where both have data (from index 50 onwards)
for (let i = 50; i < 200; i++) {
    const diff = Math.abs(results50[i] - results20[i]);
    if (diff > 0.0001) diffCount++;
    if (diff > maxDiff) maxDiff = diff;
}

console.log(`Difference Count: ${diffCount}`);
console.log(`Max Difference: ${maxDiff}`);

if (diffCount === 0) {
    console.log("FAIL: Results are identical!");
} else {
    console.log("SUCCESS: Results differ as expected.");
    console.log(`Sample 50 @150: ${results50[150]}`);
    console.log(`Sample 20 @150: ${results20[150]}`);
}
