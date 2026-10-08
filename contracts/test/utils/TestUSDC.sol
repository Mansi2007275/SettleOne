// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Test-only 6-decimal token used by the unit tests. It is never deployed by the scripts:
///         the real deployment is hard-wired to Arc's USDC at 0x3600…0000.
/// @dev `failMode` lets tests force the transfer failures a real token can produce.
contract TestUSDC {
    enum FailMode {
        None,
        ReturnFalse,
        Revert,
        NoReturnValue
    }

    string public constant name = "Test USDC";
    string public constant symbol = "tUSDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocked;
    FailMode public failMode;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error Blocked(address account);
    error InsufficientBalance();
    error InsufficientAllowance();
    error ForcedRevert();

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function setFailMode(FailMode mode) external {
        failMode = mode;
    }

    /// @dev Mirrors Arc's runtime blocklist: a transfer to or from a blocked account reverts.
    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failMode == FailMode.ReturnFalse) return false;
        if (failMode == FailMode.Revert) revert ForcedRevert();
        if (blocked[from]) revert Blocked(from);
        if (blocked[to]) revert Blocked(to);

        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();
        if (balanceOf[from] < amount) revert InsufficientBalance();

        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);

        if (failMode == FailMode.NoReturnValue) {
            assembly ("memory-safe") {
                return(0, 0)
            }
        }
        return true;
    }
}
