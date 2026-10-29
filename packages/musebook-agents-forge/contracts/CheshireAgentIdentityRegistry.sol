// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}

/// @title CheshireAgentIdentityRegistry
/// @notice ERC-8004 identity singleton for Robinhood Chain.
/// @dev Dependency-free ERC-721 implementation with URI, arbitrary metadata, and
///      EIP-712/ERC-1271 verification for the reserved agentWallet metadata key.
contract CheshireAgentIdentityRegistry {
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    string public constant name = "Cheshire Robinhood Agents";
    string public constant symbol = "RHAGENT";
    string public constant VERSION = "1";
    bytes4 private constant ERC721_RECEIVED = 0x150b7a02;
    bytes4 private constant ERC1271_MAGIC_VALUE = 0x1626ba7e;
    bytes32 private constant AGENT_WALLET_KEY = keccak256("agentWallet");
    bytes32 private constant SET_AGENT_WALLET_TYPEHASH =
        keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    uint256 private _nextAgentId = 1;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(uint256 => string) private _agentURIs;
    mapping(uint256 => mapping(bytes32 => bytes)) private _metadata;
    mapping(uint256 => address) private _agentWallets;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
    event MetadataSet(
        uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue
    );

    error AgentDoesNotExist();
    error NotAuthorized();
    error InvalidRecipient();
    error UnsafeRecipient();
    error ReservedMetadataKey();
    error InvalidWalletProof();
    error SignatureExpired();

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f;
    }

    function totalSupply() external view returns (uint256) {
        return _nextAgentId - 1;
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert InvalidRecipient();
        return _balances[owner];
    }

    function ownerOf(uint256 agentId) public view returns (address owner) {
        owner = _owners[agentId];
        if (owner == address(0)) revert AgentDoesNotExist();
    }

    function tokenURI(uint256 agentId) external view returns (string memory) {
        ownerOf(agentId);
        return _agentURIs[agentId];
    }

    function agentURI(uint256 agentId) external view returns (string memory) {
        ownerOf(agentId);
        return _agentURIs[agentId];
    }

    function getApproved(uint256 agentId) external view returns (address) {
        ownerOf(agentId);
        return _tokenApprovals[agentId];
    }

    function isApprovedForAll(address owner, address operator) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function approve(address approved, uint256 agentId) external {
        address owner = ownerOf(agentId);
        if (msg.sender != owner && !_operatorApprovals[owner][msg.sender]) revert NotAuthorized();
        _tokenApprovals[agentId] = approved;
        emit Approval(owner, approved, agentId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        if (operator == msg.sender) revert NotAuthorized();
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 agentId) public {
        if (!_isAuthorized(msg.sender, agentId)) revert NotAuthorized();
        if (ownerOf(agentId) != from) revert NotAuthorized();
        if (to == address(0)) revert InvalidRecipient();
        _transfer(from, to, agentId);
    }

    function safeTransferFrom(address from, address to, uint256 agentId) external {
        safeTransferFrom(from, to, agentId, "");
    }

    function safeTransferFrom(address from, address to, uint256 agentId, bytes memory data) public {
        transferFrom(from, to, agentId);
        if (to.code.length != 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, agentId, data) returns (bytes4 result) {
                if (result != ERC721_RECEIVED) revert UnsafeRecipient();
            } catch {
                revert UnsafeRecipient();
            }
        }
    }

    function register() external returns (uint256 agentId) {
        MetadataEntry[] memory metadata = new MetadataEntry[](0);
        return _register("", metadata);
    }

    function register(string calldata uri) external returns (uint256 agentId) {
        MetadataEntry[] memory metadata = new MetadataEntry[](0);
        return _register(uri, metadata);
    }

    function register(string calldata uri, MetadataEntry[] calldata metadata) external returns (uint256 agentId) {
        agentId = _nextAgentId++;
        _mint(msg.sender, agentId);
        _agentURIs[agentId] = uri;
        _setInitialWallet(agentId, msg.sender);
        for (uint256 i; i < metadata.length; ++i) {
            _setMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
        emit Registered(agentId, uri, msg.sender);
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        if (!_isAuthorized(msg.sender, agentId)) revert NotAuthorized();
        _agentURIs[agentId] = newURI;
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function getMetadata(uint256 agentId, string calldata metadataKey) external view returns (bytes memory) {
        ownerOf(agentId);
        if (keccak256(bytes(metadataKey)) == AGENT_WALLET_KEY) return abi.encode(_agentWallets[agentId]);
        return _metadata[agentId][keccak256(bytes(metadataKey))];
    }

    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue) external {
        if (!_isAuthorized(msg.sender, agentId)) revert NotAuthorized();
        _setMetadata(agentId, metadataKey, metadataValue);
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        ownerOf(agentId);
        return _agentWallets[agentId];
    }

    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external {
        if (msg.sender != ownerOf(agentId)) revert NotAuthorized();
        if (newWallet == address(0)) revert InvalidRecipient();
        if (block.timestamp > deadline) revert SignatureExpired();
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator(),
                keccak256(abi.encode(SET_AGENT_WALLET_TYPEHASH, agentId, newWallet, deadline))
            )
        );
        if (!_validWalletSignature(newWallet, digest, signature)) revert InvalidWalletProof();
        _setAgentWallet(agentId, newWallet);
    }

    function unsetAgentWallet(uint256 agentId) external {
        if (msg.sender != ownerOf(agentId)) revert NotAuthorized();
        _setAgentWallet(agentId, address(0));
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes(VERSION)), block.chainid, address(this))
        );
    }

    function walletProofDigest(uint256 agentId, address newWallet, uint256 deadline) external view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator(),
                keccak256(abi.encode(SET_AGENT_WALLET_TYPEHASH, agentId, newWallet, deadline))
            )
        );
    }

    function isAuthorized(address operator, uint256 agentId) external view returns (bool) {
        ownerOf(agentId);
        return _isAuthorized(operator, agentId);
    }

    function _register(string memory uri, MetadataEntry[] memory metadata) private returns (uint256 agentId) {
        agentId = _nextAgentId++;
        _mint(msg.sender, agentId);
        _agentURIs[agentId] = uri;
        _setInitialWallet(agentId, msg.sender);
        for (uint256 i; i < metadata.length; ++i) {
            _setMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
        emit Registered(agentId, uri, msg.sender);
    }

    function _mint(address to, uint256 agentId) private {
        if (to == address(0)) revert InvalidRecipient();
        _owners[agentId] = to;
        ++_balances[to];
        emit Transfer(address(0), to, agentId);
    }

    function _transfer(address from, address to, uint256 agentId) private {
        delete _tokenApprovals[agentId];
        --_balances[from];
        ++_balances[to];
        _owners[agentId] = to;
        emit Transfer(from, to, agentId);
        if (_agentWallets[agentId] != address(0)) _setAgentWallet(agentId, address(0));
    }

    function _setMetadata(uint256 agentId, string memory key, bytes memory value) private {
        bytes32 keyHash = keccak256(bytes(key));
        if (keyHash == AGENT_WALLET_KEY) revert ReservedMetadataKey();
        _metadata[agentId][keyHash] = value;
        emit MetadataSet(agentId, key, key, value);
    }

    function _setInitialWallet(uint256 agentId, address wallet) private {
        _agentWallets[agentId] = wallet;
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encode(wallet));
    }

    function _setAgentWallet(uint256 agentId, address wallet) private {
        _agentWallets[agentId] = wallet;
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encode(wallet));
    }

    function _isAuthorized(address operator, uint256 agentId) private view returns (bool) {
        address owner = _owners[agentId];
        return operator == owner || _tokenApprovals[agentId] == operator || _operatorApprovals[owner][operator];
    }

    function _validWalletSignature(address wallet, bytes32 digest, bytes calldata signature)
        private
        view
        returns (bool)
    {
        if (wallet.code.length != 0) {
            try IERC1271(wallet).isValidSignature(digest, signature) returns (bytes4 result) {
                return result == ERC1271_MAGIC_VALUE;
            } catch {
                return false;
            }
        }
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return false;
        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0) return false;
        address recovered = ecrecover(digest, v, r, s);
        return recovered != address(0) && recovered == wallet;
    }
}
