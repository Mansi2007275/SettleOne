// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SettleOnce} from "../src/SettleOnce.sol";
import {IERC20Minimal} from "../src/interfaces/IERC20Minimal.sol";
import {TestUSDC} from "./utils/TestUSDC.sol";
import {ReentrantToken} from "./utils/ReentrantToken.sol";

contract SettleOnceTest is Test {
    event InvoicePaid(address indexed payer, bytes32 indexed invoiceKey, address indexed recipient, uint256 amount);

    /// 0.10 USDC in ERC-20 base units (6 decimals).
    uint256 internal constant TEN_CENTS = 100_000;

    SettleOnce internal settle;
    TestUSDC internal usdc;

    address internal payer = makeAddr("payer");
    address internal vendor = makeAddr("vendor");
    address internal otherVendor = makeAddr("otherVendor");
    address internal stranger = makeAddr("stranger");

    bytes32 internal key;

    function setUp() public {
        usdc = new TestUSDC();
        settle = new SettleOnce(IERC20Minimal(address(usdc)));
        key = invoiceKey("VENDOR-7", "INV-1042");

        // Plenty of balance and allowance for MANY payments, so a duplicate can only be
        // stopped by SettleOnce itself, never by an exhausted allowance or balance.
        usdc.mint(payer, 1_000 * 1e6);
        vm.prank(payer);
        usdc.approve(address(settle), type(uint256).max);
    }

    /// Same derivation the web app uses (web/src/lib/invoice.ts):
    /// keccak256(abi.encode("settleonce.invoice.v1", normalizedVendorRef, normalizedInvoiceRef))
    function invoiceKey(string memory vendorRef, string memory invoiceRef) internal pure returns (bytes32) {
        return keccak256(abi.encode("settleonce.invoice.v1", vendorRef, invoiceRef));
    }

    function pay(bytes32 k, address to, uint256 amount) internal {
        vm.prank(payer);
        settle.payOnce(k, to, amount);
    }

    // ---------------------------------------------------------------- happy path

    function test_firstSettlement_movesExactAmountAndRecordsReceipt() public {
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.roll(4_242);
        vm.warp(1_760_000_000);
        pay(key, vendor, TEN_CENTS);

        assertEq(usdc.balanceOf(vendor), TEN_CENTS, "vendor gets exactly the invoice amount");
        assertEq(usdc.balanceOf(payer), payerBefore - TEN_CENTS, "payer debited exactly once");
        assertEq(usdc.balanceOf(address(settle)), 0, "contract never holds funds");

        SettleOnce.Settlement memory s = settle.receiptFor(payer, key);
        assertEq(s.recipient, vendor);
        assertEq(uint256(s.amount), TEN_CENTS);
        assertEq(uint256(s.paidAtBlock), 4_242);
        assertEq(uint256(s.paidAt), 1_760_000_000);
        assertTrue(settle.isPaid(payer, key));
    }

    function test_firstSettlement_emitsInvoicePaid() public {
        vm.expectEmit(true, true, true, true, address(settle));
        emit InvoicePaid(payer, key, vendor, TEN_CENTS);
        pay(key, vendor, TEN_CENTS);
    }

    function test_tenCentsIsOneHundredThousandBaseUnits() public view {
        assertEq(usdc.decimals(), 6);
        assertEq(TEN_CENTS, 10 ** usdc.decimals() / 10);
    }

    // ---------------------------------------------------------------- the guarantee

    /// A brand-new transaction (new nonce) for the same invoice, with ample funds and allowance.
    function test_duplicate_sameDetails_revertsAlreadyPaid() public {
        vm.roll(100);
        pay(key, vendor, TEN_CENTS);

        uint256 vendorBefore = usdc.balanceOf(vendor);
        uint256 payerBefore = usdc.balanceOf(payer);
        assertGe(usdc.allowance(payer, address(settle)), TEN_CENTS, "allowance is NOT the reason it fails");
        assertGe(payerBefore, TEN_CENTS, "balance is NOT the reason it fails");

        vm.roll(101);
        vm.expectRevert(abi.encodeWithSelector(SettleOnce.AlreadyPaid.selector, payer, key, uint64(100)));
        pay(key, vendor, TEN_CENTS);

        assertEq(usdc.balanceOf(vendor), vendorBefore, "no second payment");
        assertEq(usdc.balanceOf(payer), payerBefore, "payer not debited again");
    }

    function test_conflict_differentAmount_revertsAndKeepsOriginal() public {
        pay(key, vendor, TEN_CENTS);

        vm.expectRevert(
            abi.encodeWithSelector(SettleOnce.SettlementConflict.selector, payer, key, vendor, TEN_CENTS)
        );
        pay(key, vendor, 2 * TEN_CENTS);

        SettleOnce.Settlement memory s = settle.receiptFor(payer, key);
        assertEq(uint256(s.amount), TEN_CENTS, "original amount unchanged");
        assertEq(usdc.balanceOf(vendor), TEN_CENTS);
    }

    function test_conflict_differentRecipient_revertsAndKeepsOriginal() public {
        pay(key, vendor, TEN_CENTS);

        vm.expectRevert(
            abi.encodeWithSelector(SettleOnce.SettlementConflict.selector, payer, key, vendor, TEN_CENTS)
        );
        pay(key, otherVendor, TEN_CENTS);

        assertEq(settle.receiptFor(payer, key).recipient, vendor, "original recipient unchanged");
        assertEq(usdc.balanceOf(otherVendor), 0);
    }

    // ---------------------------------------------------------------- failures never burn a key

    function test_transferReturnsFalse_leavesUnpaid_thenRetrySucceeds() public {
        usdc.setFailMode(TestUSDC.FailMode.ReturnFalse);
        vm.expectRevert(SettleOnce.TransferFailed.selector);
        pay(key, vendor, TEN_CENTS);
        assertFalse(settle.isPaid(payer, key), "failed transfer must not mark the invoice paid");

        usdc.setFailMode(TestUSDC.FailMode.None);
        pay(key, vendor, TEN_CENTS);
        assertTrue(settle.isPaid(payer, key));
        assertEq(usdc.balanceOf(vendor), TEN_CENTS);
    }

    function test_transferReverts_bubblesReasonAndLeavesUnpaid() public {
        usdc.setFailMode(TestUSDC.FailMode.Revert);
        vm.expectRevert(TestUSDC.ForcedRevert.selector);
        pay(key, vendor, TEN_CENTS);
        assertFalse(settle.isPaid(payer, key));
    }

    /// Arc enforces a runtime blocklist on value transfers. A blocked recipient must not burn the key.
    function test_blockedRecipient_leavesUnpaid() public {
        usdc.setBlocked(vendor, true);
        vm.expectRevert(abi.encodeWithSelector(TestUSDC.Blocked.selector, vendor));
        pay(key, vendor, TEN_CENTS);
        assertFalse(settle.isPaid(payer, key));

        usdc.setBlocked(vendor, false);
        pay(key, vendor, TEN_CENTS);
        assertTrue(settle.isPaid(payer, key));
    }

    function test_insufficientAllowance_leavesUnpaid() public {
        vm.prank(payer);
        usdc.approve(address(settle), TEN_CENTS - 1);

        vm.expectRevert(TestUSDC.InsufficientAllowance.selector);
        pay(key, vendor, TEN_CENTS);
        assertFalse(settle.isPaid(payer, key));
    }

    function test_insufficientBalance_leavesUnpaid() public {
        address poor = makeAddr("poor");
        usdc.mint(poor, TEN_CENTS - 1);
        vm.startPrank(poor);
        usdc.approve(address(settle), type(uint256).max);
        vm.expectRevert(TestUSDC.InsufficientBalance.selector);
        settle.payOnce(key, vendor, TEN_CENTS);
        vm.stopPrank();
        assertFalse(settle.isPaid(poor, key));
    }

    function test_tokenWithoutReturnValue_isAccepted() public {
        usdc.setFailMode(TestUSDC.FailMode.NoReturnValue);
        pay(key, vendor, TEN_CENTS);
        assertEq(usdc.balanceOf(vendor), TEN_CENTS);
        assertTrue(settle.isPaid(payer, key));
    }

    // ---------------------------------------------------------------- scope: who pays

    function test_stranger_cannotSpendPayersAllowance() public {
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(stranger);
        vm.expectRevert(TestUSDC.InsufficientAllowance.selector);
        settle.payOnce(key, stranger, TEN_CENTS);

        assertEq(usdc.balanceOf(payer), payerBefore, "payer funds untouched");
        assertFalse(settle.isPaid(stranger, key));
        assertFalse(settle.isPaid(payer, key));
    }

    function test_differentPayers_sameKey_areIndependent() public {
        pay(key, vendor, TEN_CENTS);

        address payer2 = makeAddr("payer2");
        usdc.mint(payer2, TEN_CENTS);
        vm.startPrank(payer2);
        usdc.approve(address(settle), TEN_CENTS);
        settle.payOnce(key, vendor, TEN_CENTS);
        vm.stopPrank();

        assertTrue(settle.isPaid(payer, key));
        assertTrue(settle.isPaid(payer2, key));
        assertEq(usdc.balanceOf(vendor), 2 * TEN_CENTS, "documented scope: guarantee is per payer");
    }

    // ---------------------------------------------------------------- input validation

    function test_rejectsZeroKey() public {
        vm.expectRevert(SettleOnce.ZeroInvoiceKey.selector);
        pay(bytes32(0), vendor, TEN_CENTS);
    }

    function test_rejectsZeroRecipient() public {
        vm.expectRevert(abi.encodeWithSelector(SettleOnce.InvalidRecipient.selector, address(0)));
        pay(key, address(0), TEN_CENTS);
    }

    function test_rejectsContractAsRecipient() public {
        vm.expectRevert(abi.encodeWithSelector(SettleOnce.InvalidRecipient.selector, address(settle)));
        pay(key, address(settle), TEN_CENTS);
    }

    function test_rejectsTokenAsRecipient() public {
        vm.expectRevert(abi.encodeWithSelector(SettleOnce.InvalidRecipient.selector, address(usdc)));
        pay(key, address(usdc), TEN_CENTS);
    }

    function test_rejectsZeroAmount() public {
        vm.expectRevert(SettleOnce.ZeroAmount.selector);
        pay(key, vendor, 0);
    }

    function test_rejectsAmountAboveUint128() public {
        uint256 tooBig = uint256(type(uint128).max) + 1;
        vm.expectRevert(abi.encodeWithSelector(SettleOnce.AmountTooLarge.selector, tooBig));
        pay(key, vendor, tooBig);
    }

    function test_constructor_rejectsZeroToken() public {
        vm.expectRevert(SettleOnce.ZeroToken.selector);
        new SettleOnce(IERC20Minimal(address(0)));
    }

    // ---------------------------------------------------------------- reads used by the app

    function test_receiptsFor_batchMatchesSingleReads() public {
        bytes32 k2 = invoiceKey("VENDOR-7", "INV-1043");
        bytes32 k3 = invoiceKey("VENDOR-9", "INV-0001");
        pay(key, vendor, TEN_CENTS);
        pay(k3, otherVendor, 3 * TEN_CENTS);

        bytes32[] memory keys = new bytes32[](3);
        keys[0] = key;
        keys[1] = k2;
        keys[2] = k3;
        SettleOnce.Settlement[] memory out = settle.receiptsFor(payer, keys);

        assertEq(out.length, 3);
        assertEq(out[0].recipient, vendor);
        assertEq(uint256(out[1].paidAtBlock), 0, "unpaid key reads as zero");
        assertEq(uint256(out[2].amount), 3 * TEN_CENTS);
    }

    function test_invoiceKey_matchesWebAppDerivation() public pure {
        // Value pinned from web/src/lib/invoice.ts for ("VENDOR-7", "INV-1042").
        // If either side changes its derivation, this test and the web test both fail.
        assertEq(
            keccak256(abi.encode("settleonce.invoice.v1", "VENDOR-7", "INV-1042")),
            0xab5b28042934ef336c314097fc9ef9bf892d55f63f1cd232f88b47bcceed004b
        );
    }

    // ---------------------------------------------------------------- hostile token

    function test_reentrancy_isBlocked() public {
        ReentrantToken evil = new ReentrantToken();
        SettleOnce victim = new SettleOnce(IERC20Minimal(address(evil)));
        evil.setTarget(victim, invoiceKey("A", "B"));

        vm.expectRevert(SettleOnce.Reentrancy.selector);
        vm.prank(payer);
        victim.payOnce(invoiceKey("A", "A"), vendor, TEN_CENTS);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_atMostOnce(bytes32 k, uint96 amount, uint96 secondAmount, address to) public {
        vm.assume(k != bytes32(0));
        vm.assume(to != address(0) && to != address(settle) && to != address(usdc) && to != payer);
        amount = uint96(bound(amount, 1, 500 * 1e6));
        secondAmount = uint96(bound(secondAmount, 1, 500 * 1e6));

        pay(k, to, amount);
        uint256 toAfterFirst = usdc.balanceOf(to);

        vm.prank(payer);
        (bool ok,) = address(settle).call(abi.encodeCall(SettleOnce.payOnce, (k, to, secondAmount)));

        assertFalse(ok, "second settlement must fail");
        assertEq(usdc.balanceOf(to), toAfterFirst, "no second transfer");
        assertEq(uint256(settle.receiptFor(payer, k).amount), amount, "record unchanged");
    }
}
