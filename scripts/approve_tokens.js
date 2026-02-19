const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    const rpcUrl = process.env.POLYGON_RPC_URL;
    const privateKey = process.env.PRIVATE_KEY;
    const spenderAddress = process.env.FLASH_ARBITRAGE_ADDRESS;

    if (!rpcUrl || !privateKey || !spenderAddress) {
        console.error("Missing configuration in .env: POLYGON_RPC_URL, PRIVATE_KEY, or FLASH_ARBITRAGE_ADDRESS");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`Connected to RPC: ${rpcUrl}`);
    console.log(`Wallet Address: ${wallet.address}`);
    console.log(`Approving tokens for Spender: ${spenderAddress}`);

    // Token Addresses (Polygon) - Corrected Checksums
    const tokens = {
        "USDC.e (Bridged)": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        "USDT": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        "DAI": "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
        "USDC (Native)": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        "FRAX": "0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF42",
        "MAI": "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1",
        // "LUSD": "0x23001F892C0420Ebe9Ec03296093629185498801" // Commented out as it causes errors
    };

    const ERC20_ABI = [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) public view returns (uint256)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)"
    ];

    for (const [name, tokenAddress] of Object.entries(tokens)) {
        try {
            const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

            console.log(`Checking ${name} (${tokenAddress})...`);

            // Force Approve Logic: Always approve Max Uint regardless of current allowance
            console.log(`  🔄 Force Approving Max Uint...`);

            // For USDT SafeApprove pattern (if required, though usually not on Polygon standard tokens)
            // We can try strictly setting to 0 then Max if it fails, but let's blindly set Max first.
            const tx = await tokenContract.approve(spenderAddress, ethers.MaxUint256);
            console.log(`  Sent Tx: ${tx.hash}`);
            await tx.wait();
            console.log(`  ✅ Approved!`);

            const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
            const decimals = await tokenContract.decimals();
            const formattedAllowance = ethers.formatUnits(currentAllowance, decimals);
            console.log(`  New Allowance: ${formattedAllowance}`);

        } catch (error) {
            console.error(`  ❌ Failed to verify/approve ${name}: ${error.message}`);
        }
    }

    console.log("All tokens checked/approved.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
