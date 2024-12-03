// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;


contract TronBridge{
    // Bridge fee (can be adjusted)
    uint256 public bridgeFee = 1 trx;

    // Mapping to track locked native tokens
    mapping(address => uint256) public lockedTokens;

    // Events following standard bridge protocols
    event Bridge(
        address indexed sender, 
        uint256 amount, 
        bytes32 indexed depositId,
        uint256 destinationChainId
    );

    event Claim(
        address indexed recipient, 
        uint256 amount, 
        bytes32 indexed depositId,
        uint256 sourceChainId
    );

    // Bridge native tokens to Ethereum
    function bridge(uint256 destinationChainId) external payable {
        require(msg.value > bridgeFee, "Insufficient bridge amount");
        
        uint256 bridgeAmount = msg.value - bridgeFee;
        
        // Generate unique deposit ID
        bytes32 depositId = keccak256(
            abi.encodePacked(msg.sender, bridgeAmount, block.timestamp, destinationChainId)
        );

        // Lock tokens
        lockedTokens[msg.sender] += bridgeAmount;

        emit Bridge(
            msg.sender, 
            bridgeAmount, 
            depositId, 
            destinationChainId
        );
    }

    // Claim bridged tokens (to be called by relayer)
    function claim(
        address recipient, 
        uint256 amount, 
        bytes32 depositId, 
        uint256 sourceChainId
    ) external{
        require(lockedTokens[recipient] >= amount, "Insufficient locked tokens");

        // Unlock and transfer
        lockedTokens[recipient] -= amount;
        
        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "Transfer failed");

        emit Claim(
            recipient, 
            amount, 
            depositId, 
            sourceChainId
        );
    }

    // Update bridge fee
    function updateBridgeFee(uint256 newFee) external{
        bridgeFee = newFee;
    }

    // Withdraw accumulated fees
    function withdrawFees() external{
        payable(msg.sender).transfer(address(this).balance);
    }

    // Allow contract to receive native tokens
    receive() external payable {}
}
