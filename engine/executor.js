const { ethers } = require("ethers");
const PriceFetcher = require("./priceFetcher");
const ArbitrageGraph = require("./arbitrageGraph");
const BotState = require("./state");
const logger = require("../logger");
require("dotenv").config();

class Executor {
    constructor() {
        this.mode = process.env.MODE || "BACKTEST";

        // Setup Provider
        if (this.mode === "PRODUCTION" || this.mode === "DEMO") {
            this.provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
            this.signer = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        } else {
            this.provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545"); // Hardhat Fork
            this.signer = ethers.Wallet.createRandom().connect(this.provider);
        }

        this.priceFetcher = new PriceFetcher(this.provider, this.mode);
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

        // Token Decimals Map
        const decimals = {
            "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174": 6,  // USDC (Bridged)
            "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": 6,  // USDT
            "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063": 18, // DAI
            "0x45C32FA6Df82ead1e2eF74D17B76547eDdfAFF42": 18, // FRAX
            "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359": 6,  // USDC (Native)
            "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1": 18, // MAI
            "0x23001F892C0420Ebe9Ec03296093629185498801": 18  // LUSD
        };


        // Determine decimals for current token
        const currentDecimals = decimals[currentToken] || 18;

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

        let minScoreThreshold = 0n;
        // balance18 is not defined here, assuming it should be currentBalance normalized to 18 decimals
        const balance18 = currentBalance * (10n ** BigInt(18 - currentDecimals));

        if (this.minProfitAmount > 0) {
            // Fixed Amount Logic (e.g. 0.1$)
            // Scaled to 18 decimals
            minScoreThreshold = BigInt(Math.floor(this.minProfitAmount * 1e18));
        } else {
            // Percentage Logic
            minScoreThreshold = balance18 * BigInt(Math.floor(this.minProfitPercent * 100)) / 10000n;
        }

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

        // 1. Identify Opportunities (GREEDY STRATEGY)
        // Instead of complex pathfinding (DFS/BFS), we look for direct swaps
        // from currentToken -> any other token that yields a profit.

        // 1. Identify Opportunities (GREEDY STRATEGY)
        // Instead of complex pathfinding (DFS/BFS), we look for direct swaps
        // from currentToken -> any other token that yields a profit.

        // Get all direct connections (Multiple edges per token possible)
        const neighbors = this.graph.getNeighbors(currentToken);

        // Iterate over all available direct paths
        for (const edge of neighbors) {
            const targetToken = edge.token;

            // Fetch Price
            const amountOut = await this.priceFetcher.getPrice(
                currentToken,
                targetToken,
                currentBalance,
                edge.protocol,
                edge.fee
            );

            if (amountOut === 0n) {
                // Clean log to show it was checked but failed
                logger.info(`Check ${getName(targetToken)} via ${edge.protocol}: No Liquidity / Error`);
                continue;
            }

            // SCORING
            // Normalize
            // currentDecimals is already declared at line 89
            const finalDecimals = decimals[targetToken] || 18;

            const currentBalanceNormalized = currentBalance * (10n ** BigInt(18 - currentDecimals));
            const finalBalanceNormalized = amountOut * (10n ** BigInt(18 - finalDecimals));

            let score = finalBalanceNormalized - currentBalanceNormalized;
            let riskPenalty = 0n;

            // Apply Tiered Risk Penalty if enabled
            if (this.strategy === "TIERED") {
                const startTier = getTier(currentToken);
                const endTier = getTier(targetToken);

                if (endTier > startTier) {
                    const penaltyPercent = (endTier - startTier) * 0.003; // 0.3% per tier
                    riskPenalty = BigInt(Math.floor(Number(finalBalanceNormalized) * penaltyPercent));
                }
                score = score - riskPenalty;
            }

            const logScore = ethers.formatUnits(score, 18);
            if (this.strategy === "TIERED" && riskPenalty > 0n) {
                logger.info(`Check ${getName(targetToken)} via ${edge.protocol}: Score ${logScore} (Inc. Penalty: -${ethers.formatUnits(riskPenalty, 18)})`);
            } else {
                logger.info(`Check ${getName(targetToken)} via ${edge.protocol}: Score ${logScore}`);
            }

            if (score > bestScore) {
                bestScore = score;
                // Construct a "Path" object for consistency with executeSwap
                bestPath = [{
                    token: targetToken,
                    protocol: edge.protocol,
                    fee: edge.fee
                }];
                bestAmountOut = amountOut;
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
        // --- PROFIT TRACKING ---
        try {
            const initialCapital = BigInt(this.state.data.initialCapital || "0");
            const initialToken = this.state.data.initialToken;

            if (initialCapital > 0n && initialToken) {
                let currentValueInInitialTerms = currentBalance;

                // If currently holding a different token, estimate value in Initial Token
                if (currentToken !== initialToken) {
                    let estimatedOut = 0n;

                    // 1. Try to find a direct path in graph to get correct metadata (fee)
                    const neighbor = this.graph.getNeighbors(currentToken).find(n => n.token === initialToken);

                    if (neighbor) {
                        estimatedOut = await this.priceFetcher.getPrice(currentToken, initialToken, currentBalance, neighbor.protocol, neighbor.fee);
                    }

                    // 2. Fallback: If no direct neighbor or failed, try common V3 fees
                    if (estimatedOut === 0n) {
                        const fees = [100, 500, 3000];
                        for (const f of fees) {
                            estimatedOut = await this.priceFetcher.getPrice(currentToken, initialToken, currentBalance, "UNISWAP_V3", f);
                            if (estimatedOut > 0n) break;
                        }
                    }

                    if (estimatedOut > 0n) {
                        currentValueInInitialTerms = estimatedOut;
                    } else {
                        // 3. LAST RESORT: Normalize decimals assuming 1:1 PEG
                        // This prevents the 10^12 error when mixing 18 dec tokens with 6 dec capital
                        const currentDecimals = decimals[currentToken] || 18;
                        const initialDecimals = decimals[initialToken] || 6;

                        if (currentDecimals > initialDecimals) {
                            currentValueInInitialTerms = currentBalance / (10n ** BigInt(currentDecimals - initialDecimals));
                        } else if (initialDecimals > currentDecimals) {
                            currentValueInInitialTerms = currentBalance * (10n ** BigInt(initialDecimals - currentDecimals));
                        } else {
                            currentValueInInitialTerms = currentBalance;
                        }
                        logger.warn(`Could not fetch market price for ${getName(currentToken)} -> ${getName(initialToken)}. Using 1:1 PEG estimation.`);
                    }
                }

                const profit = currentValueInInitialTerms - initialCapital;
                const profitReadable = ethers.formatUnits(profit, decimals[initialToken] || 6);
                const decimalAdjust = 10 ** (decimals[initialToken] || 6); // Approximation for % calc
                // Use Number for % (converting BigInt to string then number to avoid overflow issues with simple math, though balance is usually small enough for Number)
                const initialCapNum = Number(ethers.formatUnits(initialCapital, decimals[initialToken] || 6));
                const profitNum = Number(ethers.formatUnits(profit, decimals[initialToken] || 6));

                let percent = "0.000";
                if (initialCapNum !== 0) {
                    percent = ((profitNum / initialCapNum) * 100).toFixed(3);
                }

                logger.info(`💰 Total Profit: ${profitReadable} ${getName(initialToken)} (${percent}%) | Initial: ${ethers.formatUnits(initialCapital, 6)} | Current Val: ${ethers.formatUnits(currentValueInInitialTerms, 6)}`);
            }
        } catch (e) {
            logger.error("Error calculating profit:", e.message);
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
                    // ExactInputSingleParams dummy encoding (amountIn overwritten on-chain)
                    const params = {
                        tokenIn: currentToken,
                        tokenOut: step.token,
                        fee: step.fee,
                        recipient: this.flashArbitrageAddress, // Intermediate recipient
                        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
                        amountIn: 0, // Overwritten
                        amountOutMinimum: 0, // Overwritten
                        sqrtPriceLimitX96: 0
                    };

                    // Encode ISwapRouter.ExactInputSingleParams
                    // ABI: (address,address,uint24,address,uint256,uint256,uint256,uint160)
                    const types = ["tuple(address,address,uint24,address,uint256,uint256,uint256,uint160)"];
                    // Ethers v6 encoding format for tuple is array
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
                logger.transaction(`[DEMO] Transaction Constructed (Not Sent): ${JSON.stringify(steps)}`);
                // Simulate state update
                this.state.updateHold(finalToken, expectedOut);
                return;
            }

            // PRODUCTION: Send Transaction
            try {
                const contract = new ethers.Contract(
                    this.flashArbitrageAddress,
                    ["function executeArbitrage(uint256 amountIn, uint256 minAmountOut, tuple(address protocol, bytes data, address tokenIn, address tokenOut)[] steps) external"],
                    this.signer
                );

                // Check Allowance first? 
                // Assuming user approved contract to spend Initial Token.
                // Ideally we check allowance here or in UI.

                logger.info("Sending Transaction...");
                const tx = await contract.executeArbitrage(amountIn, 0, steps); // 0 minAmountOut for now (handled by check inside contract?)
                logger.transaction(`Transaction Sent: ${tx.hash}`);
                await tx.wait();
                logger.transaction("Transaction Confirmed!");

                this.state.updateHold(finalToken, expectedOut);

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
