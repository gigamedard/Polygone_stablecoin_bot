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
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
