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

/// @dev Test double that can deliver messages to a local receiver without DVNs.
contract MockLzEndpoint is ILayerZeroEndpointV2 {
    uint64 public nextNonce = 1;
    uint256 public quoteNativeFee = 0.001 ether;

    event MockSend(uint32 dstEid, bytes32 receiver, bytes message, bytes32 guid);

    function setQuoteNativeFee(uint256 fee) external {
        quoteNativeFee = fee;
    }

    function quote(MessagingParams calldata, address) external view returns (MessagingFee memory) {
        return MessagingFee({nativeFee: quoteNativeFee, lzTokenFee: 0});
    }

    function send(MessagingParams calldata params, address)
        external
        payable
        returns (MessagingReceipt memory receipt)
    {
        require(msg.value >= quoteNativeFee, "fee");
        bytes32 guid = keccak256(abi.encodePacked(block.timestamp, nextNonce, params.message));
        receipt = MessagingReceipt({
            guid: guid,
            nonce: nextNonce,
            fee: MessagingFee({nativeFee: quoteNativeFee, lzTokenFee: 0})
        });
        nextNonce += 1;
        emit MockSend(params.dstEid, params.receiver, params.message, guid);
    }

    /// @notice Deliver a message as if LayerZero executor called the OApp.
    function deliver(
        address receiver,
        uint32 srcEid,
        bytes32 sender,
        bytes32 guid,
        bytes calldata message
    ) external {
        Origin memory origin = Origin({srcEid: srcEid, sender: sender, nonce: nextNonce});
        nextNonce += 1;
        ILayerZeroReceiver(receiver).lzReceive(origin, guid, message, msg.sender, "");
    }
}
