const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log(`Account: ${deployer.address}`);
    console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH/MATIC`);

    const network = await hre.ethers.provider.getNetwork();
    console.log(`Chain ID: ${network.chainId}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
