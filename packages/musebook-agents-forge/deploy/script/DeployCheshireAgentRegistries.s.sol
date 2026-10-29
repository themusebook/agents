// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {console2} from "forge-std/Script.sol";
import {CheshireAgentIdentityRegistry} from "../../contracts/CheshireAgentIdentityRegistry.sol";
import {CheshireAgentReputationRegistry} from "../../contracts/CheshireAgentReputationRegistry.sol";
import {CheshireAgentValidationRegistry} from "../../contracts/CheshireAgentValidationRegistry.sol";
import {RobinhoodDeploymentSafety} from "./RobinhoodDeploymentSafety.s.sol";

/// @notice Deploys one identity, reputation, and validation suite atomically.
/// @dev Reputation and validation are permanently bound to the new identity
///      registry. A new deployment creates a separate ERC-8004 namespace.
contract DeployCheshireAgentRegistries is RobinhoodDeploymentSafety {
    function run() external returns (address identity, address reputation, address validation) {
        _assertRobinhoodDeployment();
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(privateKey);
        CheshireAgentIdentityRegistry identityRegistry = new CheshireAgentIdentityRegistry();
        CheshireAgentReputationRegistry reputationRegistry =
            new CheshireAgentReputationRegistry(address(identityRegistry));
        CheshireAgentValidationRegistry validationRegistry =
            new CheshireAgentValidationRegistry(address(identityRegistry));
        vm.stopBroadcast();

        identity = address(identityRegistry);
        reputation = address(reputationRegistry);
        validation = address(validationRegistry);
        console2.log("CheshireAgentIdentityRegistry", identity);
        console2.log("CheshireAgentReputationRegistry", reputation);
        console2.log("CheshireAgentValidationRegistry", validation);
    }
}
