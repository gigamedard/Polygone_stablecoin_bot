const { expect } = require("chai");
const { ethers } = require("ethers");

describe("Executor - Swap Data Construction", function () {
    let Executor;
    const logger = require("../logger");

    before(function () {
        process.env.MODE = process.env.MODE || "BACKTEST";
        process.env.POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || "http://127.0.0.1:8545";
        process.env.PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

        Executor = require("../engine/executor");
    });

    describe("RED: requirements that fail with current code", function () {
        it("should have _calculateMinAmountOut method (method missing in current code)", function () {
            const executor = new Executor();
            // This will FAIL now (undefined) → PASS after implementation
            expect(executor._calculateMinAmountOut).to.be.a("function");
        });

        it("should pass minAmountOut > 0 to contract call (currently 0)", function () {
            process.env.MODE = "DEMO";
            process.env.SLIPPAGE_TOLERANCE = "0.001";
            const executor = new Executor();

            const tokenIn = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
            const tokenOut = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
            const path = [{ token: tokenOut, protocol: "UNISWAP_V3", fee: 500 }];
            const amountIn = ethers.parseUnits("1000", 6);
            const expectedOut = ethers.parseUnits("998.5", 18);

            // After implementation, the DEMO log should include the minAmountOut value
            // Currently it only logs the steps JSON, not the minAmountOut
            // We need to verify this in the captured log
            const originalTransaction = logger.transaction;
            let capturedLog = "";
            logger.transaction = (msg) => { capturedLog += msg + "\n"; };

            executor.executeSwap(tokenIn, path, amountIn, expectedOut);

            logger.transaction = originalTransaction;

            // With current code: capturedLog contains "[DEMO] Transaction Constructed" but no "minAmountOut"
            // After implementation: the log should be enhanced to show the minAmountOut
            expect(capturedLog).to.contain("minAmountOut");
        });
    });

    describe("Slippage formula (reference for implementation)", function () {
        it("minAmountOut = expectedOut * (10000 - slippageBps) / 10000 for 18-dec output", function () {
            const expectedOut = ethers.parseUnits("998.5", 18);
            const slippageBps = 5;
            const minAmountOut = (expectedOut * (10000n - BigInt(slippageBps))) / 10000n;
            expect(minAmountOut).to.equal(998000750000000000000n);
        });

        it("minAmountOut = expectedOut * (10000 - slippageBps) / 10000 for 6-dec output", function () {
            const expectedOut = ethers.parseUnits("4997.5", 6);
            const slippageBps = 10;
            const minAmountOut = (expectedOut * (10000n - BigInt(slippageBps))) / 10000n;
            expect(minAmountOut).to.equal(4992502500n);
        });
    });

    describe("TIERED strategy — pure BigInt scoring", function () {
        it("RED: _calculateRiskPenalty method does not exist on executor", function () {
            const executor = new Executor();
            // This will FAIL (undefined) → PASS after implementation
            expect(executor._calculateRiskPenalty).to.be.a("function");
        });

        it("RED: _calculateMinScoreThreshold method does not exist on executor", function () {
            const executor = new Executor();
            expect(executor._calculateMinScoreThreshold).to.be.a("function");
        });

        describe("BigInt risk penalty formula (reference)", function () {
            it("should compute penalty = finalNorm * tierDiff * 30 / 10000", function () {
                const finalNorm = ethers.parseUnits("5000000", 18);
                const tierDiff = 2;
                const penalty = (finalNorm * BigInt(tierDiff * 30)) / 10000n;
                expect(penalty).to.equal(ethers.parseUnits("30000", 18));
            });

            it("should truncate (not round) tiny penalties to 0", function () {
                const finalNorm = 1n;
                const tierDiff = 1;
                const penalty = (finalNorm * BigInt(tierDiff * 30)) / 10000n;
                expect(penalty).to.equal(0n);
            });

            it("should handle 1-tier jump (0.3%) exactly for 100M units", function () {
                const finalNorm = ethers.parseUnits("100000000", 18);
                const tierDiff = 1;
                const penalty = (finalNorm * BigInt(tierDiff * 30)) / 10000n;
                // 100M * 0.003 = 300,000
                expect(penalty).to.equal(ethers.parseUnits("300000", 18));
            });

            it("should handle 2-tier jump (0.6%) for 10M units with exact BigInt", function () {
                // Float Math.floor(Number(10^6 * 1e18) * 0.006) loses precision
                // because Number(10^24) exceeds 2^53
                const finalNorm = ethers.parseUnits("10000000", 18);
                const tierDiff = 2;
                const penalty = (finalNorm * BigInt(tierDiff * 30)) / 10000n;
                expect(penalty).to.equal(ethers.parseUnits("60000", 18));
            });
        });
    });

    describe("Multi-hop pathfinding", function () {
        const ArbitrageGraph = require("../engine/arbitrageGraph");
        const { graph: refGraph, tokens: refTokens } = ArbitrageGraph.createStablecoinGraph();
        const USDC = refTokens.USDC;
        const DAI = refTokens.DAI;
        const FRAX = refTokens.FRAX;

        it("graph.getPaths should return 2-hop paths USDC->DAI->FRAX", function () {
            const ArbitrageGraph = require("../engine/arbitrageGraph");
            const { graph } = ArbitrageGraph.createStablecoinGraph();

            const paths = graph.getPaths(USDC, 2);
            const found = paths.some(p =>
                p.length === 2 &&
                p[0].token === DAI &&
                p[1].token === FRAX
            );
            expect(found).to.equal(true,
                "Expected USDC->DAI->FRAX path in graph.getPaths(USDC, 2)");
        });

        it("RED: maxHops should be set from env in constructor (currently undefined)", function () {
            process.env.MAX_HOPS = "2";
            const executor = new Executor();
            expect(executor.maxHops).to.equal(2);
        });

        it("should executeSwap with 2-step path (USDC->DAI->FRAX) in DEMO mode", async function () {
            process.env.MODE = "DEMO";
            const executor = new Executor();

            const twoStepPath = [
                { token: DAI, protocol: "UNISWAP_V3", fee: 500 },
                { token: FRAX, protocol: "UNISWAP_V3", fee: 500 }
            ];
            const amountIn = ethers.parseUnits("1000", 6);
            const expectedOut = ethers.parseUnits("997", 18);

            await executor.executeSwap(USDC, twoStepPath, amountIn, expectedOut);

            expect(executor.state.data.currentHoldToken).to.equal(FRAX);
            expect(executor.state.data.entryPrice).to.equal(expectedOut.toString());
        });

        it("should build a bestPath with 2 steps when multi-hop opportunity is detected", async function () {
            process.env.MODE = "DEMO";
            process.env.STRATEGY = "TIERED";
            process.env.MAX_HOPS = "2";
            process.env.MIN_PROFIT_PERCENT = "0.01";

            const executor = new Executor();

            const graphPaths = executor.graph.getPaths(USDC, 2);
            const twoHopPaths = graphPaths.filter(p => p.length === 2);
            expect(twoHopPaths.length).to.be.above(0);

            for (const path of twoHopPaths) {
                expect(path.length).to.equal(2);
                for (const step of path) {
                    expect(step).to.have.property("token");
                    expect(step).to.have.property("protocol");
                    expect(step).to.have.property("fee");
                }
            }
        });
    });

    describe("Integration: full cycle state persistence", function () {
        const fs = require("fs");
        const path = require("path");
        const BotState = require("../engine/state");

        it("should persist currentHoldToken after DEMO swap (in-memory)", async function () {
            process.env.MODE = "DEMO";
            const executor = new Executor();

            executor.state.setInitialState(ethers.parseUnits("1000", 6), "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174");

            const tokenIn = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
            const tokenOut = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
            const swapPath = [{ token: tokenOut, protocol: "UNISWAP_V3", fee: 500 }];
            const amountIn = ethers.parseUnits("1000", 6);
            const expectedOut = ethers.parseUnits("998.5", 18);

            await executor.executeSwap(tokenIn, swapPath, amountIn, expectedOut);

            expect(executor.state.data.currentHoldToken).to.equal(tokenOut);
            expect(executor.state.data.entryPrice).to.equal(expectedOut.toString());
            expect(executor.state.data.status).to.equal("HOLD");
            expect(executor.state.data.entryTimestamp).to.be.a("number");
        });

        it("should persist state to bot_state.json on disk after swap", async function () {
            process.env.MODE = "DEMO";
            process.env.SLIPPAGE_TOLERANCE = "0.001";

            const executor = new Executor();

            const tokenIn = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
            const tokenOut = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
            const swapPath = [{ token: tokenOut, protocol: "UNISWAP_V3", fee: 500 }];
            const amountIn = ethers.parseUnits("500", 6);
            const expectedOut = ethers.parseUnits("499.25", 18);

            await executor.executeSwap(tokenIn, swapPath, amountIn, expectedOut);

            // Read the state file from disk
            const stateFile = path.join(__dirname, "..", "engine", "bot_state.json");
            const fileContents = JSON.parse(fs.readFileSync(stateFile, "utf8"));

            // File must match in-memory state
            expect(fileContents.currentHoldToken).to.equal(executor.state.data.currentHoldToken);
            expect(fileContents.entryPrice).to.equal(executor.state.data.entryPrice);
            expect(fileContents.status).to.equal(executor.state.data.status);

            // entryTimestamp should be recent (within last 5 seconds)
            expect(fileContents.entryTimestamp).to.be.closeTo(Date.now(), 5000);
        });

        it("should update token + balance on repeated swaps", async function () {
            process.env.MODE = "DEMO";
            process.env.SLIPPAGE_TOLERANCE = "0.001";

            const executor = new Executor();

            // First swap: USDC -> DAI
            await executor.executeSwap(
                "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
                [{ token: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", protocol: "UNISWAP_V3", fee: 500 }],
                ethers.parseUnits("1000", 6),
                ethers.parseUnits("998.5", 18)
            );
            expect(executor.state.data.currentHoldToken).to.equal("0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063");

            // Second swap: DAI -> USDC
            await executor.executeSwap(
                "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
                [{ token: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", protocol: "UNISWAP_V3", fee: 500 }],
                ethers.parseUnits("998.5", 18),
                ethers.parseUnits("999.3", 6)
            );
            expect(executor.state.data.currentHoldToken).to.equal("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174");
            expect(executor.state.data.entryPrice).to.equal(ethers.parseUnits("999.3", 6).toString());
        });

        it("should initialize initialCapital only once via setInitialState", function () {
            process.env.MODE = "DEMO";
            const executor = new Executor();

            executor.state.setInitialState(ethers.parseUnits("1000", 6), "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174");
            const firstCapital = executor.state.data.initialCapital;

            // Second call should NOT overwrite
            executor.state.setInitialState(ethers.parseUnits("99999", 6), "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063");
            expect(executor.state.data.initialCapital).to.equal(firstCapital);
        });
    });
});
