// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {SettleOnce} from "../src/SettleOnce.sol";
import {IERC20Minimal} from "../src/interfaces/IERC20Minimal.sol";

/// @notice Deploys SettleOnce against Arc's real USDC and records the result in ../deployments/.
///
/// Testnet:
///   arc-forge script script/DeploySettleOnce.s.sol --rpc-url arc_testnet --account settleonce-deployer --broadcast
/// Mainnet (only after testnet is fully verified):
///   arc-forge script script/DeploySettleOnce.s.sol --rpc-url arc_mainnet --account settleonce-deployer --broadcast
contract DeploySettleOnce is Script {
    /// Arc's USDC ERC-20 interface (6 decimals). Same address on testnet and mainnet.
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    uint256 internal constant ARC_MAINNET = 5042;
    uint256 internal constant ARC_TESTNET = 5042002;

    function run() external returns (SettleOnce deployed) {
        require(block.chainid == ARC_TESTNET || block.chainid == ARC_MAINNET, "DeploySettleOnce: not an Arc chain");
        require(IERC20Minimal(ARC_USDC).decimals() == 6, "DeploySettleOnce: unexpected USDC decimals");

        // Logs only need to be scanned from here on; the real inclusion block is this or later.
        uint256 startBlock = block.number;

        vm.startBroadcast();
        deployed = new SettleOnce(IERC20Minimal(ARC_USDC));
        vm.stopBroadcast();

        string memory network = block.chainid == ARC_MAINNET ? "arc-mainnet" : "arc-testnet";

        string memory obj = "deployment";
        vm.serializeString(obj, "network", network);
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "usdc", ARC_USDC);
        vm.serializeUint(obj, "startBlock", startBlock);
        string memory json = vm.serializeAddress(obj, "settleOnce", address(deployed));
        vm.writeJson(json, string.concat(vm.projectRoot(), "/../deployments/", network, ".json"));

        console2.log("SettleOnce deployed on", network);
        console2.log("  address    ", address(deployed));
        console2.log("  startBlock ", startBlock);
        console2.log("");
        console2.log("Paste into web/.env.local:");
        console2.log(string.concat("  NEXT_PUBLIC_ARC_NETWORK=", block.chainid == ARC_MAINNET ? "mainnet" : "testnet"));
        console2.log(string.concat("  NEXT_PUBLIC_SETTLEONCE_ADDRESS=", vm.toString(address(deployed))));
        console2.log(string.concat("  NEXT_PUBLIC_SETTLEONCE_START_BLOCK=", vm.toString(startBlock)));
    }
}
