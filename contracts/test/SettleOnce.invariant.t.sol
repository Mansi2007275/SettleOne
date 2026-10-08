// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SettleOnce} from "../src/SettleOnce.sol";
import {IERC20Minimal} from "../src/interfaces/IERC20Minimal.sol";
import {TestUSDC} from "./utils/TestUSDC.sol";

/// @notice Drives random payOnce attempts (duplicates, conflicts, failing transfers) from a few payers
///         over a small key space, and tracks what actually settled.
contract SettleOnceHandler is Test {
    SettleOnce public immutable settle;
    TestUSDC public immutable usdc;

    address[3] public payers = [address(0xA11CE), address(0xB0B), address(0xCA401)];
    address[3] public recipients = [address(0xD00D), address(0xFEED), address(0xBEEF)];
    bytes32[4] public keys = [keccak256("INV-1"), keccak256("INV-2"), keccak256("INV-3"), keccak256("INV-4")];

    mapping(address => mapping(bytes32 => uint256)) public successCount;
    mapping(address => uint256) public expectedReceived;
    uint256 public totalSettled;

    constructor(SettleOnce settle_, TestUSDC usdc_) {
        settle = settle_;
        usdc = usdc_;
        for (uint256 i; i < payers.length; ++i) {
            usdc.mint(payers[i], 1_000_000 * 1e6);
            vm.prank(payers[i]);
            usdc.approve(address(settle), type(uint256).max);
        }
    }

    function pay(uint256 payerSeed, uint256 keySeed, uint256 recipientSeed, uint256 amount, uint256 failSeed)
        external
    {
        address payer = payers[payerSeed % payers.length];
        bytes32 key = keys[keySeed % keys.length];
        address to = recipients[recipientSeed % recipients.length];
        amount = bound(amount, 1, 50 * 1e6);

        // One attempt in five hits a failing transfer.
        usdc.setFailMode(failSeed % 5 == 0 ? TestUSDC.FailMode.ReturnFalse : TestUSDC.FailMode.None);

        uint256 before = usdc.balanceOf(to);
        vm.prank(payer);
        try settle.payOnce(key, to, amount) {
            successCount[payer][key] += 1;
            expectedReceived[to] += amount;
            totalSettled += amount;
            assertEq(usdc.balanceOf(to), before + amount);
        } catch {
            assertEq(usdc.balanceOf(to), before, "failed attempt moved funds");
        }
        usdc.setFailMode(TestUSDC.FailMode.None);
    }

    function payersLength() external view returns (uint256) {
        return payers.length;
    }

    function keysLength() external view returns (uint256) {
        return keys.length;
    }

    function recipientsLength() external view returns (uint256) {
        return recipients.length;
    }
}

contract SettleOnceInvariantTest is Test {
    SettleOnce internal settle;
    TestUSDC internal usdc;
    SettleOnceHandler internal handler;

    function setUp() public {
        usdc = new TestUSDC();
        settle = new SettleOnce(IERC20Minimal(address(usdc)));
        handler = new SettleOnceHandler(settle, usdc);
        targetContract(address(handler));
    }

    /// Each (payer, key) settles at most once, and the record matches what was paid.
    function invariant_atMostOneSettlementPerPayerAndKey() public view {
        for (uint256 p; p < handler.payersLength(); ++p) {
            address payer = handler.payers(p);
            for (uint256 k; k < handler.keysLength(); ++k) {
                bytes32 key = handler.keys(k);
                uint256 n = handler.successCount(payer, key);
                assertLe(n, 1, "a key settled twice");
                assertEq(settle.isPaid(payer, key), n == 1, "record disagrees with history");
            }
        }
    }

    /// Recipients hold exactly what successful settlements sent them; SettleOnce holds nothing.
    function invariant_balancesMatchSettlements() public view {
        uint256 sum;
        for (uint256 r; r < handler.recipientsLength(); ++r) {
            address to = handler.recipients(r);
            assertEq(usdc.balanceOf(to), handler.expectedReceived(to));
            sum += usdc.balanceOf(to);
        }
        assertEq(sum, handler.totalSettled());
        assertEq(usdc.balanceOf(address(settle)), 0, "contract must never custody funds");
    }
}
