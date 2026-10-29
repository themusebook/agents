// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface ICheshireAgentIdentity {
    function ownerOf(uint256 agentId) external view returns (address);
    function isAuthorized(address operator, uint256 agentId) external view returns (bool);
}

/// @title CheshireAgentReputationRegistry
/// @notice ERC-8004 feedback signals for agents in one immutable identity registry.
contract CheshireAgentReputationRegistry {
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        bool isRevoked;
    }

    ICheshireAgentIdentity public immutable identityRegistry;
    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) private _feedback;
    mapping(uint256 => mapping(address => uint64)) private _lastIndex;
    mapping(uint256 => address[]) private _clients;
    mapping(uint256 => mapping(address => bool)) private _knownClient;
    mapping(uint256 => mapping(address => mapping(uint64 => mapping(address => uint64)))) private _responseCounts;

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );
    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);
    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseURI,
        bytes32 responseHash
    );

    error InvalidIdentityRegistry();
    error InvalidDecimals();
    error SelfFeedback();
    error FeedbackDoesNotExist();
    error AlreadyRevoked();
    error EmptyClientFilter();
    error LengthOverflow();

    constructor(address identityRegistry_) {
        if (identityRegistry_ == address(0) || identityRegistry_.code.length == 0) revert InvalidIdentityRegistry();
        identityRegistry = ICheshireAgentIdentity(identityRegistry_);
    }

    function getIdentityRegistry() external view returns (address) {
        return address(identityRegistry);
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        if (valueDecimals > 18) revert InvalidDecimals();
        identityRegistry.ownerOf(agentId);
        if (identityRegistry.isAuthorized(msg.sender, agentId)) revert SelfFeedback();
        uint64 index = _lastIndex[agentId][msg.sender] + 1;
        _lastIndex[agentId][msg.sender] = index;
        _feedback[agentId][msg.sender][index] = Feedback(value, valueDecimals, tag1, tag2, false);
        if (!_knownClient[agentId][msg.sender]) {
            _knownClient[agentId][msg.sender] = true;
            _clients[agentId].push(msg.sender);
        }
        _emitNewFeedback(agentId, index, endpoint, feedbackURI, feedbackHash);
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        Feedback storage item = _feedback[agentId][msg.sender][feedbackIndex];
        if (feedbackIndex == 0 || feedbackIndex > _lastIndex[agentId][msg.sender]) revert FeedbackDoesNotExist();
        if (item.isRevoked) revert AlreadyRevoked();
        item.isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external {
        if (feedbackIndex == 0 || feedbackIndex > _lastIndex[agentId][clientAddress]) {
            revert FeedbackDoesNotExist();
        }
        ++_responseCounts[agentId][clientAddress][feedbackIndex][msg.sender];
        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)
    {
        if (feedbackIndex == 0 || feedbackIndex > _lastIndex[agentId][clientAddress]) {
            revert FeedbackDoesNotExist();
        }
        Feedback storage item = _feedback[agentId][clientAddress][feedbackIndex];
        return (item.value, item.valueDecimals, item.tag1, item.tag2, item.isRevoked);
    }

    function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        if (clientAddresses.length == 0) revert EmptyClientFilter();
        int256 scaledSum;
        for (uint256 i; i < clientAddresses.length; ++i) {
            (uint64 clientCount, int256 clientSum) = _clientSummary(agentId, clientAddresses[i], tag1, tag2);
            count += clientCount;
            scaledSum += clientSum;
        }
        summaryValueDecimals = 18;
        if (count != 0) {
            int256 average = scaledSum / int256(uint256(count));
            if (average > type(int128).max || average < type(int128).min) revert LengthOverflow();
            summaryValue = int128(average);
        }
    }

    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    )
        external
        view
        returns (
            address[] memory clients,
            uint64[] memory feedbackIndexes,
            int128[] memory values,
            uint8[] memory valueDecimals,
            string[] memory tag1s,
            string[] memory tag2s,
            bool[] memory revokedStatuses
        )
    {
        address[] memory selected;
        if (clientAddresses.length == 0) {
            selected = _clients[agentId];
        } else {
            selected = clientAddresses;
        }
        uint256 matches;
        for (uint256 i; i < selected.length; ++i) {
            for (uint64 j = 1; j <= _lastIndex[agentId][selected[i]]; ++j) {
                Feedback storage item = _feedback[agentId][selected[i]][j];
                if ((includeRevoked || !item.isRevoked) && _matches(item, tag1, tag2)) ++matches;
            }
        }
        clients = new address[](matches);
        feedbackIndexes = new uint64[](matches);
        values = new int128[](matches);
        valueDecimals = new uint8[](matches);
        tag1s = new string[](matches);
        tag2s = new string[](matches);
        revokedStatuses = new bool[](matches);
        uint256 cursor;
        for (uint256 i; i < selected.length; ++i) {
            for (uint64 j = 1; j <= _lastIndex[agentId][selected[i]]; ++j) {
                Feedback storage item = _feedback[agentId][selected[i]][j];
                if ((!includeRevoked && item.isRevoked) || !_matches(item, tag1, tag2)) continue;
                clients[cursor] = selected[i];
                feedbackIndexes[cursor] = j;
                values[cursor] = item.value;
                valueDecimals[cursor] = item.valueDecimals;
                tag1s[cursor] = item.tag1;
                tag2s[cursor] = item.tag2;
                revokedStatuses[cursor] = item.isRevoked;
                ++cursor;
            }
        }
    }

    function getResponseCount(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        address[] calldata responders
    ) external view returns (uint64 count) {
        if (feedbackIndex == 0 || feedbackIndex > _lastIndex[agentId][clientAddress]) {
            revert FeedbackDoesNotExist();
        }
        for (uint256 i; i < responders.length; ++i) {
            count += _responseCounts[agentId][clientAddress][feedbackIndex][responders[i]];
        }
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return _lastIndex[agentId][clientAddress];
    }

    function _matches(Feedback storage item, string calldata tag1, string calldata tag2) private view returns (bool) {
        return (bytes(tag1).length == 0 || keccak256(bytes(item.tag1)) == keccak256(bytes(tag1)))
            && (bytes(tag2).length == 0 || keccak256(bytes(item.tag2)) == keccak256(bytes(tag2)));
    }

    function _clientSummary(uint256 agentId, address client, string calldata tag1, string calldata tag2)
        private
        view
        returns (uint64 count, int256 scaledSum)
    {
        uint64 last = _lastIndex[agentId][client];
        for (uint64 i = 1; i <= last; ++i) {
            Feedback storage item = _feedback[agentId][client][i];
            if (item.isRevoked || !_matches(item, tag1, tag2)) continue;
            scaledSum += int256(item.value) * int256(10 ** (18 - item.valueDecimals));
            ++count;
        }
    }

    function _emitNewFeedback(
        uint256 agentId,
        uint64 index,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) private {
        Feedback storage item = _feedback[agentId][msg.sender][index];
        emit NewFeedback(
            agentId,
            msg.sender,
            index,
            item.value,
            item.valueDecimals,
            item.tag1,
            item.tag1,
            item.tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
    }
}
