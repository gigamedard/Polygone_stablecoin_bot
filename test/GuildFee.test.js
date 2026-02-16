const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GuildVault Fee Logic", function () {
    let owner, user, bot;
    let asset, flashArbitrage, guildVault;

    beforeEach(async function () {
        [owner, user, bot] = await ethers.getSigners();

        // 1. Deploy Mock Asset
        const MockToken = await ethers.getContractFactory("MockERC20");
        asset = await MockToken.deploy();

        // 2. Deploy Mock FlashArbitrage
        const MockFA = await ethers.getContractFactory("MockFlashArbitrage");
        flashArbitrage = await MockFA.deploy(ethers.ZeroAddress); // Router address doesn't matter for mock

        // 3. Deploy GuildVault
        const GuildVault = await ethers.getContractFactory("GuildVault");
        guildVault = await GuildVault.deploy(await asset.getAddress(), await flashArbitrage.getAddress(), bot.address);

        // 4. Setup Funding
        // Fund User
        await asset.mint(user.address, ethers.parseUnits("1000", 18));
        // Fund FlashArbitrage with "Profit" (so it can pay back more)
        await asset.mint(await flashArbitrage.getAddress(), ethers.parseUnits("1000", 18));
    });

    it("Should deduct 10% fee from profit and allow owner to distribute it", async function () {
        // 1. User Deposits
        const depositAmount = ethers.parseUnits("100", 18);
        await asset.connect(user).approve(await guildVault.getAddress(), depositAmount);
        await guildVault.connect(user).arise(depositAmount);

        expect(await guildVault.totalAssets()).to.equal(depositAmount);

        // 2. Execute Raid (Bot)
        // Mock Data: checks decode but MockFlashArbitrage ignores steps, just returns +10%
        // We send 100, receive 110. Profit = 10. Fee = 1. Net Profit = 9.
        const raidAmount = ethers.parseUnits("50", 18); // Use half assets
        const steps = [{
            protocol: ethers.ZeroAddress,
            data: "0x",
            tokenIn: await asset.getAddress(),
            tokenOut: await asset.getAddress()
        }];

        const coder = ethers.AbiCoder.defaultAbiCoder();
        const payload = coder.encode(
            ["uint256", "tuple(address protocol, bytes data, address tokenIn, address tokenOut)[]"],
            [0, steps] // minAmountOut ignored by mock
        );

        // Check balances before
        const vaultBalBefore = await asset.balanceOf(await guildVault.getAddress());

        // Execute
        await guildVault.connect(bot).executeRaid(raidAmount, payload);

        // Check Profit Logic
        // FlashArbitrage mock returns amount + (amount/10)
        // Input 50 -> Returns 55. Profit 5.
        // Fee = 5 * 10% = 0.5
        // Net Profit = 4.5
        // Total Assets = 100 (initial) + 4.5 = 104.5

        const expectedFee = ethers.parseUnits("0.5", 18); // 10% of 5
        const expectedAssets = ethers.parseUnits("104.5", 18);

        expect(await guildVault.accumulatedFees()).to.equal(expectedFee);
        expect(await guildVault.totalAssets()).to.equal(expectedAssets);

        // 3. Distribute Fees
        const ownerBalBefore = await asset.balanceOf(owner.address);
        await guildVault.connect(owner).distributeFees();
        const ownerBalAfter = await asset.balanceOf(owner.address);

        expect(ownerBalAfter - ownerBalBefore).to.equal(expectedFee);
        expect(await guildVault.accumulatedFees()).to.equal(0);
    });
});
