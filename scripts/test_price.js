const { ethers } = require("ethers");
const PriceFetcher = require("../engine/priceFetcher");
require("dotenv").config();

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    const priceFetcher = new PriceFetcher(provider, "PRODUCTION");

    const tokens = {
        USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
        MAI: "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1",
        FRAX: "0x45C32FA6Df82ead1e2eF74D17B76547eDdfAFF42" // Correct checksum
    };

    const pairs = [
        { in: "USDC", out: "USDT", fee: 100 }, // 0.01%
        { in: "USDC", out: "USDT", fee: 500 }, // 0.05%
        { in: "USDC", out: "DAI", fee: 500 }, // 0.05%
        { in: "USDC", out: "MAI", fee: 3000 },
        { in: "USDC", out: "FRAX", fee: 3000 },
        { in: "USDC", out: "FRAX", fee: 500 }
    ];

    const amountIn = ethers.parseUnits("1", 6); // 1 USDC

    console.log("--- Testing Price Fetcher ---");
    for (const pair of pairs) {
        const tokenIn = tokens[pair.in];
        const tokenOut = tokens[pair.out];
        console.log(`Checking ${pair.in} -> ${pair.out} (Fee: ${pair.fee})...`);

        try {
            const price = await priceFetcher.getPrice(tokenIn, tokenOut, amountIn, "UNISWAP_V3", pair.fee || 3000);
            console.log(`  Result: ${price.toString()}`);
            if (price === 0n) {
                console.log("  ❌ Zero Price Returned (Check logs for error details)");
            } else {
                console.log("  ✅ Price Fetched Successfully");
            }
        } catch (e) {
            console.error(`  ⚠️ Unexpected Error: ${e.message}`);
        }
    }
}

main().catch(console.error);
