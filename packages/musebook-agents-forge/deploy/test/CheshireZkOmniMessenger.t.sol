// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {CheshireZkOmniMessenger} from "../../contracts/zk-omni/CheshireZkOmniMessenger.sol";
import {MockLzEndpoint} from "../../contracts/zk-omni/MockLzEndpoint.sol";
import {MessagingFee} from "../../contracts/zk-omni/ILayerZeroEndpointV2.sol";

contract CheshireZkOmniMessengerTest is Test {
    MockLzEndpoint internal endpoint;
    CheshireZkOmniMessenger internal messengerA;
    CheshireZkOmniMessenger internal messengerB;

    address internal alice = address(0xA11CE);

    uint32 internal constant EID_A = 30416;
    uint32 internal constant EID_B = 30168;

    function setUp() public {
        endpoint = new MockLzEndpoint();
        messengerA = new CheshireZkOmniMessenger(address(endpoint), address(this), address(0));
        messengerB = new CheshireZkOmniMessenger(address(endpoint), address(this), address(0));
        messengerA.setPeer(EID_B, bytes32(uint256(uint160(address(messengerB)))));
        messengerB.setPeer(EID_A, bytes32(uint256(uint160(address(messengerA)))));
        vm.deal(alice, 10 ether);
    }

    function _agentId(uint256 n) internal pure returns (bytes32) {
        return bytes32(n);
    }

    function _makeProof() internal pure returns (bytes memory) {
        return new bytes(64);
    }

    function _proofPubkey() internal pure returns (bytes32) {
        return keccak256("proof-pubkey");
    }

    function test_expectedNullifierMatchesSha256Relation() public {
        bytes32 agentId = _agentId(7);
        bytes32 payload = keccak256("payload");
        bytes32 model = keccak256("model");
        bytes32 pk = _proofPubkey();

        bytes32 binding = sha256(abi.encodePacked(agentId, payload, model));
        bytes32 expected = sha256(
            abi.encodePacked("clawd-zk-omni-nullifier:v1", bytes1(0), pk, bytes1(0), binding)
        );
        assertEq(messengerA.expectedNullifier(pk, agentId, payload, model), expected);
    }

    function test_encodeRoundTripFieldsWithProof() public view {
        bytes32 agentId = _agentId(7);
        bytes32 controller = bytes32(uint256(uint160(alice)));
        bytes32 payload = keccak256("payload");
        bytes32 model = keccak256("model");
        bytes32 pk = _proofPubkey();
        bytes32 nullifier = messengerA.expectedNullifier(pk, agentId, payload, model);
        uint64 expires = uint64(block.timestamp + 3600);
        bytes memory proof = _makeProof();

        bytes memory encoded = messengerA.encodeZkOmni(
            agentId, controller, nullifier, payload, model, pk, expires, "attest", "memo-1", proof
        );

        (
            uint16 msgType,
            bytes32 a,
            bytes32 c,
            bytes32 n,
            bytes32 p,
            bytes32 m,
            bytes32 proofPk,
            uint64 exp,
            string memory action,
            string memory memo,
            bytes memory pr
        ) = abi.decode(
            encoded,
            (uint16, bytes32, bytes32, bytes32, bytes32, bytes32, bytes32, uint64, string, string, bytes)
        );

        assertEq(msgType, 4);
        assertEq(a, agentId);
        assertEq(c, controller);
        assertEq(n, nullifier);
        assertEq(p, payload);
        assertEq(m, model);
        assertEq(proofPk, pk);
        assertEq(exp, expires);
        assertEq(action, "attest");
        assertEq(memo, "memo-1");
        assertEq(pr.length, 64);
    }

    function test_sendAndDeliverConsumesNullifier() public {
        bytes32 agentId = _agentId(42);
        bytes32 payload = keccak256("zk-payload");
        bytes32 model = keccak256("model-hash");
        bytes32 pk = _proofPubkey();
        bytes32 nullifier = messengerA.expectedNullifier(pk, agentId, payload, model);
        uint64 expires = uint64(block.timestamp + 7200);
        bytes memory proof = _makeProof();

        CheshireZkOmniMessenger.SendParams memory sp = CheshireZkOmniMessenger.SendParams({
            dstEid: EID_B,
            agentId: agentId,
            nullifier: nullifier,
            payloadCommitment: payload,
            modelHash: model,
            proofPubkey: pk,
            expiresAt: expires,
            action: "publish_attestation",
            memo: "one-shot",
            proof: proof,
            options: ""
        });
        vm.prank(alice);
        messengerA.sendZkOmni{value: 0.01 ether}(
            sp, MessagingFee({nativeFee: 0, lzTokenFee: 0})
        );

        assertTrue(messengerA.isNullifierConsumed(nullifier));

        bytes memory message = messengerA.encodeZkOmni(
            agentId,
            bytes32(uint256(uint160(alice))),
            nullifier,
            payload,
            model,
            pk,
            expires,
            "publish_attestation",
            "one-shot",
            proof
        );

        endpoint.deliver(
            address(messengerB),
            EID_A,
            bytes32(uint256(uint160(address(messengerA)))),
            keccak256("guid-1"),
            message
        );

        assertTrue(messengerB.isNullifierConsumed(nullifier));
        assertEq(messengerB.deliveredCount(), 1);
        assertEq(messengerB.lastSrcEid(), EID_A);
    }

    function test_invalidProofRelationRejected() public {
        bytes32 agentId = _agentId(1);
        bytes32 payload = keccak256("p");
        bytes32 model = bytes32(0);
        bytes32 pk = _proofPubkey();
        bytes32 badNullifier = keccak256("not-the-relation");
        uint64 expires = uint64(block.timestamp + 1000);
        bytes memory proof = _makeProof();

        bytes memory message = messengerA.encodeZkOmni(
            agentId,
            bytes32(uint256(uint160(alice))),
            badNullifier,
            payload,
            model,
            pk,
            expires,
            "action",
            "",
            proof
        );

        vm.expectRevert(CheshireZkOmniMessenger.InvalidProofRelation.selector);
        endpoint.deliver(
            address(messengerB),
            EID_A,
            bytes32(uint256(uint160(address(messengerA)))),
            keccak256("g1"),
            message
        );
    }

    function test_nullifierReplayRejectedOnReceive() public {
        bytes32 agentId = _agentId(1);
        bytes32 payload = keccak256("p");
        bytes32 model = bytes32(0);
        bytes32 pk = _proofPubkey();
        bytes32 nullifier = messengerA.expectedNullifier(pk, agentId, payload, model);
        uint64 expires = uint64(block.timestamp + 1000);
        bytes memory proof = _makeProof();

        bytes memory message = messengerA.encodeZkOmni(
            agentId,
            bytes32(uint256(uint160(alice))),
            nullifier,
            payload,
            model,
            pk,
            expires,
            "action",
            "",
            proof
        );

        endpoint.deliver(
            address(messengerB),
            EID_A,
            bytes32(uint256(uint160(address(messengerA)))),
            keccak256("g1"),
            message
        );

        vm.expectRevert(CheshireZkOmniMessenger.NullifierReplay.selector);
        endpoint.deliver(
            address(messengerB),
            EID_A,
            bytes32(uint256(uint160(address(messengerA)))),
            keccak256("g2"),
            message
        );
    }

    function test_shortProofRejected() public {
        bytes32 agentId = _agentId(1);
        bytes32 payload = keccak256("p");
        bytes32 model = bytes32(0);
        bytes32 pk = _proofPubkey();
        bytes32 nullifier = messengerA.expectedNullifier(pk, agentId, payload, model);
        uint64 expires = uint64(block.timestamp + 1000);
        bytes memory shortProof = new bytes(32);

        bytes memory message = messengerA.encodeZkOmni(
            agentId,
            bytes32(uint256(uint160(alice))),
            nullifier,
            payload,
            model,
            pk,
            expires,
            "action",
            "",
            shortProof
        );

        vm.expectRevert(CheshireZkOmniMessenger.InvalidProof.selector);
        endpoint.deliver(
            address(messengerB),
            EID_A,
            bytes32(uint256(uint160(address(messengerA)))),
            keccak256("g"),
            message
        );
    }
}
