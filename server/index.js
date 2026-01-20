/**
 * Cycle Trading Bot - Server Entry Point
 * Run with: node index.js
 */

import { config, validateConfig } from './config.js';
import * as engine from './tradingEngine.js';

console.log('');
console.log('╔════════════════════════════════════════╗');
console.log('║   🔄 CYCLE TRADING BOT - SERVER MODE   ║');
console.log('╚════════════════════════════════════════╝');
console.log('');

// Validate configuration
if (!validateConfig()) {
    console.error('');
    console.error('Please set BINANCE_API_KEY and BINANCE_API_SECRET in your .env file');
    console.error('or in Railway environment variables.');
    process.exit(1);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down gracefully...');
    engine.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n👋 Received SIGTERM, shutting down...');
    engine.stop();
    process.exit(0);
});

// Start the bot
async function main() {
    try {
        await engine.initialize();
        engine.start();
    } catch (error) {
        console.error('❌ Failed to start bot:', error.message);
        process.exit(1);
    }
}

main();
