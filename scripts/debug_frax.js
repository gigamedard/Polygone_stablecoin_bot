const { ethers } = require("ethers");
const PriceFetcher = require("../engine/priceFetcher");
require("dotenv").config();

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    const priceFetcher = new PriceFetcher(provider, "PRODUCTION");

    const tokens = {
        USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        FRAX: "0x45C32FA6Df82ead1e2eF74D17B76547eDdfAFF42",
        DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
        USDC_NATIVE: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
    };

    const amountIn = ethers.parseUnits("1", 6); // 1 USDC

    const tests = [
        { in: "USDC", out: "FRAX", fee: 100 },
        { in: "USDC", out: "FRAX", fee: 500 },

        { in: "USDC_NATIVE", out: "FRAX", fee: 100 },
        { in: "USDC_NATIVE", out: "FRAX", fee: 500 },
        { in: "USDC_NATIVE", out: "FRAX", fee: 3000 },

        { in: "FRAX", out: "USDT", fee: 100 },
        { in: "USDC", out: "FRAX", fee: 3000 },
        { in: "USDC", out: "FRAX", fee: 10000 }, // 1%

        { in: "DAI", out: "FRAX", fee: 100 },
        { in: "DAI", out: "FRAX", fee: 500 },

        { in: "USDT", out: "FRAX", fee: 100 },
        { in: "USDT", out: "FRAX", fee: 500 },
    ];

    console.log("--- Debugging FRAX Liquidity ---");

    // Enable logging again for this test
    const logger = require("../logger");
    logger.error = (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args);

    for (const test of tests) {
        let amt = amountIn;
        if (test.in === "DAI" || test.in === "FRAX") amt = ethers.parseUnits("1", 18);
        if (test.in === "USDT") amt = ethers.parseUnits("1", 6);

        console.log(`Checking ${test.in} -> ${test.out} (Fee: ${test.fee})...`);
        try {
            const price = await priceFetcher.getPrice(tokens[test.in], tokens[test.out], amt, "UNISWAP_V3", test.fee);
            console.log(`  Result: ${price.toString()}`);
        } catch (e) {
            console.error(`  Exception: ${e.message}`);
        }
    }
}

main().catch(console.error);
