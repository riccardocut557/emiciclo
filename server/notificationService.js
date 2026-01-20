import dotenv from 'dotenv';
dotenv.config();

// Email Service REPLACED with silent logger
export const notificationService = {
    /**
     * General Logger
     */
    sendAlert: async (subject, message) => {
        // Log as standard system event
        console.log(`ℹ️ Info: ${subject}`);
        return Promise.resolve();
    },

    /**
     * Trade Entry Logger
     */
    sendEntry: (symbol, type, price, quantity, sl, tp1, tp2) => {
        console.log(`⚡ Trade Executed: ${symbol} ${type} @ $${price}`);
        console.log(`   🎯 Targets: SL $${sl.toFixed(4)} | TP1 $${tp1.toFixed(4)} | TP2 $${tp2.toFixed(4)}`);
        return Promise.resolve();
    },

    /**
     * Trade Exit Logger
     */
    sendExit: (symbol, type, price, reason, pnl) => {
        console.log(`� Trade Closed: ${symbol} ${type} | PnL: $${pnl.toFixed(2)} | Reason: ${reason}`);
        return Promise.resolve();
    },

    /**
     * Error Logger
     */
    sendError: (error) => {
        console.error('⚠️ System Error:', error);
        return Promise.resolve();
    },

    /**
     * Optimization Result Logger
     */
    sendOptimizationUpdate: (min, max, pnl) => {
        console.log(`� Range Optimized: ${min}-${max} (Simulated PnL: ${pnl.toFixed(2)}%)`);
        return Promise.resolve();
    },

    /**
     * Startup Logger
     */
    sendStartupAlert: (balance) => {
        console.log(`� System Online. Starting Balance: $${balance}`);
        return Promise.resolve();
    },

    /**
     * Stub for compatibility
     */
    verifyConnection: async () => {
        return true;
    }
};
