const hre = require("hardhat");

async function main() {
    const UNISWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const CURVE_3POOL = "0x445FE580eF8d70FF569aB36e80c647af338db351";

    const FlashArbitrage = await hre.ethers.getContractFactory("FlashArbitrage");
    const contract = await FlashArbitrage.deploy(UNISWAP_ROUTER, CURVE_3POOL);
    await contract.waitForDeployment();

    const addr = await contract.getAddress();
    console.log("FlashArbitrage deployed to:", addr);
    console.log(`Add to .env: FLASH_ARBITRAGE_ADDRESS=${addr}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
