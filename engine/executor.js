const { ethers } = require("ethers");
const PriceFetcher = require("./priceFetcher");
const ArbitrageGraph = require("./arbitrageGraph");
const BotState = require("./state");
const logger = require("../logger");
require("dotenv").config();

class Executor {
    constructor(overrides = {}) {
        this.mode = overrides.mode || process.env.MODE || "BACKTEST";

        // Setup Provider — allow injection for testing
        if (overrides.provider && overrides.signer) {
            this.provider = overrides.provider;
            this.signer = overrides.signer;
        } else if (this.mode === "PRODUCTION" || this.mode === "DEMO") {
            this.provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
            this.signer = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        } else {
            this.provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545"); // Hardhat Fork
            this.signer = ethers.Wallet.createRandom().connect(this.provider);
        }

        this.priceFetcher = overrides.priceFetcher || new PriceFetcher(this.provider, this.mode);
        this.graphData = ArbitrageGraph.createStablecoinGraph();
        this.graph = this.graphData.graph;
        this.state = new BotState();

        // Config
        // Priority: Fixed Amount > Percentage
        this.minProfitAmount = process.env.MIN_PROFIT_AMOUNT ? parseFloat(process.env.MIN_PROFIT_AMOUNT) : 0;
        this.minProfitPercent = parseFloat(process.env.MIN_PROFIT_PERCENT || "0.20");

        this.forceExitHours = parseInt(process.env.FORCE_EXIT_HOURS || "4");
        // Revert Threshold: 0.9995 scaled to 18 decimals (standard internal precision)
        this.revertThreshold = BigInt(Math.floor(parseFloat(process.env.REVERT_THRESHOLD || "0.9995") * 1e18));

        this.targetPrice = ethers.parseUnits("1.0", 18); // 1.00 normalized
        this.flashArbitrageAddress = process.env.FLASH_ARBITRAGE_ADDRESS;

        // Log Disabled Tokens
        const disabledTokensRaw = process.env.DISABLED_TOKENS || "";
        if (disabledTokensRaw.trim().length > 0) {
            logger.warn(`🚫 DISABLED TOKENS: [${disabledTokensRaw}] - These will be excluded from trading.`);
        }

        // Token decimals map sourced from stablecoin config
        this.tokenDecimals = {
            "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174": 6,  // USDC (Bridged)
            "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": 6,  // USDT
            "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063": 18, // DAI
            "0x45C32FA6Df82ead1e2eF74D17B76547eDdfAFF42": 18, // FRAX
            "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359": 6,  // USDC (Native)
            "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1": 18, // MAI
            "0x23001F892C0420Ebe9Ec03296093629185498801": 18  // LUSD
        };

        // Slippage tolerance: default 0.05% (0.0005), read from env
        this.slippageTolerance = parseFloat(process.env.SLIPPAGE_TOLERANCE || "0.0005");

        // Multi-hop: max number of swap edges per path
        this.maxHops = parseInt(process.env.MAX_HOPS || "2");
    }

    _calculateMinAmountOut(expectedOut, slippageTolerance) {
        const slippageBps = Math.floor(slippageTolerance * 10000);
        if (slippageBps >= 10000) return 0n;
        const numerator = 10000n - BigInt(slippageBps);
        return (expectedOut * numerator) / 10000n;
    }

    _parseOpenSwapExecuted(txReceipt, contractAddress) {
        const iface = new ethers.Interface([
            "event OpenSwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)"
        ]);

        for (const log of txReceipt.logs) {
            if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
            try {
                const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
                if (parsed && parsed.name === "OpenSwapExecuted") {
                    return {
                        tokenIn: parsed.args.tokenIn,
                        tokenOut: parsed.args.tokenOut,
                        amountIn: parsed.args.amountIn,
                        amountOut: parsed.args.amountOut
                    };
                }
            } catch (e) {
                // not our event, skip
            }
        }
        throw new Error("OpenSwapExecuted event not found in receipt");
    }

    _calculateRiskPenalty(finalBalanceNormalized, startTier, endTier) {
        if (endTier <= startTier) return 0n;
        const tierDiff = endTier - startTier;
        const riskBps = BigInt(tierDiff * 30); // 0.3% per tier = 30 basis points
        return (finalBalanceNormalized * riskBps) / 10000n;
    }

    _calculateMinScoreThreshold(balance18) {
        if (this.minProfitAmount > 0) {
            const amountStr = this.minProfitAmount.toString();
            return ethers.parseUnits(amountStr, 18);
        }
        const percentStr = this.minProfitPercent.toString();
        const percentBps = BigInt(Math.round(parseFloat(percentStr) * 100));
        return (balance18 * percentBps) / 10000n;
    }

    async initializeWallet() {
        logger.info("🔍 Scanning wallet for initial balance...");
        const tokens = this.graphData.tokens;
        const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)"];

        for (const [symbol, address] of Object.entries(tokens)) {
            try {
                const contract = new ethers.Contract(address, ERC20_ABI, this.signer);
                const balance = await contract.balanceOf(this.signer.address);

                // Check if balance is significant (> 1 unit approx)
                if (balance > 1000n) { // minimal threshold
                    logger.info(`✅ Found Initial Capital: ${ethers.formatUnits(balance, 6)} ${symbol} (approx)`); // assuming 6 decimals for simplicity in log, but using BigInt

                    // Set initial state
                    this.state.setInitialState(balance, address);

                    // Also update basic state to reflect we hold this
                    this.state.data.currentHoldToken = address;
                    this.state.data.entryPrice = balance.toString(); // "entryPrice" stores the Balance
                    this.state.saveState();
                    return;
                }
            } catch (e) {
                logger.warn(`Failed to check balance for ${symbol}: ${e.message}`);
            }
        }
        logger.warn("⚠️ No significant stablecoin balance found. Defaulting to config capital.");
        // Fallback to Config defined in constructor if no balance found
        const defaultToken = this.graphData.tokens.USDC;
        const decimals = 6;
        const configCapital = ethers.parseUnits(process.env.CAPITAL_AMOUNT || "1000", decimals);
        this.state.setInitialState(configCapital, defaultToken);

        // Fix: Also set currentHoldToken so the cycle can start
        this.state.data.currentHoldToken = defaultToken;
        this.state.data.status = 'SEARCH'; // or HOLD? If we assume we have capital, we HOLD it
        this.state.saveState();
    }

    async runCycle() {
        const getName = (addr) => {
            const tokenSymbols = {
                "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174": "USDC.e",
                "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": "USDT",
                "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063": "DAI",
                "0x45C32FA6Df82ead1e2eF74D17B76547eDdfAFF42": "FRAX", // Valid Checksum
                "0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF42": "FRAX", // Legacy catch
                "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359": "USDC",
                "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1": "MAI",
                "0x23001F892C0420Ebe9Ec03296093629185498801": "LUSD"
            };
            if (!addr) return "None";
            return tokenSymbols[addr] || addr.slice(0, 6);
        };


        // --- AUTO-DETECT INITIAL STATE ---
        if (!this.state.data.initialCapital || this.state.data.initialCapital === '0') {
            await this.initializeWallet();
        }

        logger.info(`[${this.mode}] Cycle - Status: ${this.state.data.status} | Held: ${getName(this.state.data.currentHoldToken)}`);

        this.maxHops = parseInt(process.env.MAX_HOPS || "2");
        this.capitalAmount = process.env.CAPITAL_AMOUNT || "1000";

        // 1. Evaluate Paths (Multi-hop)
        const currentToken = this.state.data.currentHoldToken;

        // Determine decimals for current token
        const currentDecimals = this.tokenDecimals[currentToken] || 18;

        let currentBalance;
        if (this.mode === "PRODUCTION") {
            // Fetch REAL balance from wallet
            const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)"];
            try {
                const contract = new ethers.Contract(currentToken, ERC20_ABI, this.signer);
                currentBalance = await contract.balanceOf(this.signer.address);
                if (currentBalance === 0n) {
                    logger.warn(`⚠️ Warning: Wallet balance for ${getName(currentToken)} is 0! Re-scanning wallet...`);
                    await this.initializeWallet();
                    return; // Restart cycle with new state
                }
            } catch (e) {
                logger.error(`Failed to fetch balance: ${e.message}`);
                currentBalance = 0n;
            }
        } else {
            // DEMO / BACKTEST: Use Config/Mock
            currentBalance = ethers.parseUnits(this.capitalAmount, currentDecimals);
        }

        // --- FORCE EXIT LOGIC (Timeout) ---
        const HOLD_DURATION_LIMIT = this.forceExitHours * 60 * 60 * 1000;
        if (this.state.data.status === 'HOLD' && (Date.now() - this.state.data.entryTimestamp > HOLD_DURATION_LIMIT)) {
            logger.warn(`!!! FORCE EXIT TRIGGERED (Timeout > ${this.forceExitHours}h) !!!`);

            // Target: USDC (Tier A)
            const targetToken = this.graphData.tokens.USDC;
            if (this.state.data.currentHoldToken !== targetToken) {
                // For Force Exit, we prefer direct swap if possible, or simplest path.
                // Using getNeighbors for speed/simplicity in emergency
                const neighbors = this.graph.getNeighbors(this.state.data.currentHoldToken);
                // Find path to USDC
                const exitMove = neighbors.find(n => n.token === targetToken);
                if (exitMove) {
                    // Fetch price regardless of score 
                    const amountIn = currentBalance;
                    const amountOut = await this.priceFetcher.getPrice(
                        this.state.data.currentHoldToken,
                        exitMove.token,
                        amountIn,
                        exitMove.protocol,
                        exitMove.fee
                    );
                    logger.warn(`Executing Force Exit to USDC. AmountOut: ${ethers.formatUnits(amountOut, 6)}`);
                    // Fix: executeSwap expects an array for 'path' and 'expectedOut' as 4th arg
                    await this.executeSwap(this.state.data.currentHoldToken, [{ ...exitMove, amountOut }], amountIn, amountOut);
                    return; // End cycle after exit
                }
            }
        }

        // 1. Evaluate Paths (Multi-hop)
        // const paths = this.graph.getPaths(currentToken, this.maxHops); // REMOVED for Greedy

        // Calculate Min Score
        // Normalize everything to 18 decimals for "Score" calculation
        // Calculate Min Score

        const balance18 = currentBalance * (10n ** BigInt(18 - currentDecimals));
        const minScoreThreshold = this._calculateMinScoreThreshold(balance18);

        let bestScore = -999999999999999999n; // Very low BigInt
        let bestPath = null;
        let bestAmountOut = 0n;

        // 2. Decision Making & Scoring
        this.strategy = process.env.STRATEGY || "FREE_MARKET"; // FREE_MARKET or TIERED

        // TIER DEFINITIONS
        const TIER_A = ["0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"]; // USDC, USDT, USDC_NATIVE
        const TIER_B = ["0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", "0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF42"]; // DAI, FRAX
        const TIER_C = ["0xa3Fa99A148438SF63e015fa41cca94272b3a4395", "0x23001f892c0420ebe9ec03296093629185498801"]; // MAI, LUSD

        const getTier = (token) => {
            if (TIER_A.includes(token)) return 1; // Best
            if (TIER_B.includes(token)) return 2;
            if (TIER_C.includes(token)) return 3; // Risk
            return 3; // Default to risk
        };

        // --- MULTI-HOP PATHFINDING ---
        const allPaths = this.graph.getPaths(currentToken, this.maxHops);

        const disabledTokensRaw = process.env.DISABLED_TOKENS || "";
        const disabledSymbols = disabledTokensRaw.split(",").map(s => s.trim().toUpperCase()).filter(s => s.length > 0);

        for (const path of allPaths) {

            const finalToken = path[path.length - 1].token;

            if (disabledSymbols.includes(getName(finalToken).toUpperCase())) continue;
            if (disabledSymbols.includes(getName(currentToken).toUpperCase())) continue;

            // Cascade quotes through each step
            let stepAmountIn = currentBalance;
            let stepTokenIn = currentToken;
            let valid = true;

            for (const step of path) {
                const amountOut = await this.priceFetcher.getPrice(
                    stepTokenIn,
                    step.token,
                    stepAmountIn,
                    step.protocol,
                    step.fee
                );

                if (amountOut === 0n) {
                    valid = false;
                    break;
                }
                stepAmountIn = amountOut;
                stepTokenIn = step.token;
            }

            if (!valid) {
                logger.info(`Path to ${getName(finalToken)}: No Liquidity / Error`);
                continue;
            }

            // SCORING
            const finalDecimals = this.tokenDecimals[finalToken] || 18;
            const currentBalanceNormalized = currentBalance * (10n ** BigInt(18 - currentDecimals));
            const finalBalanceNormalized = stepAmountIn * (10n ** BigInt(18 - finalDecimals));

            let score = finalBalanceNormalized - currentBalanceNormalized;
            let riskPenalty = 0n;

            if (this.strategy === "TIERED") {
                const startTier = getTier(currentToken);
                const endTier = getTier(finalToken);
                riskPenalty = this._calculateRiskPenalty(finalBalanceNormalized, startTier, endTier);
                score = score - riskPenalty;
            }

            const hopsLabel = path.length > 1 ? ` (${path.length} hops)` : "";
            const logScore = ethers.formatUnits(score, 18);
            if (this.strategy === "TIERED" && riskPenalty > 0n) {
                logger.info(`Check ${getName(finalToken)}${hopsLabel} via ${path.map(s => s.protocol).join("->")}: Score ${logScore} (Inc. Penalty: -${ethers.formatUnits(riskPenalty, 18)})`);
            } else {
                logger.info(`Check ${getName(finalToken)}${hopsLabel} via ${path.map(s => s.protocol).join("->")}: Score ${logScore}`);
            }

            if (score > bestScore) {
                bestScore = score;
                bestPath = path.map(s => ({ token: s.token, protocol: s.protocol, fee: s.fee }));
                bestAmountOut = stepAmountIn;
            }
        }

        // 2. Decision Making

        // A. Take Profit / Revert to Peg Logic
        if (currentToken !== this.graphData.tokens.USDC && currentToken !== this.graphData.tokens.USDT) {
            // Logic to check if we are back to peg (e.g. Price against USDC >= RevertThreshold)
            // Not fully implemented in this loop without fetching USDC price specifically if neighbors don't include it.
            // But if bestMove is to USDC, the Score will reflect it.
        }

        if (bestPath && bestScore > minScoreThreshold) {
            const finalToken = bestPath[bestPath.length - 1].token;
            logger.opportunity(`>>> OPPORTUNITY FOUND: Path to ${getName(finalToken)} (Score: ${ethers.formatUnits(bestScore, 18)}) > Threshold`);
            // Execute first step of the path
            // In a real atomic tx, we would execute the whole path via the contract
            // For this hybrid bot state logic, we execute step-by-step or pass full path to contract

            // If passing full path to contract:
            // await this.executeSwap(currentToken, bestPath, ...);

            // For now, let's keep it simple: State updates to the NEXT token. 
            // BUT for multi-hop ON-CHAIN atomic swap, we need to execute all.
            // If we are doing "Mean Reversion", usually we swap to HOLD.
            // If the path is strictly an arb loop (ends at Start), we end up with Start Token.

            // Let's assume we execute the full path atomically if it's an arbitrage (FlashArbitrage).
            // If it's a "Reversion" swap (open loop), we might need a different contract function or just swap.

            // Simplification: We EXECUTE THE FULL PATH and update state to Final Token.
            await this.executeSwap(currentToken, bestPath, currentBalance, bestAmountOut);
        } else {
            const thresholdLabel = this.minProfitAmount > 0 ? `${this.minProfitAmount}$` : `${this.minProfitPercent}%`;
            logger.info(`No opportunity > ${thresholdLabel}. Best Score: ${ethers.formatUnits(bestScore, 18)}. HOLDing.`);
        }
        // --- ADDP PROFIT TRACKING (accumulated stablecoin units) ---
        try {
            const initialCapital = BigInt(this.state.data.initialCapital || "0");
            const initialToken = this.state.data.initialToken;

            if (initialCapital > 0n && initialToken) {
                const currentEntryBalance = BigInt(this.state.data.entryPrice || "0");
                const currentHoldToken = this.state.data.currentHoldToken;

                const currentDec = this.tokenDecimals[currentHoldToken] || 18;
                const initialDec = this.tokenDecimals[initialToken] || 6;

                const currentNorm = currentEntryBalance * (10n ** BigInt(18 - currentDec));
                const initialNorm = initialCapital * (10n ** BigInt(18 - initialDec));

                const profitNorm = currentNorm - initialNorm;
                const profitReadable = ethers.formatUnits(profitNorm, 18);
                const initialReadable = parseFloat(ethers.formatUnits(initialNorm, 18));

                let percent = "0.000";
                if (initialReadable > 0) {
                    percent = ((parseFloat(profitReadable) / initialReadable) * 100).toFixed(3);
                }

                logger.info(`💰 ADDP Accumulated Units: ${profitReadable} (${percent}%) | Initial: ${initialReadable.toFixed(6)} | Current: ${ethers.formatUnits(currentNorm, 18)}`);
            }
        } catch (e) {
            logger.error("Error calculating ADDP profit:", e.message);
        }
    }

    async executeSwap(tokenIn, path, amountIn, expectedOut) {
        // Path is array of steps
        const finalToken = path[path.length - 1].token;

        if (this.mode === "BACKTEST") {
            logger.transaction(`[BACKTEST] Executed Path. ${tokenIn} -> ... -> ${finalToken}. New Balance: ${ethers.formatUnits(expectedOut, 6)}`);
            this.state.updateHold(finalToken, expectedOut);
            return;
        }

        // PRODUCTION Logic
        if (this.mode === "PRODUCTION" || this.mode === "DEMO") {
            if (!this.flashArbitrageAddress) {
                if (this.mode === "DEMO") {
                    logger.warn("⚠️  DEMO MODE: Missing FLASH_ARBITRAGE_ADDRESS. Using dummy address for simulation.");
                    this.flashArbitrageAddress = "0x0000000000000000000000000000000000000000"; // Dummy
                } else {
                    logger.error("Missing FLASH_ARBITRAGE_ADDRESS in .env");
                    return;
                }
            }

            // Construct SwapStep[]
            const steps = [];
            let currentToken = tokenIn;

            // Addresses & ABI
            const UNISWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
            const CURVE_POOL_ADDRESS = "0x445FE580eF8d70FF569aB36e80c647af338db351"; // Default Aave Pool

            for (const step of path) {
                let protocolAddress;
                let data;

                if (step.protocol === "UNISWAP_V3") {
                    protocolAddress = UNISWAP_ROUTER;

                    const stepMinOut = this._calculateMinAmountOut(expectedOut, this.slippageTolerance);

                    // ExactInputSingleParams (amountIn overwritten on-chain by amountIn from contract)
                    const params = {
                        tokenIn: currentToken,
                        tokenOut: step.token,
                        fee: step.fee,
                        recipient: this.flashArbitrageAddress,
                        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
                        amountIn: 0,
                        amountOutMinimum: stepMinOut,
                        sqrtPriceLimitX96: 0
                    };

                    const types = ["tuple(address,address,uint24,address,uint256,uint256,uint256,uint160)"];
                    const values = [[
                        params.tokenIn, params.tokenOut, params.fee, params.recipient,
                        params.deadline, params.amountIn, params.amountOutMinimum, params.sqrtPriceLimitX96
                    ]];
                    const coder = ethers.AbiCoder.defaultAbiCoder();
                    data = coder.encode(types, values);

                } else if (step.protocol === "CURVE") {
                    // Curve Data: (int128 i, int128 j, address pool)
                    // Map Token -> Index
                    const tokenIndex = {
                        "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063": 0, // DAI
                        "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174": 1, // USDC
                        "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": 2  // USDT
                    };

                    // Fallback to strict addresses if map fails? Or assume correct.
                    const i = tokenIndex[ethers.getAddress(currentToken)];
                    const j = tokenIndex[ethers.getAddress(step.token)];

                    protocolAddress = CURVE_POOL_ADDRESS; // Simplified assumption for Greedy: Always Aave Pool

                    const coder = ethers.AbiCoder.defaultAbiCoder();
                    data = coder.encode(["int128", "int128", "address"], [i, j, CURVE_POOL_ADDRESS]);
                }

                steps.push({
                    protocol: protocolAddress,
                    data: data,
                    tokenIn: currentToken,
                    tokenOut: step.token
                });

                currentToken = step.token;
            }

            if (this.mode === "DEMO") {
                const minAmountOut = this._calculateMinAmountOut(expectedOut, this.slippageTolerance);
                logger.transaction(`[DEMO] Transaction Constructed (Not Sent) | minAmountOut=${minAmountOut.toString()} | steps=${JSON.stringify(steps)}`);
                this.state.updateHold(finalToken, expectedOut);
                return;
            }

            // PRODUCTION: Send Transaction
            try {
                const contract = new ethers.Contract(
                    this.flashArbitrageAddress,
                    [
                        "function executeArbitrage(uint256 amountIn, uint256 minAmountOut, tuple(address protocol, bytes data, address tokenIn, address tokenOut)[] steps) external",
                        "event OpenSwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)"
                    ],
                    this.signer
                );

                const minAmountOut = this._calculateMinAmountOut(expectedOut, this.slippageTolerance);
                logger.info(`Sending Transaction... minAmountOut=${minAmountOut.toString()}`);
                const tx = await contract.executeArbitrage(amountIn, minAmountOut, steps);
                logger.transaction(`Transaction Sent: ${tx.hash}`);
                const receipt = await tx.wait();
                logger.transaction("Transaction Confirmed!");

                const decoded = this._parseOpenSwapExecuted(receipt, this.flashArbitrageAddress);
                const realAmountOut = decoded.amountOut;
                logger.transaction(`OpenSwapExecuted: tokenOut=${decoded.tokenOut} amountOut=${realAmountOut.toString()}`);

                this.state.updateHold(decoded.tokenOut, realAmountOut);

            } catch (e) {
                logger.error("Transaction Failed:", e.message);
            }
        }
    }
}

// Simple entry point
if (require.main === module) {
    const executor = new Executor();
    executor.runCycle();
}

module.exports = Executor;
