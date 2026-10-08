/**
 * ABI for contracts/src/SettleOnce.sol. Regenerate after changing the contract:
 *   cd contracts && arc-forge inspect SettleOnce abi --json
 */
export const settleOnceAbi = [
  {
    type: "constructor",
    inputs: [{ name: "token", type: "address", internalType: "contract IERC20Minimal" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isPaid",
    inputs: [
      { name: "payer", type: "address", internalType: "address" },
      { name: "invoiceKey", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "payOnce",
    inputs: [
      { name: "invoiceKey", type: "bytes32", internalType: "bytes32" },
      { name: "recipient", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "receiptFor",
    inputs: [
      { name: "payer", type: "address", internalType: "address" },
      { name: "invoiceKey", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct SettleOnce.Settlement",
        components: [
          { name: "recipient", type: "address", internalType: "address" },
          { name: "paidAtBlock", type: "uint64", internalType: "uint64" },
          { name: "amount", type: "uint128", internalType: "uint128" },
          { name: "paidAt", type: "uint64", internalType: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "receiptsFor",
    inputs: [
      { name: "payer", type: "address", internalType: "address" },
      { name: "invoiceKeys", type: "bytes32[]", internalType: "bytes32[]" },
    ],
    outputs: [
      {
        name: "out",
        type: "tuple[]",
        internalType: "struct SettleOnce.Settlement[]",
        components: [
          { name: "recipient", type: "address", internalType: "address" },
          { name: "paidAtBlock", type: "uint64", internalType: "uint64" },
          { name: "amount", type: "uint128", internalType: "uint128" },
          { name: "paidAt", type: "uint64", internalType: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "usdc",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IERC20Minimal" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "InvoicePaid",
    inputs: [
      { name: "payer", type: "address", indexed: true, internalType: "address" },
      { name: "invoiceKey", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "recipient", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "AlreadyPaid",
    inputs: [
      { name: "payer", type: "address", internalType: "address" },
      { name: "invoiceKey", type: "bytes32", internalType: "bytes32" },
      { name: "paidAtBlock", type: "uint64", internalType: "uint64" },
    ],
  },
  { type: "error", name: "AmountTooLarge", inputs: [{ name: "amount", type: "uint256", internalType: "uint256" }] },
  { type: "error", name: "InvalidRecipient", inputs: [{ name: "recipient", type: "address", internalType: "address" }] },
  { type: "error", name: "Reentrancy", inputs: [] },
  {
    type: "error",
    name: "SettlementConflict",
    inputs: [
      { name: "payer", type: "address", internalType: "address" },
      { name: "invoiceKey", type: "bytes32", internalType: "bytes32" },
      { name: "paidRecipient", type: "address", internalType: "address" },
      { name: "paidAmount", type: "uint256", internalType: "uint256" },
    ],
  },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "ZeroInvoiceKey", inputs: [] },
  { type: "error", name: "ZeroToken", inputs: [] },
] as const;
