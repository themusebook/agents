// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface ICheshireAgentAuthorization {
    function ownerOf(uint256 agentId) external view returns (address);
    function isAuthorized(address operator, uint256 agentId) external view returns (bool);
}

/// @title CheshireAgentValidationRegistry
/// @notice ERC-8004 validation request/response registry for Robinhood Chain.
contract CheshireAgentValidationRegistry {
    struct Validation {
        address validatorAddress;
        uint256 agentId;
        uint8 response;
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bool exists;
        bool responded;
    }

    ICheshireAgentAuthorization public immutable identityRegistry;
    mapping(bytes32 => Validation) private _validations;
    mapping(uint256 => bytes32[]) private _agentValidations;
    mapping(address => bytes32[]) private _validatorRequests;

    event ValidationRequest(
        address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash
    );
    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
    );

    error InvalidIdentityRegistry();
    error NotAgentOperator();
    error InvalidValidator();
    error InvalidRequestHash();
    error RequestAlreadyExists();
    error RequestDoesNotExist();
    error NotValidator();
    error InvalidResponse();

    constructor(address identityRegistry_) {
        if (identityRegistry_ == address(0) || identityRegistry_.code.length == 0) revert InvalidIdentityRegistry();
        identityRegistry = ICheshireAgentAuthorization(identityRegistry_);
    }

    function getIdentityRegistry() external view returns (address) {
        return address(identityRegistry);
    }

    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        if (validatorAddress == address(0)) revert InvalidValidator();
        if (requestHash == bytes32(0)) revert InvalidRequestHash();
        identityRegistry.ownerOf(agentId);
        if (!identityRegistry.isAuthorized(msg.sender, agentId)) revert NotAgentOperator();
        if (_validations[requestHash].exists) revert RequestAlreadyExists();
        _validations[requestHash] =
            Validation(validatorAddress, agentId, 0, bytes32(0), "", block.timestamp, true, false);
        _agentValidations[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);
        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        Validation storage item = _validations[requestHash];
        if (!item.exists) revert RequestDoesNotExist();
        if (msg.sender != item.validatorAddress) revert NotValidator();
        if (response > 100) revert InvalidResponse();
        item.response = response;
        item.responseHash = responseHash;
        item.tag = tag;
        item.lastUpdate = block.timestamp;
        item.responded = true;
        emit ValidationResponse(msg.sender, item.agentId, requestHash, response, responseURI, responseHash, tag);
    }

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        )
    {
        Validation storage item = _validations[requestHash];
        if (!item.exists) revert RequestDoesNotExist();
        return (item.validatorAddress, item.agentId, item.response, item.responseHash, item.tag, item.lastUpdate);
    }

    function getSummary(uint256 agentId, address[] calldata validatorAddresses, string calldata tag)
        external
        view
        returns (uint64 count, uint8 averageResponse)
    {
        bytes32[] storage hashes = _agentValidations[agentId];
        uint256 total;
        for (uint256 i; i < hashes.length; ++i) {
            Validation storage item = _validations[hashes[i]];
            if (!item.responded) continue;
            if (!_included(item.validatorAddress, validatorAddresses)) continue;
            if (bytes(tag).length != 0 && keccak256(bytes(item.tag)) != keccak256(bytes(tag))) continue;
            total += item.response;
            ++count;
        }
        if (count != 0) averageResponse = uint8(total / count);
    }

    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentValidations[agentId];
    }

    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory) {
        return _validatorRequests[validatorAddress];
    }

    function _included(address validator, address[] calldata filters) private pure returns (bool) {
        if (filters.length == 0) return true;
        for (uint256 i; i < filters.length; ++i) {
            if (filters[i] == validator) return true;
        }
        return false;
    }
}
