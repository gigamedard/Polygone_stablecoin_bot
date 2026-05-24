const { ethers } = require("ethers");
const PriceFetcher = require("../engine/priceFetcher");
require("dotenv").config();

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    const priceFetcher = new PriceFetcher(provider, "PRODUCTION");

    const tokens = {
        MAI: "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1",
        USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        FRAX: "0x45C32FA6Df82ead1e2eF74D17B76547eDdfAFF42",
        DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063"
    };

    // 1 unit of each token (approx)
    const amounts = {
        MAI: ethers.parseUnits("1", 18),
        USDT: ethers.parseUnits("1", 6),
        USDC: ethers.parseUnits("1", 6),
        FRAX: ethers.parseUnits("1", 18),
        DAI: ethers.parseUnits("1", 18)
    };

    const tests = [
        // MAI Pairs
        { in: "MAI", out: "USDT", fee: 100 },
        { in: "MAI", out: "USDT", fee: 500 },
        { in: "MAI", out: "USDT", fee: 3000 },

        { in: "MAI", out: "USDC", fee: 100 },
        { in: "MAI", out: "USDC", fee: 500 },

        // USDC Pairs (Major)
        { in: "USDC", out: "USDT", fee: 100 },
        { in: "USDC", out: "USDT", fee: 500 },
        { in: "USDC", out: "USDT", fee: 3000 },

        // USDT Pairs
        { in: "USDT", out: "DAI", fee: 100 },
        { in: "USDT", out: "DAI", fee: 500 },

        // FRAX Pairs
        { in: "FRAX", out: "USDC", fee: 100 },
        { in: "FRAX", out: "USDC", fee: 500 },
    ];

    console.log("--- Debugging Liquidity ---");

    // Monkey patch logger
    const logger = require("../logger");
    logger.error = (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args);

    for (const test of tests) {
        console.log(`Checking ${test.in} -> ${test.out} (Fee: ${test.fee})...`);
        try {
            const amountIn = amounts[test.in];
            const price = await priceFetcher.getPrice(tokens[test.in], tokens[test.out], amountIn, "UNISWAP_V3", test.fee);
            console.log(`  Result: ${price.toString()}`);
        } catch (e) {
            console.error(`  Exception: ${e.message}`);
        }
    }
}

main().catch(console.error);
