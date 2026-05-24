const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FlashArbitrage - Open Swap", function () {
    let flashArbitrage;
    let owner;
    let token6;  // Mimics USDC (6 decimals)
    let token18; // Mimics DAI (18 decimals)
    let mockRouter;

    const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const CURVE_ROUTER = "0x1d8b86e3D88cDb2d34688e87E72F388Cb541B7C8";

    // Deploy mock tokens and mock router
    before(async function () {
        [owner] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
        token6 = await MockERC20.deploy("USD Coin", "USDC", 6);
        token18 = await MockERC20.deploy("Dai Stablecoin", "DAI", 18);
        await token6.waitForDeployment();
        await token18.waitForDeployment();

        const MockSwapRouter = await ethers.getContractFactory("contracts/mocks/MockSwapRouter.sol:MockSwapRouter");
        mockRouter = await MockSwapRouter.deploy();
        await mockRouter.waitForDeployment();

        const FlashArbitrage = await ethers.getContractFactory("FlashArbitrage");
        flashArbitrage = await FlashArbitrage.deploy(await mockRouter.getAddress(), CURVE_ROUTER);
        await flashArbitrage.waitForDeployment();

        // Mint tokens to owner and fund the mock router with tokenOut
        const amount6 = ethers.parseUnits("10000", 6);
        const amount18 = ethers.parseUnits("10000", 18);
        await token6.mint(owner.address, amount6);
        await token18.mint(owner.address, amount18);
        // Fund mock router with tokenOut so it can "swap" tokens
        await token18.mint(await mockRouter.getAddress(), amount18);
    });

    it("Should set the right owner", async function () {
        expect(await flashArbitrage.owner()).to.equal(owner.address);
    });

    it("Should allow owner to toggle pause (Kill-switch)", async function () {
        await flashArbitrage.setPaused(true);
        expect(await flashArbitrage.paused()).to.equal(true);

        await expect(
            flashArbitrage.executeArbitrage(100, 0, [])
        ).to.be.revertedWithCustomError(flashArbitrage, "EnforcedPause");

        await flashArbitrage.setPaused(false);
        expect(await flashArbitrage.paused()).to.equal(false);
    });

    it("Should execute open swap with cross-decimal tokens and emit OpenSwapExecuted", async function () {
        const amountIn = ethers.parseUnits("1000", 6); // 1000 USDC (6 decimals)
        const expectedOut = ethers.parseUnits("998", 18); // ~998 DAI (18 decimals)

        // Configure mock router to return expectedOut
        await mockRouter.setReturnAmount(expectedOut);

        // Approve contract to spend USDC
        await token6.connect(owner).approve(await flashArbitrage.getAddress(), amountIn);

        // Build encoded swap data (ExactInputSingleParams)
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const data = abiCoder.encode(
            ["tuple(address,address,uint24,address,uint256,uint256,uint256,uint160)"],
            [[await token6.getAddress(), await token18.getAddress(), 500, await flashArbitrage.getAddress(), 0, amountIn, 0, 0]]
        );

        const step = {
            protocol: await mockRouter.getAddress(),
            data: data,
            tokenIn: await token6.getAddress(),
            tokenOut: await token18.getAddress(),
        };

        // minAmountOut in output token's decimals (18)
        const minAmountOut = ethers.parseUnits("990", 18);

        const tx = await flashArbitrage.executeArbitrage(amountIn, minAmountOut, [step]);
        await tx.wait();

        // Verify NEW event is emitted — this will FAIL with current contract
        // because current contract emits ArbitrageExecuted, not OpenSwapExecuted
        await expect(tx)
            .to.emit(flashArbitrage, "OpenSwapExecuted")
            .withArgs(await token6.getAddress(), await token18.getAddress(), amountIn, expectedOut);

        // Verify DAI transferred to owner (output token balance increase)
        const ownerBalance = await token18.balanceOf(owner.address);
        expect(ownerBalance).to.equal(ethers.parseUnits("10998", 18)); // 10000 initial + 998 received - 0 lost
    });

    it("Should revert when minAmountOut exceeds output (slippage protection in output decimals)", async function () {
        const amountIn = ethers.parseUnits("500", 6);
        const expectedOut = ethers.parseUnits("499", 18);
        await mockRouter.setReturnAmount(expectedOut);

        await token6.connect(owner).approve(await flashArbitrage.getAddress(), amountIn);

        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const data = abiCoder.encode(
            ["tuple(address,address,uint24,address,uint256,uint256,uint256,uint160)"],
            [[await token6.getAddress(), await token18.getAddress(), 500, await flashArbitrage.getAddress(), 0, amountIn, 0, 0]]
        );

        const step = {
            protocol: await mockRouter.getAddress(),
            data: data,
            tokenIn: await token6.getAddress(),
            tokenOut: await token18.getAddress(),
        };

        // minAmountOut higher than actual output (both in 18 decimals)
        const impossibleMin = ethers.parseUnits("500", 18); // 500 DAI, but only 499 received

        await expect(
            flashArbitrage.executeArbitrage(amountIn, impossibleMin, [step])
        ).to.be.revertedWith("Slippage too high / No profit");
    });

    it("Should emit OpenSwapExecuted with correct token addresses (no cross-decimal arithmetic)", async function () {
        const amountIn = ethers.parseUnits("100", 6);
        const expectedOut = ethers.parseUnits("99", 18);
        await mockRouter.setReturnAmount(expectedOut);

        await token6.connect(owner).approve(await flashArbitrage.getAddress(), amountIn);

        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const data = abiCoder.encode(
            ["tuple(address,address,uint24,address,uint256,uint256,uint256,uint160)"],
            [[await token6.getAddress(), await token18.getAddress(), 500, await flashArbitrage.getAddress(), 0, amountIn, 0, 0]]
        );

        const step = {
            protocol: await mockRouter.getAddress(),
            data: data,
            tokenIn: await token6.getAddress(),
            tokenOut: await token18.getAddress(),
        };

        const tx = await flashArbitrage.executeArbitrage(amountIn, 0, [step]);
        await tx.wait();

        // Verify event exists and contains token addresses + amounts
        await expect(tx)
            .to.emit(flashArbitrage, "OpenSwapExecuted")
            .withArgs(await token6.getAddress(), await token18.getAddress(), amountIn, expectedOut);

        // Verify the old ArbitrageExecuted event is NOT in the ABI (removed)
        const abi = JSON.parse(flashArbitrage.interface.formatJson());
        const eventNames = abi.filter((x) => x.type === "event").map((x) => x.name);
        expect(eventNames).to.not.include("ArbitrageExecuted");
        expect(eventNames).to.include("OpenSwapExecuted");
    });

    describe("Event decoding for Executor", function () {
        const Executor = require("../engine/executor");

        it("RED: _parseOpenSwapExecuted should exist on executor (missing in current code)", async function () {
            const executor = new Executor();
            // This will FAIL now (undefined) → PASS after implementation
            expect(executor._parseOpenSwapExecuted).to.be.a("function");
        });

        it("should decode OpenSwapExecuted event from a real tx receipt", async function () {
            const amountIn = ethers.parseUnits("250", 6);
            const expectedOut = ethers.parseUnits("249.5", 18);
            await mockRouter.setReturnAmount(expectedOut);

            await token6.connect(owner).approve(await flashArbitrage.getAddress(), amountIn);

            const abiCoder = ethers.AbiCoder.defaultAbiCoder();
            const data = abiCoder.encode(
                ["tuple(address,address,uint24,address,uint256,uint256,uint256,uint160)"],
                [[await token6.getAddress(), await token18.getAddress(), 500, await flashArbitrage.getAddress(), 0, amountIn, 0, 0]]
            );
            const step = {
                protocol: await mockRouter.getAddress(),
                data: data,
                tokenIn: await token6.getAddress(),
                tokenOut: await token18.getAddress(),
            };

            const minAmountOut = ethers.parseUnits("248", 18);
            const tx = await flashArbitrage.executeArbitrage(amountIn, minAmountOut, [step]);
            const receipt = await tx.wait();

            // Parse event using the executor's method (will be added)
            const executor = new Executor();
            const parsed = executor._parseOpenSwapExecuted(receipt, await flashArbitrage.getAddress());

            expect(parsed.tokenIn).to.equal(await token6.getAddress());
            expect(parsed.tokenOut).to.equal(await token18.getAddress());
            expect(parsed.amountIn).to.equal(amountIn);
            expect(parsed.amountOut).to.equal(expectedOut);
        });

        it("should reject a receipt with no OpenSwapExecuted event", async function () {
            const executor = new Executor();
            const fakeReceipt = { logs: [] };

            expect(() => executor._parseOpenSwapExecuted(fakeReceipt, "0x0000000000000000000000000000000000000001"))
                .to.throw("OpenSwapExecuted event not found in receipt");
        });
    });
});
