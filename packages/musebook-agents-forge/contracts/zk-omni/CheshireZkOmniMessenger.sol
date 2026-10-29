// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {
    ILayerZeroEndpointV2,
    ILayerZeroReceiver,
    MessagingFee,
    MessagingParams,
    MessagingReceipt,
    Origin
} from "./ILayerZeroEndpointV2.sol";

/**
 * @title CheshireZkOmniMessenger
 * @notice Zero-knowledge omnichain messenger for Robinhood Chain ↔ Solana.
 * @dev Message type 4 carries:
 *        - nullifier bound to proofPubkey (ZK relation checked off-chain + binding hash on-chain)
 *        - Ed25519 proof (64 bytes) over public inputs
 *        - payloadCommitment + modelHash
 *
 *      On-chain checks (gas-bounded):
 *        - peer allowlist (LayerZero path auth)
 *        - nullifier uniqueness
 *        - expiry / field bounds
 *        - proof length == 64
 *        - proofPubkey nonzero
 *        - nullifier == keccak256(abi.encodePacked(NF_DOMAIN, proofPubkey, binding))
 *          where binding = keccak256(abi.encodePacked(agentId, payloadCommitment, modelHash))
 *
 *      Full Ed25519 verification is performed by the relayer before delivery;
 *      Solana program verifies via ed25519 precompile path in client composition.
 */
contract CheshireZkOmniMessenger is ILayerZeroReceiver {
    uint16 public constant MSG_ZK_OMNI = 4;
    uint32 public constant SOLANA_EID = 30168;
    uint32 public constant ROBINHOOD_EID = 30416;
    uint256 public constant MAX_ACTION_LENGTH = 64;
    uint256 public constant MAX_MEMO_LENGTH = 200;
    uint256 public constant PROOF_LENGTH = 64;

    ILayerZeroEndpointV2 public immutable endpoint;
    address public owner;
    address public identityRegistry;

    mapping(uint32 => bytes32) public peers;
    mapping(bytes32 => bool) public consumedNullifier;

    struct ZkOmniMessage {
        uint32 srcEid;
        bytes32 guid;
        bytes32 agentId;
        bytes32 controller;
        bytes32 nullifier;
        bytes32 payloadCommitment;
        bytes32 modelHash;
        bytes32 proofPubkey;
        uint64 expiresAt;
        string action;
        string memo;
        bytes32 proofHash;
    }

    ZkOmniMessage public lastMessage;
    bytes32 public lastGuid;
    uint32 public lastSrcEid;
    uint256 public deliveredCount;

    event PeerSet(uint32 indexed eid, bytes32 peer);
    event IdentityRegistrySet(address indexed registry);
    event ZkOmniSent(
        uint32 indexed dstEid,
        bytes32 indexed guid,
        bytes32 indexed nullifier,
        bytes32 agentId,
        address controller,
        bytes32 payloadCommitment,
        bytes32 proofPubkey,
        string action
    );
    event ZkOmniReceived(
        uint32 indexed srcEid,
        bytes32 indexed guid,
        bytes32 indexed nullifier,
        bytes32 agentId,
        bytes32 controller,
        bytes32 payloadCommitment,
        bytes32 proofPubkey,
        bytes32 proofHash,
        string action
    );

    error NotOwner();
    error InvalidEndpoint();
    error InvalidPeer();
    error UnauthorizedPeer();
    error UnauthorizedAgent();
    error InvalidNullifier();
    error NullifierReplay();
    error IntentExpired();
    error InvalidMessageType();
    error IntentTextTooLong();
    error InvalidAgentId();
    error InvalidController();
    error InvalidProof();
    error InvalidProofRelation();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _endpoint, address _owner, address _identityRegistry) {
        if (_endpoint == address(0) || _endpoint.code.length == 0) revert InvalidEndpoint();
        endpoint = ILayerZeroEndpointV2(_endpoint);
        owner = _owner == address(0) ? msg.sender : _owner;
        identityRegistry = _identityRegistry;
    }

    function setPeer(uint32 eid, bytes32 peer) external onlyOwner {
        if (peer == bytes32(0)) revert InvalidPeer();
        peers[eid] = peer;
        emit PeerSet(eid, peer);
    }

    function setIdentityRegistry(address registry) external onlyOwner {
        identityRegistry = registry;
        emit IdentityRegistrySet(registry);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner");
        owner = newOwner;
    }

    /// @notice ZK binding: nullifier = SHA-256("clawd-zk-omni-nullifier:v1" || 0x00 || pk || 0x00 || binding)
    /// @dev binding = SHA-256(agentId || payloadCommitment || modelHash). Matches src/zkOmni/proof.js.
    function expectedNullifier(bytes32 proofPubkey, bytes32 agentId, bytes32 payloadCommitment, bytes32 modelHash)
        public
        pure
        returns (bytes32)
    {
        bytes32 binding = sha256(abi.encodePacked(agentId, payloadCommitment, modelHash));
        return sha256(
            abi.encodePacked(
                "clawd-zk-omni-nullifier:v1",
                bytes1(0),
                proofPubkey,
                bytes1(0),
                binding
            )
        );
    }

    struct SendParams {
        uint32 dstEid;
        bytes32 agentId;
        bytes32 nullifier;
        bytes32 payloadCommitment;
        bytes32 modelHash;
        bytes32 proofPubkey;
        uint64 expiresAt;
        string action;
        string memo;
        bytes proof;
        bytes options;
    }

    function encodeZkOmni(
        bytes32 agentId,
        bytes32 controller,
        bytes32 nullifier,
        bytes32 payloadCommitment,
        bytes32 modelHash,
        bytes32 proofPubkey,
        uint64 expiresAt,
        string calldata action,
        string calldata memo,
        bytes calldata proof
    ) external pure returns (bytes memory) {
        return _encode(
            agentId,
            controller,
            nullifier,
            payloadCommitment,
            modelHash,
            proofPubkey,
            expiresAt,
            action,
            memo,
            proof
        );
    }

    function quoteSend(SendParams calldata p, bool payInLzToken)
        external
        view
        returns (MessagingFee memory)
    {
        _assertSendable(p);
        bytes32 peer = peers[p.dstEid];
        if (peer == bytes32(0)) revert InvalidPeer();
        bytes memory message = _encode(
            p.agentId,
            bytes32(uint256(uint160(msg.sender))),
            p.nullifier,
            p.payloadCommitment,
            p.modelHash,
            p.proofPubkey,
            p.expiresAt,
            p.action,
            p.memo,
            p.proof
        );
        return endpoint.quote(
            MessagingParams({
                dstEid: p.dstEid,
                receiver: peer,
                message: message,
                options: p.options,
                payInLzToken: payInLzToken
            }),
            address(this)
        );
    }

    function sendZkOmni(SendParams calldata p, MessagingFee calldata /* fee */)
        external
        payable
        returns (MessagingReceipt memory receipt)
    {
        _assertSendable(p);
        bytes32 peer = peers[p.dstEid];
        if (peer == bytes32(0)) revert InvalidPeer();

        if (consumedNullifier[p.nullifier]) revert NullifierReplay();
        consumedNullifier[p.nullifier] = true;

        bytes memory message = _encode(
            p.agentId,
            bytes32(uint256(uint160(msg.sender))),
            p.nullifier,
            p.payloadCommitment,
            p.modelHash,
            p.proofPubkey,
            p.expiresAt,
            p.action,
            p.memo,
            p.proof
        );

        receipt = endpoint.send{value: msg.value}(
            MessagingParams({
                dstEid: p.dstEid,
                receiver: peer,
                message: message,
                options: p.options,
                payInLzToken: false
            }),
            msg.sender
        );

        emit ZkOmniSent(
            p.dstEid,
            receipt.guid,
            p.nullifier,
            p.agentId,
            msg.sender,
            p.payloadCommitment,
            p.proofPubkey,
            p.action
        );
    }

    function lzReceive(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        address,
        bytes calldata
    ) external payable {
        if (msg.sender != address(endpoint)) revert UnauthorizedPeer();
        bytes32 expectedPeer = peers[origin.srcEid];
        if (expectedPeer == bytes32(0) || expectedPeer != origin.sender) revert UnauthorizedPeer();

        (
            uint16 msgType,
            bytes32 agentId,
            bytes32 controller,
            bytes32 nullifier,
            bytes32 payloadCommitment,
            bytes32 modelHash,
            bytes32 proofPubkey,
            uint64 expiresAt,
            string memory action,
            string memory memo,
            bytes memory proof
        ) = abi.decode(
            message,
            (uint16, bytes32, bytes32, bytes32, bytes32, bytes32, bytes32, uint64, string, string, bytes)
        );

        if (msgType != MSG_ZK_OMNI) revert InvalidMessageType();
        if (agentId == bytes32(0)) revert InvalidAgentId();
        if (controller == bytes32(0)) revert InvalidController();
        if (nullifier == bytes32(0)) revert InvalidNullifier();
        if (proofPubkey == bytes32(0)) revert InvalidProof();
        if (proof.length != PROOF_LENGTH) revert InvalidProof();
        if (expiresAt <= block.timestamp) revert IntentExpired();
        if (bytes(action).length > MAX_ACTION_LENGTH || bytes(memo).length > MAX_MEMO_LENGTH) {
            revert IntentTextTooLong();
        }
        if (expectedNullifier(proofPubkey, agentId, payloadCommitment, modelHash) != nullifier) {
            revert InvalidProofRelation();
        }
        if (consumedNullifier[nullifier]) revert NullifierReplay();
        consumedNullifier[nullifier] = true;

        bytes32 proofHash = keccak256(proof);
        lastGuid = guid;
        lastSrcEid = origin.srcEid;
        lastMessage = ZkOmniMessage({
            srcEid: origin.srcEid,
            guid: guid,
            agentId: agentId,
            controller: controller,
            nullifier: nullifier,
            payloadCommitment: payloadCommitment,
            modelHash: modelHash,
            proofPubkey: proofPubkey,
            expiresAt: expiresAt,
            action: action,
            memo: memo,
            proofHash: proofHash
        });
        deliveredCount += 1;

        emit ZkOmniReceived(
            origin.srcEid,
            guid,
            nullifier,
            agentId,
            controller,
            payloadCommitment,
            proofPubkey,
            proofHash,
            action
        );
    }

    function allowInitializePath(Origin calldata origin) external view returns (bool) {
        return peers[origin.srcEid] == origin.sender && origin.sender != bytes32(0);
    }

    function nextNonce(uint32, bytes32) external pure returns (uint64) {
        return 0;
    }

    function isNullifierConsumed(bytes32 nullifier) external view returns (bool) {
        return consumedNullifier[nullifier];
    }

    function _assertSendable(SendParams calldata p) internal view {
        if (p.agentId == bytes32(0)) revert InvalidAgentId();
        if (p.nullifier == bytes32(0)) revert InvalidNullifier();
        if (p.proofPubkey == bytes32(0)) revert InvalidProof();
        if (p.proof.length != PROOF_LENGTH) revert InvalidProof();
        if (p.expiresAt <= block.timestamp) revert IntentExpired();
        if (bytes(p.action).length > MAX_ACTION_LENGTH || bytes(p.memo).length > MAX_MEMO_LENGTH) {
            revert IntentTextTooLong();
        }
        if (
            expectedNullifier(p.proofPubkey, p.agentId, p.payloadCommitment, p.modelHash)
                != p.nullifier
        ) {
            revert InvalidProofRelation();
        }
        if (identityRegistry != address(0)) {
            (bool ok, bytes memory ret) = identityRegistry.staticcall(
                abi.encodeWithSignature("isAuthorized(address,uint256)", msg.sender, uint256(p.agentId))
            );
            if (!ok || ret.length < 32 || !abi.decode(ret, (bool))) revert UnauthorizedAgent();
        }
    }

    function _encode(
        bytes32 agentId,
        bytes32 controller,
        bytes32 nullifier,
        bytes32 payloadCommitment,
        bytes32 modelHash,
        bytes32 proofPubkey,
        uint64 expiresAt,
        string memory action,
        string memory memo,
        bytes memory proof
    ) internal pure returns (bytes memory) {
        return abi.encode(
            MSG_ZK_OMNI,
            agentId,
            controller,
            nullifier,
            payloadCommitment,
            modelHash,
            proofPubkey,
            expiresAt,
            action,
            memo,
            proof
        );
    }
}
