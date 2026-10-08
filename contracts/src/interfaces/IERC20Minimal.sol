// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The slice of ERC-20 that SettleOnce touches.
/// @dev On Arc, USDC's ERC-20 interface lives at 0x3600000000000000000000000000000000000000
///      and uses 6 decimals. It shares one balance with native USDC (18 decimals, used for gas).
interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function decimals() external view returns (uint8);
}
