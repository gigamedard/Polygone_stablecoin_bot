const hre = require("hardhat");
require("dotenv").config();

async function main() {
    const [owner] = await hre.ethers.getSigners();
    const spenderAddress = process.env.FLASH_ARBITRAGE_ADDRESS;

    if (!spenderAddress) {
        console.error("Please set FLASH_ARBITRAGE_ADDRESS in .env");
        process.exit(1);
    }

    console.log(`Approving tokens for Spender: ${spenderAddress}`);

    // Token Addresses (Polygon)
    const tokens = {
        "USDC (Bridged)": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        "USDT": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        "DAI": "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
        "USDC (Native)": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        // "FRAX": "0x45C32FA6Df82ead1e2eF74D17B76547eDdfAFF42",
        // "MAI": "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1",
        // "LUSD": "0x23001F892C0420Ebe9Ec03296093629185498801"
    };

    const ERC20_ABI = [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) public view returns (uint256)",
        "function symbol() view returns (string)"
    ];

    for (const [name, tokenAddress] of Object.entries(tokens)) {
        try {
            const tokenContract = new hre.ethers.Contract(tokenAddress, ERC20_ABI, owner);

            console.log(`Checking ${name}...`);
            const currentAllowance = await tokenContract.allowance(owner.address, spenderAddress);

            if (currentAllowance > hre.ethers.parseUnits("1000000000", 6)) { // Check if > 1B (High enough)
                console.log(`  ✅ Already approved.`);
                continue;
            }

            console.log(`  🔄 Approving Max Uint...`);
            // Max Uint256
            const tx = await tokenContract.approve(spenderAddress, hre.ethers.MaxUint256);
            await tx.wait();
            console.log(`  ✅ Approved!`);
        } catch (error) {
            console.error(`  ❌ Failed to approve ${name}: ${error.message} (Likely low balance or invalid contract)`);
        }
    }

    console.log("All tokens approved.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
