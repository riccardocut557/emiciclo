
import { getKlines } from './binanceClient.js';
import * as engine from './tradingEngine.js';
import { config } from './config.js';

async function verify() {
    console.log('🔍 VERIFICATION MODE: Fetching last 1000 candles...');

    // 1. Fetch data (Real Binance Data)
    const candles = await getKlines(config.symbol, config.timeframe, 1500);
    console.log(`✅ Loaded ${candles.length} candles for ${config.symbol} ${config.timeframe}`);

    // 2. Run Optimization (Same logic as live bot)
    console.log('🔄 Running Optimization (this mimics the frontend Heatmap logic)...');

    // We import the engine but we need to verify the internal optimizeRange function.
    // Since optimizeRange isn't exported directly, we can use a trick or just copy the call if we can't access it.
    // Wait, tradingEngine exports `optimizeRange`?
    // Let's check tradingEngine.js exports...
    // It exports `initialize`, `tick`, `start`, `stop`. 
    // It DOES NOT export `optimizeRange`.

    // SOLUTION: We will temporarily modify tradingEngine to export `optimizeRange` OR
    // we will rely on `initialize` which calls `optimizeRange` if we set up a mock state.
    // Actually, `initialize` calls `optimizeRange` on startup!

    console.log('🚀 Initializing Engine to trigger Optimization...');
    await engine.initialize();

    console.log('\n✅ VERIFICATION COMPLETE');
    console.log('Compare the "Best Range" and "PnL" above with your Frontend Heatmap.');
}

verify();
