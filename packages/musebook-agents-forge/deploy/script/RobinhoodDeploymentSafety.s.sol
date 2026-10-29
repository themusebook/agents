// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

/// @notice On-chain-context guard for the standalone registry deployment.
/// @dev The shell/Node preflight validates the URL and probes eth_chainId. This
///      second layer prevents a direct `forge script --broadcast` invocation
///      from signing for the wrong chain or without explicit production gates.
abstract contract RobinhoodDeploymentSafety is Script {
    uint256 internal constant RH_MAINNET_CHAIN_ID = 4663;
    uint256 internal constant RH_TESTNET_CHAIN_ID = 46630;

    error UnsupportedRobinhoodChain(uint256 chainId);
    error RpcChainMismatch(uint256 actual, uint256 expected);
    error DeploymentConfirmationMismatch();
    error ProductionRpcNotAttested();
    error ProductionAuditMissing();

    function _assertRobinhoodDeployment() internal view returns (uint256 expectedChainId) {
        expectedChainId = vm.envUint("EXPECTED_CHAIN_ID");
        if (expectedChainId != RH_MAINNET_CHAIN_ID && expectedChainId != RH_TESTNET_CHAIN_ID) {
            revert UnsupportedRobinhoodChain(expectedChainId);
        }
        if (block.chainid != expectedChainId) revert RpcChainMismatch(block.chainid, expectedChainId);

        bool live = vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.isContext(VmSafe.ForgeContext.ScriptResume);
        if (!live) return expectedChainId;

        bytes32 supplied = keccak256(bytes(vm.envString("DEPLOYMENT_CONFIRMATION")));
        bytes32 required = expectedChainId == RH_MAINNET_CHAIN_ID
            ? keccak256("DEPLOY ROBINHOOD MAINNET 4663")
            : keccak256("DEPLOY ROBINHOOD TESTNET 46630");
        if (supplied != required) revert DeploymentConfirmationMismatch();

        if (expectedChainId == RH_MAINNET_CHAIN_ID) {
            if (!vm.envBool("RH_RPC_IS_QUOTA_BACKED")) revert ProductionRpcNotAttested();
            if (vm.envBytes32("DEPLOYMENT_AUDIT_SHA256") == bytes32(0)) revert ProductionAuditMissing();
        }
    }
}
