
const lev = 20;
const tp1Target = 2.0; // 2% move
const endResult_High = 3.0; // Ends higher
const endResult_Low = 1.0; // Ends lower but positive
const endResult_Loss = -1.0; // Ends loss
const maxExcursion = 4.0; // Hit TP1

function calc(tp1ClosePct, endResult) {
    const portion = tp1ClosePct / 100;
    let remainingPos = 1.0 - portion;
    let roi = (tp1Target * lev * portion);

    // Break Even Logic
    roi += Math.max(0, endResult) * lev * remainingPos;
    return roi;
}

console.log("Scenario 1: EndResult (3%) > TP1 (2%)");
console.log("ROI with 80% Close:", calc(80, 3.0).toFixed(2));
console.log("ROI with 20% Close:", calc(20, 3.0).toFixed(2));

console.log("\nScenario 2: EndResult (1%) < TP1 (2%)");
console.log("ROI with 80% Close:", calc(80, 1.0).toFixed(2));
console.log("ROI with 20% Close:", calc(20, 1.0).toFixed(2));

console.log("\nScenario 3: EndResult (-1%) < TP1 (2%) (BE Protection)");
console.log("ROI with 80% Close:", calc(80, -1.0).toFixed(2));
console.log("ROI with 20% Close:", calc(20, -1.0).toFixed(2));
