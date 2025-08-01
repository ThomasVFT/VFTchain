// Enhanced IPFS Service with Multiple Connection Options
// Users don't need their own IPFS node - we provide alternatives

const { create } = require('ipfs-http-client');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class IPFSServiceEnhanced {
    constructor() {
        this.client = null;
        this.connected = false;
        this.connectionType = null;
        
        // Connection options in priority order
        this.connectionOptions = [
            {
                name: 'VFT Gateway',
                type: 'managed',
                url: 'https://ipfs.vftchain.com',
                description: 'VFT managed IPFS gateway (recommended)',
                requiresAuth: true
            },
            {
                name: 'Pinata',
                type: 'pinning-service',
                url: 'https://api.pinata.cloud',
                description: 'Pinata pinning service',
                requiresAuth: true,
                headers: () => ({
                    'pinata_api_key': localStorage.getItem('pinata_api_key'),
                    'pinata_secret_api_key': localStorage.getItem('pinata_secret_key')
                })
            },
            {
                name: 'Infura',
                type: 'public',
                url: 'https://ipfs.infura.io:5001',
                description: 'Infura public IPFS',
                requiresAuth: true,
                headers: () => ({
                    'Authorization': 'Basic ' + btoa(localStorage.getItem('infura_project_id') + ':' + localStorage.getItem('infura_secret'))
                })
            },
            {
                name: 'Local Node',
                type: 'local',
                url: 'http://localhost:5001',
                description: 'Your local IPFS node',
                requiresAuth: false
            },
            {
                name: 'Web3.Storage',
                type: 'pinning-service',
                url: 'https://api.web3.storage',
                description: 'Web3.Storage (free tier available)',
                requiresAuth: true,
                headers: () => ({
                    'Authorization': 'Bearer ' + localStorage.getItem('web3storage_token')
                })
            }
        ];
    }

    async initialize() {
        console.log('[IPFS] Initializing IPFS service...');
        
        // Try each connection option
        for (const option of this.connectionOptions) {
            if (await this.tryConnection(option)) {
                return true;
            }
        }
        
        // If all fail, offer to set up a managed connection
        console.error('[IPFS] No IPFS connection available');
        await this.offerManagedSetup();
        return false;
    }

    async tryConnection(option) {
        try {
            console.log(`[IPFS] Trying ${option.name}...`);
            
            // Check if authentication is needed
            if (option.requiresAuth && option.type !== 'managed') {
                const headers = option.headers ? option.headers() : {};
                const hasAuth = Object.values(headers).every(v => v && v !== 'null');
                
                if (!hasAuth) {
                    console.log(`[IPFS] ${option.name} requires authentication - skipping`);
                    return false;
                }
            }
            
            // Create client based on type
            let client;
            if (option.type === 'managed') {
                // Use VFT's managed IPFS infrastructure
                client = await this.connectToVFTGateway();
            } else if (option.type === 'pinning-service') {
                client = await this.connectToPinningService(option);
            } else {
                // Standard IPFS HTTP client
                client = create({
                    url: option.url,
                    headers: option.headers ? option.headers() : {},
                    timeout: 5000
                });
            }
            
            // Test connection
            const version = await client.version();
            
            console.log(`[IPFS] Connected to ${option.name}:`, version);
            this.client = client;
            this.connectionType = option;
            this.connected = true;
            
            return true;
            
        } catch (error) {
            console.log(`[IPFS] ${option.name} failed:`, error.message);
            return false;
        }
    }

    async connectToVFTGateway() {
        // Connect to VFT's managed IPFS infrastructure
        // This handles all the complexity for users
        
        const walletAddress = await this.getWalletAddress();
        
        // Get temporary IPFS credentials from VFT API
        const response = await fetch('https://api.vftchain.com/api/v1/ipfs/access', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                walletAddress: walletAddress,
                purpose: 'desktop-client'
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to get VFT IPFS access');
        }
        
        const { endpoint, token } = await response.json();
        
        return create({
            url: endpoint,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    }

    async connectToPinningService(option) {
        if (option.name === 'Pinata') {
            // Special handling for Pinata
            const PinataSDK = require('@pinata/sdk');
            const pinata = new PinataSDK(
                localStorage.getItem('pinata_api_key'),
                localStorage.getItem('pinata_secret_key')
            );
            
            // Wrap Pinata SDK to match IPFS interface
            return {
                add: async (content) => {
                    const result = await pinata.pinJSONToIPFS(content);
                    return { cid: { toString: () => result.IpfsHash } };
                },
                cat: async (hash) => {
                    const url = `https://gateway.pinata.cloud/ipfs/${hash}`;
                    const response = await fetch(url);
                    return response.arrayBuffer();
                },
                version: async () => ({ version: 'pinata-sdk' })
            };
        }
        
        // Generic pinning service
        return create({
            url: option.url,
            headers: option.headers()
        });
    }

    async offerManagedSetup() {
        // Show user-friendly setup dialog
        const setupMessage = `
IPFS Connection Required for VFT Platform

We couldn't connect to IPFS automatically. You have several options:

1. **Use VFT Gateway (Recommended)**
   - No setup required
   - Just connect your wallet
   - We handle all IPFS complexity
   
2. **Use Pinata (Free tier available)**
   - Sign up at pinata.cloud
   - Get your API keys
   - Enter them in settings
   
3. **Install IPFS Desktop**
   - Download from ipfs.io
   - Run IPFS Desktop app
   - We'll connect automatically

Would you like to use the VFT Gateway?
        `;
        
        if (confirm(setupMessage)) {
            // Auto-setup VFT gateway
            await this.setupVFTGateway();
        } else {
            // Show settings dialog
            this.showIPFSSettings();
        }
    }

    async setupVFTGateway() {
        try {
            // Simple one-click setup
            console.log('[IPFS] Setting up VFT Gateway...');
            
            const walletAddress = await this.getWalletAddress();
            if (!walletAddress) {
                alert('Please connect your wallet first');
                return;
            }
            
            // Try VFT gateway connection
            const vftOption = this.connectionOptions.find(o => o.name === 'VFT Gateway');
            if (await this.tryConnection(vftOption)) {
                alert('Connected to VFT IPFS Gateway! You can now submit jobs.');
                
                // Save preference
                localStorage.setItem('preferred_ipfs', 'vft-gateway');
            } else {
                alert('Failed to connect to VFT Gateway. Please try another option.');
                this.showIPFSSettings();
            }
            
        } catch (error) {
            console.error('[IPFS] VFT Gateway setup failed:', error);
            alert('Setup failed. Please try another connection option.');
        }
    }

    showIPFSSettings() {
        // This would open a settings dialog in the Electron app
        if (window.electronAPI) {
            window.electronAPI.openIPFSSettings();
        } else {
            console.log('[IPFS] Opening settings...');
            // Web fallback
            window.open('https://docs.vftchain.com/ipfs-setup', '_blank');
        }
    }

    async uploadFile(filePath, options = {}) {
        if (!this.connected) {
            throw new Error('IPFS not connected. Please set up IPFS in settings.');
        }

        // If using VFT Gateway, we handle everything
        if (this.connectionType.name === 'VFT Gateway') {
            return await this.uploadViaVFTGateway(filePath, options);
        }
        
        // Standard IPFS upload (existing code)
        return await this.standardIPFSUpload(filePath, options);
    }

    async uploadViaVFTGateway(filePath, options) {
        // VFT Gateway handles pinning, redundancy, and CDN
        console.log('[IPFS] Uploading via VFT Gateway (managed)...');
        
        const fileContent = await fs.readFile(filePath);
        const fileName = path.basename(filePath);
        
        // Upload through VFT's optimized pipeline
        const formData = new FormData();
        formData.append('file', new Blob([fileContent]), fileName);
        formData.append('options', JSON.stringify({
            pin: true,
            replicate: 3, // 3x redundancy
            cdn: true,    // CDN acceleration
            ...options
        }));
        
        const response = await fetch('https://api.vftchain.com/api/v1/ipfs/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.client.token}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('VFT Gateway upload failed');
        }
        
        const result = await response.json();
        
        return {
            ipfsHash: result.ipfsHash,
            fileName: fileName,
            fileSize: fileContent.length,
            gateway: {
                primary: `https://ipfs.vftchain.com/ipfs/${result.ipfsHash}`,
                cdn: `https://cdn.vftchain.com/ipfs/${result.ipfsHash}`,
                fallback: `https://ipfs.io/ipfs/${result.ipfsHash}`
            },
            pinned: true,
            replicated: true
        };
    }

    async getWalletAddress() {
        // Get from secure storage or wallet connection
        if (window.electronAPI) {
            return await window.electronAPI.getWalletAddress();
        }
        return localStorage.getItem('wallet_address');
    }

    // Backward compatibility
    async standardIPFSUpload(filePath, options) {
        // Original upload code
        const fileContent = await fs.readFile(filePath);
        const result = await this.client.add(fileContent, {
            pin: options.pin !== false,
            ...options
        });
        
        return {
            ipfsHash: result.cid.toString(),
            fileName: path.basename(filePath),
            fileSize: fileContent.length,
            gateway: this.getGatewayUrl(result.cid.toString())
        };
    }

    getConnectionStatus() {
        if (!this.connected) {
            return {
                connected: false,
                message: 'Not connected to IPFS'
            };
        }
        
        return {
            connected: true,
            type: this.connectionType.name,
            description: this.connectionType.description,
            managed: this.connectionType.type === 'managed'
        };
    }
}

module.exports = IPFSServiceEnhanced;