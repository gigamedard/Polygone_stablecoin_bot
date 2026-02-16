// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./FlashArbitrage.sol";

contract GuildVault is Ownable, ReentrancyGuard {
    IERC20 public asset;
    FlashArbitrage public flashArbitrage;
    address public bot;

    uint256 public accumulatedFees;
    event FeesDistributed(address indexed owner, uint256 amount);

    uint256 public constant MAX_CAPACITY_USD = 1000 * 1e18; 
    uint256 public totalAssets;
    uint256 public totalShares;
    
    mapping(address => uint256) public userShares;

    event ShadowArised(address indexed user, uint256 amount, uint256 shares);
    event RaidCompleted(uint256 profit);
    event BotUpdated(address newBot);

    modifier onlyBot() {
        require(msg.sender == bot, "Not the Bot");
        _;
    }

    constructor(address _asset, address _flashArbitrage, address _bot) Ownable(msg.sender) {
        asset = IERC20(_asset);
        flashArbitrage = FlashArbitrage(_flashArbitrage);
        bot = _bot;
    }

    function setBot(address _bot) external onlyOwner {
        bot = _bot;
        emit BotUpdated(_bot);
    }

    // Deposit users stablecoins
    function arise(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        
        // Use the constant which is set to 18 decimals (1000 * 1e18)
        // Note: If asset is USDC (6 decimals), this constant needs to be adjusted or normalized.
        // For this demo/test with MockERC20 (18 decimals), this is correct.
        require(totalAssets + amount <= MAX_CAPACITY_USD, "Guild Full (Max $1000)"); 

        asset.transferFrom(msg.sender, address(this), amount);

        uint256 shares;
        if (totalAssets == 0) {
            shares = amount;
        } else {
            shares = (amount * totalShares) / totalAssets;
        }

        userShares[msg.sender] += shares;
        totalShares += shares;
        totalAssets += amount;

        emit ShadowArised(msg.sender, amount, shares);
    }

    // Execute Arbitrage Raid
    function executeRaid(uint256 amount, bytes calldata data) external onlyBot nonReentrant {
        require(amount <= totalAssets, "Insufficient funds");

        (uint256 minAmountOut, FlashArbitrage.SwapStep[] memory steps) = abi.decode(data, (uint256, FlashArbitrage.SwapStep[]));

        // Approve FlashArbitrage to spend tokens
        asset.approve(address(flashArbitrage), amount);

        uint256 balanceBefore = asset.balanceOf(address(this));

        // Call FlashArbitrage
        flashArbitrage.executeArbitrage(amount, minAmountOut, steps);

        uint256 balanceAfter = asset.balanceOf(address(this));
        require(balanceAfter > balanceBefore, "Raid failed: No profit");

        uint256 profit = balanceAfter - balanceBefore;
        
        // Fee Logic: 10% to Owner, 90% to Pool
        uint256 fee = (profit * 10) / 100;
        uint256 netProfit = profit - fee;

        accumulatedFees += fee;
        totalAssets += netProfit; // Auto-compounding user share

        emit RaidCompleted(profit);
    }

    // Distribute accumulated fees to Owner
    function distributeFees() external nonReentrant {
        require(accumulatedFees > 0, "No fees to distribute");
        
        uint256 amount = accumulatedFees;
        accumulatedFees = 0;

        asset.transfer(owner(), amount);
        emit FeesDistributed(owner(), amount);
    }

    // Allow user to withdraw
    function withdraw(uint256 shares) external nonReentrant {
        require(userShares[msg.sender] >= shares, "Insufficient shares");

        // Calculate amount based on totalAssets (which already excludes fees)
        uint256 amount = (shares * totalAssets) / totalShares;
        
        userShares[msg.sender] -= shares;
        totalShares -= shares;
        totalAssets -= amount;

        asset.transfer(msg.sender, amount);
    }
}
