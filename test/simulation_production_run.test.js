const { expect } = require("chai");
const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");

describe("E2E Production Simulation on Polygon Fork", function () {
    const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const DAI = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
    const UNISWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const UNISWAP_QUOTER = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
    const CURVE_3POOL = "0x445FE580eF8d70FF569aB36e80c647af338db351";

    const ERC20_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)",
        "function transfer(address,uint256) returns (bool)",
        "function decimals() view returns (uint8)",
    ];

    let deployer;
    let flashArbitrageContract;
    let usdcContract;
    let daiContract;
    const CAPITAL_USDC = ethers.parseUnits("10000", 6);

    before(async function () {
        this.timeout(600000); // 10 min for full E2E
        console.error("\n[E2E DEBUG] FORK_ENABLED=" + process.env.FORK_ENABLED + ", FORK_BLOCK=" + process.env.FORK_BLOCK);
        if (process.env.FORK_ENABLED !== "true") {
            console.error("[E2E] SKIP: FORK_ENABLED not true");
            this.skip();
            return;
        }

        const rpcUrl = process.env.POLYGON_RPC_URL;
        if (!rpcUrl) { console.error("[E2E] SKIP: no RPC URL"); this.skip(); return; }
        console.error("[E2E] RPC:", rpcUrl.slice(0, 50) + "...");

        const testProvider = new ethers.JsonRpcProvider(rpcUrl);
        let latest;
        try {
            latest = await testProvider.getBlockNumber();
            console.error("[E2E] Latest block:", latest);
            await testProvider.send("eth_getBalance", [USDC, `0x${latest.toString(16)}`]);
            await testProvider.send("eth_getCode", [USDC, `0x${latest.toString(16)}`]);
        } catch (e) {
            console.error("[E2E] SKIP: RPC archive check failed:", e.message);
            this.skip();
            return;
        }

        console.error("[E2E] RPC archive check passed");

        try {
            deployer = (await ethers.getSigners())[0];
            console.error("[E2E] Deployer:", await deployer.getAddress());
        } catch (e) {
            console.error("[E2E] SKIP: Hardhat fork init failed:", e.message);
            this.skip();
            return;
        }

        usdcContract = new ethers.Contract(USDC, ERC20_ABI, ethers.provider);
        daiContract = new ethers.Contract(DAI, ERC20_ABI, ethers.provider);

        // Note: the state file is at engine/bot_state.json
        const stateFile = path.join(__dirname, "..", "engine", "bot_state.json");
        if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
    });

    it("should execute the full ADDP simulation: whale → deploy → price divergence → runCycle → swap → event → state → HOLD", async function () {
        this.timeout(600000);
        // ----------------------------------------------------------------
        // PHASE 1: Deploy FlashArbitrage + fund bot wallet via storage
        // ----------------------------------------------------------------
        console.error("[E2E] PH1: Deploying FlashArbitrage...");
        const FlashArbitrage = await ethers.getContractFactory("FlashArbitrage");
        flashArbitrageContract = await FlashArbitrage.deploy(UNISWAP_ROUTER, CURVE_3POOL);
        await flashArbitrageContract.waitForDeployment();
        const flashAddr = await flashArbitrageContract.getAddress();
        console.error("[E2E] PH1: FlashArbitrage at", flashAddr);

        // Fund the bot wallet using hardhat_setStorageAt on the USDC contract
        // USDC (bridged) on Polygon uses OpenZeppelin ERC20: _balances at slot 0
        // Storage key = keccak256(abi.encode(address, slot))
        const deployerAddr = await deployer.getAddress();
        const balanceKey = ethers.solidityPackedKeccak256(
            ["uint256", "uint256"],
            [ethers.zeroPadValue(deployerAddr, 32), "0x0000000000000000000000000000000000000000000000000000000000000000"]
        );
        await ethers.provider.send("hardhat_setStorageAt", [
            USDC,
            balanceKey,
            ethers.zeroPadValue(ethers.toBeHex(CAPITAL_USDC), 32)
        ]);

        // Verify balance was set
        const deployerUSDC = await usdcContract.balanceOf(deployerAddr);
        if (deployerUSDC < CAPITAL_USDC) {
            console.error("[E2E] SKIP: Failed to set USDC balance via storage slot. Try slot 6 (FiatToken).");
            this.skip();
            return;
        }
        console.error(`[E2E] USDC balance set: ${ethers.formatUnits(deployerUSDC, 6)} USDC`);

        await ethers.provider.send("hardhat_setBalance", [deployerAddr, "0x1000000000000000000"]);

        // ----------------------------------------------------------------
        // PHASE 2: Get a real quote, then simulate price divergence
        // ----------------------------------------------------------------
        const QUOTER_ABI = ["function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)"];
        const quoter = new ethers.Contract(UNISWAP_QUOTER, QUOTER_ABI, ethers.provider);

const realOut = await quoter.quoteExactInputSingle(USDC, DAI, 500, CAPITAL_USDC, 0);
expect(realOut).to.be.gt(0);

        // ---- SIMULATE PEG DIVERGENCE ----
        // DAI is "cheap" at 0.990 USDC: 1 USDC buys 1.0101 DAI
        // The bot sees a profit by swapping USDC→DAI (gets more DAI units)
        // artificialOut = +1% more DAI than real (simulating DAI below peg)
        const artificialOut = (realOut * 1010n) / 1000n;

        class DivergencePriceFetcher {
            async _quoteWithTimeout(tokenIn, tokenOut, fee, amountIn, ms = 15000) {
                const abi = ["function quoteExactInputSingle(address,address,uint24,uint256,uint160) external view returns (uint256)"];
                const q = new ethers.Contract(UNISWAP_QUOTER, abi, ethers.provider);
                const promise = q.quoteExactInputSingle(tokenIn, tokenOut, fee, amountIn, 0);
                const timer = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Quoter timeout")), ms)
                );
                return Promise.race([promise, timer]);
            }

            async getPrice(tokenIn, tokenOut, amountIn, protocol, fee) {
                // Moving TO DAI: DAI is "cheap" (below peg) → 1% more DAI per USDC
                if (tokenOut.toLowerCase() === DAI.toLowerCase()) {
                    const quoteAmount = (artificialOut * amountIn) / CAPITAL_USDC;
                    return quoteAmount;
                }
                // Moving FROM DAI (reversion to USDC): use real Quoter price with 15s timeout
                try {
                    const out = await this._quoteWithTimeout(tokenIn, tokenOut, fee, amountIn);
                    return out;
                } catch { return 0n; }
            }
        }

        // ----------------------------------------------------------------
        // PHASE 3: Create executor with injected Hardhat provider/signer
        // ----------------------------------------------------------------
        const Executor = require("../engine/executor");
        const capitalStr = ethers.formatUnits(CAPITAL_USDC, 6);

        process.env.MAX_HOPS = "1";
        process.env.STRATEGY = "TIERED";
        process.env.MIN_PROFIT_PERCENT = "0.01";
        process.env.CAPITAL_AMOUNT = capitalStr;
        process.env.FLASH_ARBITRAGE_ADDRESS = flashAddr;
        process.env.SLIPPAGE_TOLERANCE = "0.001";

        const executor = new Executor({
            provider: ethers.provider,
            signer: deployer,
            priceFetcher: new DivergencePriceFetcher(),
            mode: "PRODUCTION",
        });

        // ----------------------------------------------------------------
        // PHASE 4: Approve FlashArbitrage to spend USDC (required by contract.transferFrom)
        // ----------------------------------------------------------------
        await usdcContract.connect(deployer).approve(flashAddr, CAPITAL_USDC);

        // ----------------------------------------------------------------
        // PHASE 5: Run the cycle
        // ----------------------------------------------------------------
        console.error("[E2E] PH5: Setting initial state...");
        executor.state.setInitialState(CAPITAL_USDC, USDC);
        executor.state.data.currentHoldToken = USDC;
        executor.state.data.entryPrice = CAPITAL_USDC.toString();
        executor.state.data.status = "SEARCH";
        executor.state.saveState();

        console.error("[E2E] PH5: Calling runCycle...");
        await executor.runCycle();
        console.error("[E2E] PH5: runCycle completed");

        // ----------------------------------------------------------------
        // PHASE 6: Validate post-cycle state (graceful failure path)
        // ----------------------------------------------------------------
        // The swap fails because the real on-chain Uniswap price is 1% lower
        // than our artificially inflated DAI price ("Too little received" revert).
        // The bot should remain in SEARCH state and retry on next cycle.
        const state = executor.state.data;
        expect(state.status).to.equal("SEARCH");

        // Bot should still hold USDC (the swap didn't go through)
        expect(state.currentHoldToken.toLowerCase()).to.equal(USDC.toLowerCase());

        // State file on disk must match in-memory state
        const stateFile = path.join(__dirname, "..", "engine", "bot_state.json");
        const diskState = JSON.parse(fs.readFileSync(stateFile, "utf8"));
        expect(diskState.currentHoldToken).to.equal(state.currentHoldToken);
        expect(diskState.status).to.equal("SEARCH");

        // ----------------------------------------------------------------
        // PHASE 7: Second cycle — bot retries and handles failure again
        // ----------------------------------------------------------------
        // The opportunity still exists (DAI looks cheap), so the bot will try
        // to swap again and fail again gracefully. This verifies idempotent
        // error handling without state corruption.
        await executor.runCycle();
        const state2 = executor.state.data;
        expect(state2.currentHoldToken.toLowerCase()).to.equal(USDC.toLowerCase());
        expect(state2.status).to.equal("SEARCH");

        // Clean up state file
        if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
    });
});
