const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FlashArbitrage", function () {
    let flashArbitrage;
    let owner;
    let signer;

    // Polygon Mainnet Addresses
    const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const CURVE_ROUTER = "0x1d8b86e3D88cDb2d34688e87E72F388Cb541B7C8"; // Generic Curve Address, might need specific pool
    const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const USDT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
    const WMATIC = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";

    // Whale to impersonate for funding
    const USDC_WHALE = "0xe7804c37c131661F34FdF459771E55906A901475";

    before(async function () {
        [owner] = await ethers.getSigners();

        // Deploy Contract
        const FlashArbitrage = await ethers.getContractFactory("FlashArbitrage");
        flashArbitrage = await FlashArbitrage.deploy(UNISWAP_V3_ROUTER, CURVE_ROUTER);
        await flashArbitrage.waitForDeployment();

        console.log("FlashArbitrage deployed to:", await flashArbitrage.getAddress());
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

    // Note: Full functional test requires forking with valid pools and liquidity
    // The following is a placeholder for the logic test if we had a valid path
    it.skip("Should execute a swap step (Requires Forking & Liquidity)", async function () {
        // Impersonate Whale to get USDC
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [USDC_WHALE],
        });
        const whaleSigner = await ethers.getSigner(USDC_WHALE);
        const usdcContract = await ethers.getContractAt("IERC20", USDC);

        const amount = ethers.parseUnits("1000", 6);
        await usdcContract.connect(whaleSigner).transfer(owner.address, amount);
        await usdcContract.connect(owner).approve(await flashArbitrage.getAddress(), amount);

        // Define a simple swap path (USDC -> USDT via Uniswap V3)
        // This is just to test the encoding and execution logic, profit not guaranteed
        const poolFee = 500; // 0.05%
        const swapParams = {
            tokenIn: USDC,
            tokenOut: USDT,
            fee: poolFee,
            recipient: await flashArbitrage.getAddress(),
            deadline: Date.now() + 1000,
            amountIn: amount,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0,
        };

        // ABI Encode params for ExactInputSingleParams
        const ISwapRouter = await ethers.getContractAt("ISwapRouter", UNISWAP_V3_ROUTER);
        // We manually encode since we are passing bytes to our contract
        // struct ExactInputSingleParams {
        //   address tokenIn;
        //   address tokenOut;
        //   uint24 fee;
        //   address recipient;
        //   uint256 deadline;
        //   uint256 amountIn;
        //   uint256 amountOutMinimum;
        //   uint160 sqrtPriceLimitX96;
        // }

        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const data = abiCoder.encode(
            [
                "tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)"
            ],
            [[USDC, USDT, poolFee, await flashArbitrage.getAddress(), Date.now() + 10000, amount, 0, 0]]
        );

        const step = {
            protocol: UNISWAP_V3_ROUTER,
            data: data,
            tokenIn: USDC,
            tokenOut: USDT
        };

        await expect(flashArbitrage.executeArbitrage(amount, 0, [step])).to.not.be.reverted;
    });
});
