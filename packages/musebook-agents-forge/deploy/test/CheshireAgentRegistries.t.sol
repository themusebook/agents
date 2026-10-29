// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {CheshireAgentIdentityRegistry} from "../../contracts/CheshireAgentIdentityRegistry.sol";
import {CheshireAgentReputationRegistry} from "../../contracts/CheshireAgentReputationRegistry.sol";
import {CheshireAgentValidationRegistry} from "../../contracts/CheshireAgentValidationRegistry.sol";

contract CheshireAgentRegistriesTest is Test {
    CheshireAgentIdentityRegistry internal identity;
    CheshireAgentReputationRegistry internal reputation;
    CheshireAgentValidationRegistry internal validation;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal validator = address(0xF00D);

    function setUp() public {
        identity = new CheshireAgentIdentityRegistry();
        reputation = new CheshireAgentReputationRegistry(address(identity));
        validation = new CheshireAgentValidationRegistry(address(identity));
    }

    function test_registerMintAndMetadata() public {
        vm.prank(alice);
        uint256 agentId = identity.register("ipfs://agent");
        assertEq(agentId, 1);
        assertEq(identity.ownerOf(agentId), alice);
        assertEq(identity.tokenURI(agentId), "ipfs://agent");
        assertEq(identity.getAgentWallet(agentId), alice);

        vm.prank(alice);
        identity.setMetadata(agentId, "model", bytes("cheshire-v1"));
        assertEq(identity.getMetadata(agentId, "model"), bytes("cheshire-v1"));
    }

    function test_transferClearsVerifiedWallet() public {
        vm.prank(alice);
        uint256 agentId = identity.register("data:application/json;base64,e30=");
        vm.prank(alice);
        identity.transferFrom(alice, bob, agentId);
        assertEq(identity.ownerOf(agentId), bob);
        assertEq(identity.getAgentWallet(agentId), address(0));
    }

    function test_reservedWalletCannotBeWrittenAsMetadata() public {
        vm.prank(alice);
        uint256 agentId = identity.register();
        vm.prank(alice);
        vm.expectRevert(CheshireAgentIdentityRegistry.ReservedMetadataKey.selector);
        identity.setMetadata(agentId, "agentWallet", abi.encode(bob));
    }

    function test_feedbackLifecycleAndSummary() public {
        vm.prank(alice);
        uint256 agentId = identity.register("ipfs://agent");
        vm.prank(bob);
        reputation.giveFeedback(agentId, 875, 1, "quality", "week", "https://agent", "ipfs://feedback", bytes32(0));
        assertEq(reputation.getLastIndex(agentId, bob), 1);

        address[] memory clients = new address[](1);
        clients[0] = bob;
        (uint64 count, int128 average, uint8 decimals) = reputation.getSummary(agentId, clients, "quality", "week");
        assertEq(count, 1);
        assertEq(average, int128(875 * 10 ** 17));
        assertEq(decimals, 18);

        vm.prank(bob);
        reputation.revokeFeedback(agentId, 1);
        (count,,) = reputation.getSummary(agentId, clients, "quality", "week");
        assertEq(count, 0);
    }

    function test_ownerAndOperatorCannotReviewOwnAgent() public {
        vm.prank(alice);
        uint256 agentId = identity.register();
        vm.prank(alice);
        vm.expectRevert(CheshireAgentReputationRegistry.SelfFeedback.selector);
        reputation.giveFeedback(agentId, 1, 0, "", "", "", "", bytes32(0));
    }

    function test_validationLifecycle() public {
        vm.prank(alice);
        uint256 agentId = identity.register("ipfs://agent");
        bytes32 requestHash = keccak256("work-result");
        vm.prank(alice);
        validation.validationRequest(validator, agentId, "ipfs://work", requestHash);

        vm.prank(validator);
        validation.validationResponse(requestHash, 100, "ipfs://proof", keccak256("proof"), "tee");
        (address who, uint256 responseAgent, uint8 response,,, uint256 updated) =
            validation.getValidationStatus(requestHash);
        assertEq(who, validator);
        assertEq(responseAgent, agentId);
        assertEq(response, 100);
        assertGt(updated, 0);
    }
}
