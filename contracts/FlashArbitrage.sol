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
}

contract FlashArbitrage is Ownable, Pausable {
    ISwapRouter public immutable uniswapRouter;
    ICurveFi public immutable curveRouter; // Or specific pool address passed in params

    event ArbitrageExecuted(uint256 amountIn, uint256 amountOut, uint256 profit);

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

            uint256 balanceBefore = IERC20(step.tokenOut).balanceOf(address(this));

            if (step.protocol == address(uniswapRouter)) {
                // Uniswap V3 Swap
                ISwapRouter.ExactInputSingleParams memory params = abi.decode(step.data, (ISwapRouter.ExactInputSingleParams));
                // Override amountIn to use current balance/amount
                params.amountIn = currentAmount;
                // Recipient is this contract for intermediate steps, or msg.sender for final?
                // Let's assume all intermediate stay in contract until end
                params.recipient = address(this); 
                
                currentAmount = uniswapRouter.exactInputSingle(params);
            } else {
                // Curve Swap
                // Decode params based on curve interface
                // This is tricky as Curve interfaces vary. Start with basic Exchange.
                // Assuming data contains (int128 i, int128 j, address pool)
                (int128 i, int128 j, address pool) = abi.decode(step.data, (int128, int128, address));
                
                // Approve pool
                if (IERC20(step.tokenIn).allowance(address(this), pool) < currentAmount) {
                     IERC20(step.tokenIn).approve(pool, type(uint256).max);
                }

                ICurveFi curvePool = ICurveFi(pool);
                // Call exchange. Try catch or assume correct interface?
                // For simplicity, assume standardized pool interface here or use a dedicated adapter.
                // We use the interface defined above.
                currentAmount = curvePool.exchange(i, j, currentAmount, 0); // 0 min_dy for intermediate, we check total slippage at end
            }

            uint256 balanceAfter = IERC20(step.tokenOut).balanceOf(address(this));
            require(balanceAfter - balanceBefore == currentAmount, "Output mismatch");
        }

        require(currentAmount >= minAmountOut, "Slippage too high / No profit");

        // Transfer profit to owner
        IERC20(steps[steps.length - 1].tokenOut).transfer(msg.sender, currentAmount);
        
        emit ArbitrageExecuted(amountIn, currentAmount, currentAmount > amountIn ? currentAmount - amountIn : 0);
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
