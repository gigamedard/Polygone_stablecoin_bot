const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);

    // Polygon Mainnet Addresses
    const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const CURVE_AAVE_POOL = "0x445FE580eF8d70FF569aB36e80c647af338db351"; // am3CRV Pool

    const FlashArbitrage = await hre.ethers.getContractFactory("FlashArbitrage");
    const flashArbitrage = await FlashArbitrage.deploy(UNISWAP_V3_ROUTER, CURVE_AAVE_POOL);

    await flashArbitrage.waitForDeployment();

    const address = await flashArbitrage.getAddress();

    console.log(`FlashArbitrage deployed to: ${address}`);
    console.log("Don't forget to update FLASH_ARBITRAGE_ADDRESS in your .env file!");

    // Deploy GuildFactory (if exists) or just deploying sample GuildVaults manually for testing
    // Checking if GuildFactory artifact exists... Assuming not from previous steps, so let's deploy a GuildVault directly.
    // Actually, checking task.md, we didn't explicitly create GuildFactory.sol?
    // Let's check file list. If no factory, we just deploy a Vault.

    // Deploy a test Asset (MockERC20) for localhost
    let assetAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // Default USDC on Polygon
    if (hre.network.name === "localhost") {
        const MockToken = await hre.ethers.getContractFactory("MockERC20");
        const mockToken = await MockToken.deploy();
        await mockToken.waitForDeployment();
        assetAddress = await mockToken.getAddress();
        console.log(`Mock USDC deployed to: ${assetAddress}`);
    }

    const GuildVault = await hre.ethers.getContractFactory("GuildVault");

    // Create Shadow Igris Guild
    const guild1 = await GuildVault.deploy(assetAddress, address, deployer.address); // Bot = Deployer for now
    await guild1.waitForDeployment();
    console.log(`Guild 'Shadow Igris' deployed to: ${await guild1.getAddress()}`);

    // Create Shadow Tank Guild
    const guild2 = await GuildVault.deploy(assetAddress, address, deployer.address);
    await guild2.waitForDeployment();
    console.log(`Guild 'Shadow Tank' deployed to: ${await guild2.getAddress()}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
