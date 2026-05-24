// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

interface ICurveFi {
    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);

    // Some curve pools use uint256 for indices
    function exchange(
        uint256 i,
        uint256 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);

    // For Aave Pool (Underlying Swaps)
    function exchange_underlying(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);
}

contract FlashArbitrage is Ownable, Pausable {
    ISwapRouter public immutable uniswapRouter;
    ICurveFi public immutable curveRouter; // Or specific pool address passed in params

    event OpenSwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    constructor(address _uniswapRouter, address _curveRouter) Ownable(msg.sender) {
        uniswapRouter = ISwapRouter(_uniswapRouter);
        curveRouter = ICurveFi(_curveRouter);
    }

    struct SwapStep {
        address protocol; // 0 for Uniswap, 1 for Curve
        bytes data; // Encoded data for the swap
        address tokenIn;
        address tokenOut;
    }

    // Main execution function
    function executeArbitrage(
        uint256 amountIn,
        uint256 minAmountOut,
        SwapStep[] calldata steps
    ) external onlyOwner whenNotPaused {
        uint256 currentAmount = amountIn;
        IERC20(steps[0].tokenIn).transferFrom(msg.sender, address(this), amountIn);

        for (uint256 i = 0; i < steps.length; i++) {
            SwapStep memory step = steps[i];

            // Approve token if needed
            // Optimization: checking allowance is gas costly, maybe just approve max
            if (IERC20(step.tokenIn).allowance(address(this), step.protocol) < currentAmount) {
                 IERC20(step.tokenIn).approve(step.protocol, type(uint256).max);
            }

            if (step.protocol == address(uniswapRouter)) {
                ISwapRouter.ExactInputSingleParams memory params = abi.decode(step.data, (ISwapRouter.ExactInputSingleParams));
                params.amountIn = currentAmount;
                params.recipient = address(this);

                currentAmount = uniswapRouter.exactInputSingle(params);
            } else {
                (int128 iIdx, int128 jIdx, address poolAddress) = abi.decode(step.data, (int128, int128, address));

                if (IERC20(step.tokenIn).allowance(address(this), poolAddress) < currentAmount) {
                     IERC20(step.tokenIn).approve(poolAddress, type(uint256).max);
                }

                ICurveFi curvePool = ICurveFi(poolAddress);
                currentAmount = curvePool.exchange_underlying(iIdx, jIdx, currentAmount, 0);
            }
        }

        require(currentAmount >= minAmountOut, "Slippage too high / No profit");

        IERC20(steps[steps.length - 1].tokenOut).transfer(msg.sender, currentAmount);

        emit OpenSwapExecuted(steps[0].tokenIn, steps[steps.length - 1].tokenOut, amountIn, currentAmount);
    }

    function setPaused(bool _paused) external onlyOwner {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    function recoverToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(msg.sender, amount);
    }
}
