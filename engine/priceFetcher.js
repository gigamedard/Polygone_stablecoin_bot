const { ethers } = require("ethers");
require("dotenv").config();

class PriceFetcher {
    constructor(provider, mode = "PRODUCTION") {
        this.provider = provider;
        this.mode = mode;
        // Addresses
        this.uniswapQuoterAddress = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"; // Polygon V3 Quoter
        this.curveRegistryAddress = "0x0000000022D53366457F9d5E68Ec105046FC4383"; // Polygon Address Provider or similar

        // In a real optimized bot, we would query the pools directly via Multicall
        // For this architecture, we will simulate fetching or use simple calls
    }

    async getPrice(tokenIn, tokenOut, amountIn, protocol, fee = 3000) {
        if (this.mode === "BACKTEST") {
            return this.getMockPrice(tokenIn, tokenOut, amountIn);
        }

        try {
            if (protocol === "UNISWAP_V3") {
                return await this.getUniswapPrice(tokenIn, tokenOut, amountIn, fee);
            } else if (protocol === "CURVE") {
                return await this.getCurvePrice(tokenIn, tokenOut, amountIn);
            }
        } catch (e) {
            console.error(`Error fetching price for ${protocol}:`, e.message);
            return 0n;
        }
        return 0n;
    }

    // --- Uniswap V3 Implementation ---
    async getUniswapPrice(tokenIn, tokenOut, amountIn, fee) {
        if (this.mode === "BACKTEST") {
            // Basic mock for backtest if needed, or rely on getMockPrice at higher level
            return this.getMockPrice(tokenIn, tokenOut, amountIn);
        }

        // Minimal Interface for Quoter (Polygon)
        // quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)
        // Note: Some Quoter versions use struct params or return logic differences.
        // Polygon Quoter V1 (0xb273...) uses the signature below.

        const abi = [
            "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)"
        ];

        try {
            // Ensure Checksummed Addresses
            const checksumIn = ethers.getAddress(tokenIn);
            const checksumOut = ethers.getAddress(tokenOut);

            const quoter = new ethers.Contract(this.uniswapQuoterAddress, abi, this.provider);

            // Using staticCall to simulate the transaction and get return value
            const amountOut = await quoter.quoteExactInputSingle(
                checksumIn,
                checksumOut,
                fee,
                amountIn,
                0 // sqrtPriceLimitX96 (0 = no limit)
            );
            return amountOut;
        } catch (e) {
            // console.error(`[Uniswap] Fetch Error: ${e.message}`); // Too noisy
            return 0n;
        }
    }

    // --- Curve Implementation ---
    async getCurvePrice(tokenIn, tokenOut, amountIn) {
        if (this.mode === "BACKTEST") {
            return this.getMockPrice(tokenIn, tokenOut, amountIn);
        }

        // Curve Aave Pool (am3CRV) on Polygon
        // Coins: DAI (0), USDC (1), USDT (2)
        const poolAddress = "0x445FE580eF8d70FF569aB36e80c647af338db351";
        const abi = [
            "function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256)"
        ];

        // Mapping (Polygon Aave Pool)
        const tokenIndex = {
            "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063": 0, // DAI
            "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174": 1, // USDC
            "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": 2  // USDT
        };

        const i = tokenIndex[ethers.getAddress(tokenIn)];
        const j = tokenIndex[ethers.getAddress(tokenOut)];

        if (i === undefined || j === undefined) {
            console.warn("[Curve] Unsupported pair");
            return 0n;
        }

        try {
            const pool = new ethers.Contract(poolAddress, abi, this.provider);
            const amountOut = await pool.get_dy(i, j, amountIn);
            return amountOut;
        } catch (e) {
            console.error(`[Curve] Fetch Error: ${e.message}`);
            return 0n;
        }
    }

    // --- Mocking for Backtest ---
    getMockPrice(tokenIn, tokenOut, amountIn) {
        // Simulate a random price with slight variance to roughly 1:1 for stablecoins
        // 1 USDC = 10^6, 1 DAI = 10^18. Normalization needed.
        // For simplicity, assuming simplified "1.00" style math or returning BigInt raw

        // Random fluctuation between 0.999 and 1.001
        const variance = (Math.random() * 0.002) + 0.999;

        // Need decimals.... simplistic mock
        // Assuming Input is BigInt, we just multiply by variance (scaled)
        // This is VERY rough.
        const output = BigInt(Math.floor(Number(amountIn) * variance));
        return output;
    }
}

module.exports = PriceFetcher;
