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

async function runBot() {
    const mode = process.env.MODE || "DEMO";
    console.log("---------------------------------------------------");
    console.log(`🤖 Polygon Arbitrage Bot - Starting in ${mode} Mode`);
    console.log("---------------------------------------------------");

    const executor = new Executor();

    // Loop indefinitely
    while (true) {
        try {
            await executor.runCycle();
        } catch (error) {
            console.error("❌ Cycle Error:", error);
        }

        // Default: 30 seconds delay between scans (to respect RPC limits & save API credits)
        const delayMs = process.env.POLLING_INTERVAL ? parseInt(process.env.POLLING_INTERVAL) : 30000;

        console.log(`Waiting ${delayMs / 1000}s before next scan...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        console.log("---------------------------------------------------");
    }
}

// Handle unexpected errors
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

runBot();
