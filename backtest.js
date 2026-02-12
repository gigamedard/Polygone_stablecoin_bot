const Executor = require("./engine/executor");
const { ethers } = require("ethers");
require("dotenv").config();

async function runBacktest(iterations = 20) {
    console.log(`Starting Backtest with ${iterations} iterations...`);
    console.log("---------------------------------------------------");

    // Override env just in case, though Executor defaults to BACKTEST
    process.env.MODE = "BACKTEST";

    const executor = new Executor();
    let totalProfit = 0n;
    let winningTrades = 0;

    // Valid stats storage
    const history = [];

    for (let i = 0; i < iterations; i++) {
        // Mocking time passing or different market conditions could be done here
        // The mock price fetcher uses random variance, so each run is different.

        // Capture console logs or instrument Executor to return results?
        // For simplicity, let's just run it and trust the mock. 
        // Ideally Executor should return the result of the cycle.
        // We'll modify Executor to facilitate this, but for now we rely on logs 
        // or just let it run.

        await executor.runCycle();

        // Sleep slightly to not spam logs too fast
        await new Promise(r => setTimeout(r, 100));
    }

    console.log("---------------------------------------------------");
    console.log("Backtest Complete.");
}

runBacktest();
