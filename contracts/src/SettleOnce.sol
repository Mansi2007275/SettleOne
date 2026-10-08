// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";

/// @title SettleOnce
/// @author Mansi Yadav (0xalgos)
/// @notice Pays a USDC invoice straight from the caller's wallet to the recipient,
///         at most once per (payer, invoiceKey) on this contract.
///
/// Guarantee: for one chain, one SettleOnce deployment, one payer wallet and one invoice key,
/// the number of successful settlements is at most one. Once settled, the stored recipient and
/// amount never change. A failed transfer reverts the whole call, so the key stays unpaid.
///
/// Out of scope: the same real-world invoice under a different key, other payer wallets, other
/// contracts or chains, direct USDC transfers that bypass this contract, and whether the invoice
/// itself is legitimate.
///
/// Design notes:
///   - The payer is always msg.sender. There is no way to spend someone else's allowance.
///   - Funds never rest here: USDC moves payer -> recipient inside one transferFrom.
///   - No owner, no admin reset, no upgrade proxy, no arbitrary call facility.
///   - `paidAtBlock` lets a client find the original transaction with a single-block log query.
contract SettleOnce {
    /// @notice What was settled for one (payer, invoiceKey). `paidAtBlock == 0` means unpaid.
    struct Settlement {
        address recipient;
        uint64 paidAtBlock;
        uint128 amount;
        uint64 paidAt;
    }

    /// @notice The USDC ERC-20 interface this deployment pays with. Fixed forever.
    IERC20Minimal public immutable usdc;

    mapping(address payer => mapping(bytes32 invoiceKey => Settlement)) private _settlements;

    uint256 private _lock = 1;

    /// @notice Emitted exactly once per settled (payer, invoiceKey).
    event InvoicePaid(address indexed payer, bytes32 indexed invoiceKey, address indexed recipient, uint256 amount);

    error ZeroToken();
    error ZeroInvoiceKey();
    error InvalidRecipient(address recipient);
    error ZeroAmount();
    error AmountTooLarge(uint256 amount);
    /// @notice This payer already settled this key with these exact details.
    error AlreadyPaid(address payer, bytes32 invoiceKey, uint64 paidAtBlock);
    /// @notice This payer already settled this key, but with a different recipient or amount.
    error SettlementConflict(address payer, bytes32 invoiceKey, address paidRecipient, uint256 paidAmount);
    error TransferFailed();
    error Reentrancy();

    constructor(IERC20Minimal token) {
        if (address(token) == address(0)) revert ZeroToken();
        usdc = token;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @notice Pay `amount` USDC (6-decimal base units) from msg.sender to `recipient` for `invoiceKey`.
    /// @dev Requires msg.sender to have approved this contract for at least `amount`.
    function payOnce(bytes32 invoiceKey, address recipient, uint256 amount) external nonReentrant {
        if (invoiceKey == bytes32(0)) revert ZeroInvoiceKey();
        if (recipient == address(0) || recipient == address(this) || recipient == address(usdc)) {
            revert InvalidRecipient(recipient);
        }
        if (amount == 0) revert ZeroAmount();
        if (amount > type(uint128).max) revert AmountTooLarge(amount);

        Settlement storage s = _settlements[msg.sender][invoiceKey];
        if (s.paidAtBlock != 0) {
            if (s.recipient == recipient && s.amount == amount) {
                revert AlreadyPaid(msg.sender, invoiceKey, s.paidAtBlock);
            }
            revert SettlementConflict(msg.sender, invoiceKey, s.recipient, s.amount);
        }

        // Effects before the external call. If the transfer fails, this whole frame reverts
        // and the record disappears with it.
        s.recipient = recipient;
        s.paidAtBlock = uint64(block.number);
        // casting to 'uint128' is safe because amounts above type(uint128).max were rejected above
        // forge-lint: disable-next-line(unsafe-typecast)
        s.amount = uint128(amount);
        s.paidAt = uint64(block.timestamp);

        _safeTransferFrom(msg.sender, recipient, amount);

        emit InvoicePaid(msg.sender, invoiceKey, recipient, amount);
    }

    /// @notice The settlement record for one (payer, invoiceKey). Unpaid keys return zeros.
    function receiptFor(address payer, bytes32 invoiceKey) external view returns (Settlement memory) {
        return _settlements[payer][invoiceKey];
    }

    /// @notice Batch version of `receiptFor`, used to restore a whole invoice file in one read.
    function receiptsFor(address payer, bytes32[] calldata invoiceKeys)
        external
        view
        returns (Settlement[] memory out)
    {
        out = new Settlement[](invoiceKeys.length);
        for (uint256 i; i < invoiceKeys.length; ++i) {
            out[i] = _settlements[payer][invoiceKeys[i]];
        }
    }

    /// @notice Convenience check: has this payer settled this key?
    function isPaid(address payer, bytes32 invoiceKey) external view returns (bool) {
        return _settlements[payer][invoiceKey].paidAtBlock != 0;
    }

    /// @dev transferFrom that accepts tokens returning `true` or nothing, and bubbles revert data.
    function _safeTransferFrom(address from, address to, uint256 amount) private {
        (bool ok, bytes memory ret) =
            address(usdc).call(abi.encodeCall(IERC20Minimal.transferFrom, (from, to, amount)));

        if (!ok) {
            if (ret.length > 0) {
                assembly ("memory-safe") {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
            revert TransferFailed();
        }

        if (ret.length == 0) {
            if (address(usdc).code.length == 0) revert TransferFailed();
        } else if (ret.length < 32 || !abi.decode(ret, (bool))) {
            revert TransferFailed();
        }
    }
}
