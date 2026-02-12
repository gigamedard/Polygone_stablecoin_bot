const Executor = require("./engine/executor");
const { ethers } = require("ethers");
require("dotenv").config();

// Override Mode to DEMO to ensure Real Price Fetching
process.env.MODE = "DEMO";

async function runAnalysis() {
    console.log("Starting Market Analysis (Real Prices via Polygon RPC)...");
    console.log("Using RPC:", process.env.POLYGON_RPC_URL || "Default Public RPC");
    console.log("Press CTRL+C to stop.");
    console.log("---------------------------------------------------");

    const executor = new Executor();

    // Loop
    while (true) {
        try {
            await executor.runCycle();
        } catch (error) {
            console.error("Cycle Error:", error);
        }

        console.log("Waiting 30s before next scan...");
        await new Promise(resolve => setTimeout(resolve, 30000));
        console.log("---------------------------------------------------");
    }
}

runAnalysis();
