// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

contract MockSwapRouter {
    uint256 public returnAmount;

    function setReturnAmount(uint256 _amount) external {
        returnAmount = _amount;
    }

    function exactInputSingle(ISwapRouter.ExactInputSingleParams calldata params) external returns (uint256) {
        // Transfer tokenIn from sender to this contract (simulating swap pull)
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        // Transfer tokenOut to recipient
        IERC20(params.tokenOut).transfer(params.recipient, returnAmount);
        return returnAmount;
    }
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}
