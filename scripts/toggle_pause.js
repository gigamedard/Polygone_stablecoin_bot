const hre = require("hardhat");
require("dotenv").config();

async function main() {
    const [owner] = await hre.ethers.getSigners();
    const contractAddress = process.env.FLASH_ARBITRAGE_ADDRESS;

    if (!contractAddress) {
        console.error("Please set FLASH_ARBITRAGE_ADDRESS in .env");
        process.exit(1);
    }

    const FlashArbitrage = await hre.ethers.getContractFactory("FlashArbitrage");
    const contract = FlashArbitrage.attach(contractAddress);

    const isPaused = await contract.paused();
    console.log(`Current State: ${isPaused ? "PAUSED 🛑" : "ACTIVE ✅"}`);

    // Toggle
    const newState = !isPaused;
    console.log(`Switching to: ${newState ? "PAUSED" : "ACTIVE"}...`);

    const tx = await contract.setPaused(newState);
    await tx.wait();

    console.log(`Success! New State: ${newState ? "PAUSED 🛑" : "ACTIVE ✅"}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
