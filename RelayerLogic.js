const ethers = require('ethers');
const TronWeb = require('tronweb');
require('dotenv').config();

class CrossChainBridgeRelayer {
    constructor() {
        // Ethereum Provider (Sepolia via Alchemy)
        this.ethProvider = new ethers.providers.JsonRpcProvider(
            `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_SEPOLIA_API_KEY}`,
            'sepolia'
        );
        
        // Tron Provider (Shasta)
        this.tronWeb = new TronWeb({
            fullHost: 'https://api.shasta.trongrid.io',
            privateKey: process.env.TRON_PRIVATE_KEY
        });

        // Ethereum Bridge Contract Configuration
        this.ethBridgeContract = new ethers.Contract(
            process.env.ETH_BRIDGE_CONTRACT_ADDRESS, 
            [
                // ABI for Bridge and Claim events
                "event Bridge(address indexed sender, uint256 amount, bytes32 indexed depositId, uint256 destinationChainId)",
                "event Claim(address indexed recipient, uint256 amount, bytes32 indexed depositId, uint256 sourceChainId)",
                
                // Claim function
                "function claim(address recipient, uint256 amount, bytes32 depositId, uint256 sourceChainId) external"
            ],
            this.ethProvider.getSigner()
        );

        // Tron Bridge Contract Configuration
        this.tronBridgeContract = this.tronWeb.contract([
            {
                "inputs": [
                    {"name": "recipient", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                    {"name": "depositId", "type": "bytes32"},
                    {"name": "sourceChainId", "type": "uint256"}
                ],
                "name": "claim",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            }
        ], process.env.TRON_BRIDGE_CONTRACT_ADDRESS);

        // Chain IDs
        this.SEPOLIA_CHAIN_ID = 11155111;
        this.SHASTA_CHAIN_ID = 2494;
    }

    async initializeListeners() {
        try {
            // Listen to Ethereum Bridge Events
            this.ethBridgeContract.on('Bridge', async (sender, amount, depositId, destinationChainId) => {
                if (destinationChainId === this.SHASTA_CHAIN_ID) {
                    await this.processTronBridge(sender, amount, depositId);
                }
            });

            // Listen to Tron Bridge Events (using TronWeb event watching)
            this.tronBridgeContract.Bridge().watch((err, event) => {
                if (err) {
                    console.error('Tron Bridge Event Error:', err);
                    return;
                }

                const { sender, amount, depositId, destinationChainId } = event.result;
                
                if (destinationChainId === this.SEPOLIA_CHAIN_ID) {
                    this.processEthBridge(sender, amount, depositId);
                }
            });

            console.log('Bridge Event Listeners Initialized');
        } catch (error) {
            console.error('Listener Initialization Error:', error);
            this.restartListeners();
        }
    }

    async processTronBridge(sender, amount, depositId) {
        try {
            // Validate transaction (add more robust validation)
            const tx = await this.tronBridgeContract.claim(
                sender, 
                amount, 
                depositId, 
                this.SEPOLIA_CHAIN_ID
            ).send({
                feeLimit: 100_000_000 // Adjust as needed
            });

            console.log('Tron Bridge Claim Processed:', tx);
        } catch (error) {
            console.error('Tron Bridge Processing Error:', error);
            // Implement retry mechanism or logging
        }
    }

    async processEthBridge(sender, amount, depositId) {
        try {
            // Validate transaction 
            const tx = await this.ethBridgeContract.claim(
                sender, 
                amount, 
                depositId, 
                this.SHASTA_CHAIN_ID
            );

            console.log('Ethereum Bridge Claim Processed:', tx.hash);
        } catch (error) {
            console.error('Ethereum Bridge Processing Error:', error);
            // Implement retry mechanism or logging
        }
    }

    async restartListeners() {
        console.log('Restarting Bridge Listeners');
        setTimeout(() => {
            this.initializeListeners();
        }, 5000); // Retry after 5 seconds
    }

    async start() {
        try {
            // Validate network connections
            await Promise.all([
                this.ethProvider.getNetwork(),
                this.tronWeb.isConnected()
            ]);

            // Initialize event listeners
            await this.initializeListeners();
        } catch (error) {
            console.error('Bridge Startup Error:', error);
            this.restartListeners();
        }
    }
}

// Environment Setup and Execution
async function runBridgeRelayer() {
    const relayer = new CrossChainBridgeRelayer();
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    await relayer.start();
}

runBridgeRelayer().catch(console.error);

module.exports = CrossChainBridgeRelayer;
