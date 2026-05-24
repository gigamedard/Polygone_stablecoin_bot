/*
 * Polygon Stablecoin Arbitrage Bot - Main Entry Point
 * 
 * Usage:
 *   node index.js
 * 
 * Configuration:
 *   Set MODE=DEMO or MODE=PRODUCTION in .env
 */

require("dotenv").config();
const Executor = require("./engine/executor");
const logger = require("./logger");


async function runBot() {
    const mode = process.env.MODE || "DEMO";
    logger.info("---------------------------------------------------");
    logger.info(`🤖 Polygon Arbitrage Bot - Starting in ${mode} Mode`);
    logger.info("---------------------------------------------------");

    // Also show startup on console so user knows it's running
    console.log(`🤖 Bot Running in ${mode} Mode. Watching for opportunities... (See logs.md for details)`);

    const executor = new Executor();

    // Loop indefinitely
    while (true) {
        try {
            await executor.runCycle();
        } catch (error) {
            logger.error("❌ Cycle Error:", error);
        }

        // Default: 30 seconds delay between scans (to respect RPC limits & save API credits)
        const delayMs = process.env.POLLING_INTERVAL ? parseInt(process.env.POLLING_INTERVAL) : 30000;

        logger.info(`Waiting ${delayMs / 1000}s before next scan...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        logger.info("---------------------------------------------------");
    }
}

// Handle unexpected errors
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

runBot();
