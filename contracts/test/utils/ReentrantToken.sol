// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SettleOnce} from "../../src/SettleOnce.sol";

/// @notice Test-only hostile token that tries to re-enter SettleOnce during transferFrom.
contract ReentrantToken {
    SettleOnce public target;
    bytes32 public reenterKey;

    function setTarget(SettleOnce target_, bytes32 key) external {
        target = target_;
        reenterKey = key;
    }

    function transferFrom(address, address to, uint256 amount) external returns (bool) {
        target.payOnce(reenterKey, to, amount);
        return true;
    }

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }

    function allowance(address, address) external pure returns (uint256) {
        return type(uint256).max;
    }

    function decimals() external pure returns (uint8) {
        return 6;
    }
}
