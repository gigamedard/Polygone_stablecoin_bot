#!/bin/bash

# Deploy Smart Contracts
echo "Deploying Smart Contracts..."
npx hardhat compile
# Assuming a deploy script exists or running inline script
# Creating a temporary deploy script for Hardhat
cat <<EOF > scripts/deploy_system.js
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy FlashArbitrage
  // Need Router addresses for Polygon
  const UNISWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const CURVE_POOL = "0x445FE580eF8d70FF569aB36e80c647af338db351"; 

  const FlashArbitrage = await hre.ethers.getContractFactory("FlashArbitrage");
  const flashArbitrage = await FlashArbitrage.deploy(UNISWAP_ROUTER, CURVE_POOL);
  await flashArbitrage.waitForDeployment();
  console.log("FlashArbitrage deployed to:", await flashArbitrage.getAddress());

  // 2. Deploy GuildFactory
  const GuildFactory = await hre.ethers.getContractFactory("GuildFactory");
  // Default Bot is deployer for now
  const guildFactory = await GuildFactory.deploy(await flashArbitrage.getAddress(), deployer.address);
  await guildFactory.waitForDeployment();
  console.log("GuildFactory deployed to:", await guildFactory.getAddress());
  
  // 3. Create a Test Guild
  // USDC Address
  const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  await guildFactory.createGuild("Shadow Igris", USDC);
  console.log("Created Test Guild 'Shadow Igris'");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
EOF

npx hardhat run scripts/deploy_system.js --network localhost

# Start Laravel (Mock)
echo "Starting Laravel Server..."
cd web-app
# php artisan serve --port=8000 &
cd ..

# Start Bot
echo "Starting Bot Engine..."
# node engine/executor.js
