// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./FlashArbitrage.sol";

contract MockFlashArbitrage is FlashArbitrage {
    constructor(address _router) FlashArbitrage(_router, address(0)) {}

    function executeArbitrage(
        uint256 amount,
        uint256 minAmountOut,
        SwapStep[] calldata steps
    ) external override {
        // Mock Profit: Just send back amount + profit
        // Assume the test sends enough tokens to this contract beforehand to simulate profit
        IERC20(steps[0].tokenIn).transferFrom(msg.sender, address(this), amount);
        
        // Return amount + 10% profit mock
        uint256 profit = amount / 10;
        IERC20(steps[0].tokenIn).transfer(msg.sender, amount + profit);
    }
}
