const { ethers } = require("ethers");

/**
 * ArbitrageGraph: Manages the graph of tokens and finds arbitrage paths.
 * Implements S1 -> S2 -> S3 -> S1 logic with MAX_DEPTH=2 (3 steps total).
 */
class ArbitrageGraph {
    constructor() {
        this.adjList = new Map(); // token -> [ { token, protocol, fee } ]
    }

    // Add a connection between two tokens
    addEdge(tokenA, tokenB, protocol, fee = 3000) {
        if (!this.adjList.has(tokenA)) this.adjList.set(tokenA, []);
        this.adjList.get(tokenA).push({ token: tokenB, protocol, fee });
    }

    /**
     * Get direct neighbors for a specific token (Depth = 1).
     * @param {string} tokenAddress 
     * @returns {Array} 
     */
    getNeighbors(tokenAddress) {
        if (!this.adjList.has(tokenAddress)) return [];
        return this.adjList.get(tokenAddress);
    }

    /**
     * Find all paths from startToken up to maxHops depth.
     * @param {string} startToken - Address of the token we currently hold
     * @param {number} maxHops - Maximum number of swaps (edges)
     * @returns {Array} - Array of paths (each path is an array of edges)
     */
    getPaths(startToken, maxHops = 2) {
        let paths = [];
        // Queue elements: { token: currentAddress, path: [edge1, edge2, ...] }
        let queue = [{ token: startToken, path: [] }];

        while (queue.length > 0) {
            let { token, path } = queue.shift();

            // If we reached max depth, stop expanding this branch
            if (path.length >= maxHops) continue;

            const neighbors = this.adjList.get(token) || [];

            for (const neighbor of neighbors) {
                // Cycle Prevention:
                // Don't visit a node that is already in the path's "history"
                // Path history = startToken + [edge.token for edge in path]
                // We want to allow A -> B -> C -> A (Triangular), so we allow visiting startToken IF path length > 1
                // But we don't want A -> B -> A (Immediate return) if min hops is significant?
                // Actually, strict cycle prevention: 
                // Don't visit 'neighbor.token' if it is already in the path (excluding startToken if we want loops).

                // Simple Logic: Prevent immediate back-and-forth A->B->A
                if (path.length > 0 && neighbor.token === path[path.length - 1].token) continue; // Should be impossible by graph structure usually (no self loops)

                // Allow visiting startToken (Closing the loop)
                // But disallow visiting other nodes already in path
                const inPath = path.some(edge => edge.token === neighbor.token);
                if (inPath && neighbor.token !== startToken) continue;

                const newPath = [...path, neighbor];
                paths.push(newPath); // Add this valid path
                queue.push({ token: neighbor.token, path: newPath });
            }
        }
        return paths;
    }

    // Example initialization with known Polygon stablecoins
    static createStablecoinGraph() {
        const g = new ArbitrageGraph();
        const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e (Bridged)
        const USDT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
        const DAI = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";
        // New Tokens
        const FRAX = "0x45C32FA6Df82ead1e2eF74D17B76547eDdfAFF42";
        const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // USDC (Native)
        const MAI = "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1"; // miMATIC
        const LUSD = "0x23001F892C0420Ebe9Ec03296093629185498801";

        // Mock Protocols
        const UNISWAP = "UNISWAP_V3";
        const CURVE = "CURVE";

        // --- CORE (Bridged) ---
        // USDC <-> USDT
        g.addEdge(USDC, USDT, UNISWAP, 100);
        g.addEdge(USDT, USDC, UNISWAP, 100);
        g.addEdge(USDC, USDT, CURVE);
        g.addEdge(USDT, USDC, CURVE);

        // USDT <-> DAI
        g.addEdge(USDT, DAI, UNISWAP, 500);
        g.addEdge(DAI, USDT, UNISWAP, 500);
        g.addEdge(USDT, DAI, CURVE);
        g.addEdge(DAI, USDT, CURVE);

        // DAI <-> USDC
        g.addEdge(DAI, USDC, UNISWAP, 500);
        g.addEdge(USDC, DAI, UNISWAP, 500);
        g.addEdge(DAI, USDC, CURVE);
        g.addEdge(USDC, DAI, CURVE);

        // --- EXPANSION ---

        // FRAX <-> USDC
        g.addEdge(FRAX, USDC, UNISWAP, 500);
        g.addEdge(USDC, FRAX, UNISWAP, 500);
        // FRAX <-> USDC
        g.addEdge(FRAX, USDC, UNISWAP, 500);
        g.addEdge(USDC, FRAX, UNISWAP, 500);

        // FRAX <-> DAI
        g.addEdge(FRAX, DAI, UNISWAP, 500);
        g.addEdge(DAI, FRAX, UNISWAP, 500);

        // Native USDC <-> Bridged USDC (Peg Maintenance)
        g.addEdge(USDC_NATIVE, USDC, UNISWAP, 100); // Usually tight peg
        g.addEdge(USDC, USDC_NATIVE, UNISWAP, 100);

        // MAI <-> USDC / DAI
        g.addEdge(MAI, USDC, UNISWAP, 500);
        g.addEdge(USDC, MAI, UNISWAP, 500);
        g.addEdge(MAI, DAI, UNISWAP, 500);
        g.addEdge(DAI, MAI, UNISWAP, 500);

        // LUSD <-> DAI / USDC
        g.addEdge(LUSD, DAI, UNISWAP, 500);
        g.addEdge(DAI, LUSD, UNISWAP, 500);
        g.addEdge(LUSD, USDC, UNISWAP, 500);
        g.addEdge(USDC, LUSD, UNISWAP, 500);

        // --- EXPANDED MESH (USDT & Others) ---
        // USDT <-> FRAX
        g.addEdge(USDT, FRAX, UNISWAP, 500);
        g.addEdge(FRAX, USDT, UNISWAP, 500);

        // USDT <-> MAI
        g.addEdge(USDT, MAI, UNISWAP, 500);
        g.addEdge(MAI, USDT, UNISWAP, 500);

        // USDT <-> LUSD
        g.addEdge(USDT, LUSD, UNISWAP, 500);
        g.addEdge(LUSD, USDT, UNISWAP, 500);

        // USDT <-> USDC_NATIVE
        g.addEdge(USDT, USDC_NATIVE, UNISWAP, 100);
        g.addEdge(USDC_NATIVE, USDT, UNISWAP, 100);

        // USDC_NATIVE <-> DAI
        g.addEdge(USDC_NATIVE, DAI, UNISWAP, 500);
        g.addEdge(DAI, USDC_NATIVE, UNISWAP, 500);

        // USDC_NATIVE <-> FRAX
        g.addEdge(USDC_NATIVE, FRAX, UNISWAP, 500);
        g.addEdge(FRAX, USDC_NATIVE, UNISWAP, 500);

        // MAI <-> USDT (Already added above)
        // MAI <-> FRAX
        g.addEdge(MAI, FRAX, UNISWAP, 500);
        g.addEdge(FRAX, MAI, UNISWAP, 500);

        // --- FEE TIER FALLBACKS (3000 / 0.3%) ---
        // Add 0.3% pools for volatile or low liquidity pairs
        g.addEdge(USDT, FRAX, UNISWAP, 3000);
        g.addEdge(FRAX, USDT, UNISWAP, 3000);
        g.addEdge(USDT, MAI, UNISWAP, 3000);
        g.addEdge(MAI, USDT, UNISWAP, 3000);
        g.addEdge(USDT, LUSD, UNISWAP, 3000);
        g.addEdge(LUSD, USDT, UNISWAP, 3000);
        g.addEdge(USDC, MAI, UNISWAP, 3000);
        g.addEdge(MAI, USDC, UNISWAP, 3000);

        return { graph: g, tokens: { USDC, USDT, DAI, FRAX, USDC_NATIVE, MAI, LUSD } };
    }
}

module.exports = ArbitrageGraph;
