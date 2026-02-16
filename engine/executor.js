const { ethers, JsonRpcProvider, Wallet, Contract, AbiCoder } = require("ethers");
const PriceFetcher = require("./priceFetcher");
const ArbitrageGraph = require("./arbitrageGraph");
const BotState = require("./state");
const axios = require('axios'); // For Laravel API
require("dotenv").config();

class Executor {
    constructor() {
        this.mode = process.env.MODE || "BACKTEST";

        // Setup Provider
        if (this.mode === "PRODUCTION" || this.mode === "DEMO") {
            this.provider = new JsonRpcProvider(process.env.POLYGON_RPC_URL);
            this.signer = new Wallet(process.env.PRIVATE_KEY, this.provider);
        } else {
            this.provider = new JsonRpcProvider("http://127.0.0.1:8545"); // Hardhat Fork
            this.signer = Wallet.createRandom().connect(this.provider);
        }

        this.priceFetcher = new PriceFetcher(this.provider, this.mode);
        this.graphData = ArbitrageGraph.createStablecoinGraph();
        this.graph = this.graphData.graph;
        this.state = new BotState();

        // Config
        this.minProfitAmount = process.env.MIN_PROFIT_AMOUNT ? parseFloat(process.env.MIN_PROFIT_AMOUNT) : 0;
        this.minProfitPercent = parseFloat(process.env.MIN_PROFIT_PERCENT || "0.20");

        // Guilds (Factory or Direct List)
        this.guildFactoryAddress = process.env.GUILD_FACTORY_ADDRESS;
        this.guildAddresses = process.env.GUILD_ADDRESSES ? process.env.GUILD_ADDRESSES.split(',') : [];

        this.flashArbitrageAddress = process.env.FLASH_ARBITRAGE_ADDRESS;
        this.laravelApiUrl = process.env.LARAVEL_API_URL || "http://localhost:8000/api/bot";

        // Cache for Guilds
        this.guilds = [];
        this.lastGuildSync = 0;
    }

    // Fetch Guilds from Factory or API
    async fetchGuilds() {
        // Check if we need to sync (e.g. every 5 mins)
        if (Date.now() - this.lastGuildSync < 300000) return;

        try {
            if (this.guildAddresses.length > 0) {
                this.guilds = this.guildAddresses;
                console.log(`Loaded ${this.guilds.length} Guilds from Config.`);
            } else if (this.guildFactoryAddress) {
                const factoryAbi = ["function getGuilds() view returns (address[])"];
                const factory = new Contract(this.guildFactoryAddress, factoryAbi, this.provider);
                this.guilds = await factory.getGuilds();
                console.log(`Fetched ${this.guilds.length} Guilds from Factory.`);
            } else {
                console.warn("⚠️ No Guild Factory or Guild Addresses configured. Guilds list will be empty.");
                this.guilds = [];
            }
            this.lastGuildSync = Date.now();
        } catch (e) {
            console.error("Failed to fetch guilds:", e.message);
            this.guilds = []; // Ensure guilds are reset on failure
        }
    }

    async runCycle() {
        await this.fetchGuilds();

        const getName = (addr) => {
            for (const [key, val] of Object.entries(this.graphData.tokens)) {
                if (val.toLowerCase() === addr.toLowerCase()) return key;
            }
            return addr.slice(0, 6);
        };

        let sources = [];

        if (this.guilds.length > 0) {
            sources = this.guilds.map(g => ({ type: 'GUILD', address: g }));
        } else {
            console.log("No Guilds found. Using Wallet as source (Legacy Mode).");
            sources = [{ type: 'WALLET', address: this.signer.address }];
        }

        for (const source of sources) {
            await this.processSource(source, getName);
        }

        await this.distributeFees();
    }

    async processSource(source, getName) {
        // Determine Capital & Asset
        let assetAddress;
        let capitalAmount;

        if (source.type === 'GUILD') {
            // Fetch Guild Asset & Balance
            const guildAbi = [
                "function asset() view returns (address)",
                "function totalAssets() view returns (uint256)",
                "function executeRaid(uint256 amount, bytes calldata data) external"
            ];
            const guildContract = new Contract(source.address, guildAbi, this.signer);

            try {
                assetAddress = await guildContract.asset();
                // Check real balance on chain
                const erc20 = new Contract(assetAddress, ["function balanceOf(address) view returns (uint256)"], this.provider);
                capitalAmount = await erc20.balanceOf(source.address);
            } catch (e) {
                console.error(`Error reading Guild ${source.address}:`, e.message);
                return;
            }
            // If capital is 0, skip
            if (capitalAmount == 0n) return;

        } else {
            // Wallet Mode
            assetAddress = this.state.data.currentHoldToken || this.graphData.tokens.USDC;
            const erc20 = new Contract(assetAddress, ["function balanceOf(address) view returns (uint256)"], this.signer);
            capitalAmount = await erc20.balanceOf(source.address);
        }

        const assetName = getName(assetAddress);

        // 1. Find Opportunity
        const neighbors = this.graph.getNeighbors(assetAddress);

        let bestScore = -999999999999999999n;
        let bestPath = null;

        for (const edge of neighbors) {
            const targetToken = edge.token;
            const amountOut = await this.priceFetcher.getPrice(
                assetAddress,
                targetToken,
                capitalAmount,
                edge.protocol,
                edge.fee
            );

            if (amountOut === 0n) continue;

            // Check return path for Loop
            const returnNeighbors = this.graph.getNeighbors(targetToken);
            const returnEdge = returnNeighbors.find(n => n.token === assetAddress);

            if (returnEdge) {
                // Check simple loop
                const amountReturn = await this.priceFetcher.getPrice(
                    targetToken,
                    assetAddress,
                    amountOut,
                    returnEdge.protocol,
                    returnEdge.fee
                );

                const profit = amountReturn - capitalAmount;
                if (profit > 0n) {
                    // Start Score
                    if (profit > bestScore) {
                        bestScore = profit;
                        bestPath = [
                            { token: targetToken, protocol: edge.protocol, fee: edge.fee },
                            { token: assetAddress, protocol: returnEdge.protocol, fee: returnEdge.fee }
                        ];
                    }
                }
            }
        }

        // Execute if Profit > Threshold
        if (bestPath && bestScore > 0n) {
            console.log(`>>> RAID DETECTED: Profit ${ethers.formatUnits(bestScore, 6)} ${assetName}`);

            if (source.type === 'GUILD') {
                await this.executeGuildRaid(source.address, assetAddress, capitalAmount, bestPath, bestScore);
            } else {
                console.log("Wallet execution not implemented in this version.");
            }
        }
    }

    async executeGuildRaid(guildAddress, tokenIn, amountIn, path, profit) {
        if (this.mode === "BACKTEST") {
            console.log(`[BACKTEST] Raid Executed on ${guildAddress}`);
            return;
        }

        // Encode steps
        let currentToken = tokenIn;
        const encodedSteps = [];

        for (const step of path) {
            const data = this.encodeData(currentToken, step);
            encodedSteps.push({
                protocol: this.getProtocolAddress(step.protocol),
                data: data,
                tokenIn: currentToken,
                tokenOut: step.token
            });
            currentToken = step.token;
        }

        // Encode for GuildVault: (uint256 minAmountOut, SwapStep[] steps)
        const minAmountOut = amountIn + (profit * 95n / 100n); // 95% of expected to allow slippage

        const coder = AbiCoder.defaultAbiCoder();
        // struct SwapStep { address protocol; bytes data; address tokenIn; address tokenOut; }
        const swapStepType = "tuple(address protocol, bytes data, address tokenIn, address tokenOut)[]";

        const payload = coder.encode(
            ["uint256", swapStepType],
            [minAmountOut, encodedSteps]
        );

        try {
            const guild = new Contract(guildAddress, ["function executeRaid(uint256, bytes) external"], this.signer);
            const tx = await guild.executeRaid(amountIn, payload);
            console.log(`Raid Tx Sent: ${tx.hash}`);
            await tx.wait();

            // Report to Laravel
            await this.reportRaid(guildAddress, profit, tokenIn, path, tx.hash);

        } catch (e) {
            console.error("Raid Failed:", e.message);
        }
    }

    getProtocolAddress(protocol) {
        if (protocol === "UNISWAP_V3") return "0xE592427A0AEce92De3Edee1F18E0157C05861564";
        if (protocol === "CURVE") return "0x445FE580eF8d70FF569aB36e80c647af338db351"; // Default Aave
        return ethers.ZeroAddress;
    }

    encodeData(tokenIn, step) {
        const coder = AbiCoder.defaultAbiCoder();
        if (step.protocol === "UNISWAP_V3") {
            const params = {
                tokenIn: tokenIn,
                tokenOut: step.token,
                fee: step.fee,
                recipient: "0x0000000000000000000000000000000000000000", // Placeholder, overridden by Contract
                deadline: Math.floor(Date.now() / 1000) + 1200,
                amountIn: 0,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            };

            // tuple(address,address,uint24,address,uint256,uint256,uint256,uint160)
            const paramsTuple = [
                params.tokenIn, params.tokenOut, params.fee, params.recipient,
                params.deadline, params.amountIn, params.amountOutMinimum, params.sqrtPriceLimitX96
            ];
            return coder.encode(["tuple(address,address,uint24,address,uint256,uint256,uint256,uint160)"], [paramsTuple]);
        } else if (step.protocol === "CURVE") {
            const tokenIndex = {
                "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063": 0, // DAI
                "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174": 1, // USDC
                "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": 2  // USDT
            };

            const i = tokenIndex[tokenIn];
            const j = tokenIndex[step.token];

            // Check if valid
            if (i === undefined || j === undefined) return "0x";

            return coder.encode(["int128", "int128", "address"], [i, j, "0x445FE580eF8d70FF569aB36e80c647af338db351"]);
        }
        return "0x";
    }

    async reportRaid(guildAddr, profit, tokenIn, path, txHash) {
        try {
            await axios.post(`${this.laravelApiUrl}/raid-success`, {
                guild_address: guildAddr,
                profit: ethers.formatUnits(profit, 6),
                token_in: tokenIn,
                token_out: path[path.length - 1].token,
                portal_color: 'Blue', // Mock
                tx_hash: txHash
            });
            console.log("✅ Raid Reported to API");
        } catch (e) {
            console.error("API Report Failed:", e.message);
        }
    }

    async distributeFees() {
        if (this.mode === "BACKTEST") return;

        // Fee Distribution Logic (e.g. every hour)
        if (Date.now() - (this.lastFeeDist || 0) < 3600000) return;

        console.log("Checking for accumulated fees...");
        for (const guildAddr of this.guilds) {
            try {
                const guild = new Contract(guildAddr, ["function accumulatedFees() view returns (uint256)", "function distributeFees() external"], this.signer);
                const fees = await guild.accumulatedFees();

                if (fees > 0n) { // Threshold could be set higher to save gas
                    console.log(`💰 Distributing Fees from ${guildAddr}: ${ethers.formatUnits(fees, 6)}`);
                    const tx = await guild.distributeFees();
                    await tx.wait();
                    console.log(`✅ Fees Distributed: ${tx.hash}`);
                }
            } catch (e) {
                console.error(`Fee Distribution failed for ${guildAddr}:`, e.message);
            }
        }
        this.lastFeeDist = Date.now();
    }
}

if (require.main === module) {
    const executor = new Executor();
    // Loop
    (async () => {
        while (true) {
            await executor.runCycle();
            await new Promise(r => setTimeout(r, 10000)); // 10s delay
        }
    })();
}

module.exports = Executor;
