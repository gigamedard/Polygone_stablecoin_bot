const hre = require("hardhat");
const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    console.log("--- DEBUG SCRIPT VERSION 3 ---");
    const [signer] = await hre.ethers.getSigners();
    console.log(`Debugging with account: ${signer.address}`);

    const FLASH_ARBITRAGE_ADDRESS = process.env.FLASH_ARBITRAGE_ADDRESS;
    console.log(`Contract Address: ${FLASH_ARBITRAGE_ADDRESS}`);

    const USDT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
    const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const CURVE_POOL = "0x445FE580eF8d70FF569aB36e80c647af338db351";
    const UNISWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

    const amountIn = hre.ethers.parseUnits("3.0", 6);
    const i = 2; // USDT
    const j = 1; // USDC

    const usdtContract = new hre.ethers.Contract(USDT, ["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"], signer);

    // --- 1. CURVE TEST ---
    console.log("\n--- TEST: Direct Curve Swap ---");
    const curveContract = new ethers.Contract(CURVE_POOL, ["function get_dy_underlying(int128, int128, uint256) view returns (uint256)", "function exchange_underlying(int128, int128, uint256, uint256) returns (uint256)"], signer);

    // View Check
    try {
        const dy = await curveContract.get_dy_underlying(i, j, amountIn);
        console.log(`✅ EST DY: ${hre.ethers.formatUnits(dy, 6)} USDC`);
    } catch (e) {
        console.error("❌ View Failed:", e.message);
    }

    // Force Approve Curve
    console.log("Forcing Approval to Curve Pool...");
    await (await usdtContract.approve(CURVE_POOL, hre.ethers.MaxUint256)).wait();
    console.log("✅ Approved Curve Pool");

    // Direct Swap Curve
    try {
        console.log("Estimating Gas for Curve Swap...");
        const gas = await curveContract.exchange_underlying.estimateGas(i, j, amountIn, 0);
        console.log(`Gas: ${gas}`);
        console.log("✅ Curve Direct Swap Estimate Success");
    } catch (e) {
        console.error("❌ Curve Direct Swap Estimate Failed:", e.message);
        if (e.data) console.error(`Data: ${e.data}`);
    }

    // --- 2. UNISWAP TEST ---
    console.log("\n--- TEST: Direct Uniswap V3 Swap ---");

    // Approve Router
    console.log("Approving Uniswap Router...");
    await (await usdtContract.approve(UNISWAP_ROUTER, hre.ethers.MaxUint256)).wait();
    console.log("✅ Approved Uniswap Router");

    const routerAbi = ["function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"];
    const routerContract = new ethers.Contract(UNISWAP_ROUTER, routerAbi, signer);

    const params = {
        tokenIn: USDT,
        tokenOut: USDC,
        fee: 500, // 0.05%
        recipient: signer.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 10,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
    };

    try {
        console.log(`Attempting Uniswap Swap: 3 USDT -> USDC`);
        const gasUni = await routerContract.exactInputSingle.estimateGas(params);
        console.log(`Uniswap Gas Estimate: ${gasUni}`);
        console.log("✅ Uniswap Swap ESTIMATE SUCCESS");
    } catch (e) {
        console.error("❌ Uniswap Swap Failed:", e.reason || e.message);
        if (e.data) console.error(`Data: ${e.data}`);
    }
}

main().catch(console.error);
