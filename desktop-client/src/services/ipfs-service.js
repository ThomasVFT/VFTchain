// IPFS Service for Decentralized Storage
// Handles all IPFS operations for the VFT desktop client

const { create } = require('ipfs-http-client');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class IPFSService {
    constructor() {
        this.client = null;
        this.connected = false;
        this.uploadProgress = new Map();
        
        // IPFS endpoints - can use public gateways or local node
        this.endpoints = [
            { url: 'https://ipfs.infura.io:5001', name: 'Infura' },
            { url: 'http://localhost:5001', name: 'Local' },
            { url: 'https://api.pinata.cloud', name: 'Pinata' }
        ];
        
        this.currentEndpoint = null;
    }

    async initialize() {
        console.log('[IPFS] Initializing IPFS service...');
        
        // Try to connect to available IPFS endpoints
        for (const endpoint of this.endpoints) {
            try {
                console.log(`[IPFS] Trying ${endpoint.name} at ${endpoint.url}`);
                
                const client = create({
                    url: endpoint.url,
                    timeout: 5000
                });
                
                // Test connection
                const version = await client.version();
                console.log(`[IPFS] Connected to ${endpoint.name}:`, version);
                
                this.client = client;
                this.currentEndpoint = endpoint;
                this.connected = true;
                return true;
                
            } catch (error) {
                console.log(`[IPFS] Failed to connect to ${endpoint.name}:`, error.message);
            }
        }
        
        console.error('[IPFS] Could not connect to any IPFS endpoint');
        return false;
    }

    async uploadFile(filePath, options = {}) {
        if (!this.connected) {
            throw new Error('IPFS not connected');
        }

        try {
            console.log(`[IPFS] Uploading file: ${filePath}`);
            const startTime = Date.now();
            
            // Read file
            const fileContent = await fs.readFile(filePath);
            const fileName = path.basename(filePath);
            const fileSize = fileContent.length;
            
            // Calculate hash for verification
            const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
            
            // Create progress tracker
            const progressId = crypto.randomUUID();
            this.uploadProgress.set(progressId, {
                fileName,
                fileSize,
                uploaded: 0,
                startTime,
                status: 'uploading'
            });

            // Upload to IPFS with progress tracking
            const result = await this.client.add(fileContent, {
                progress: (bytes) => {
                    const progress = this.uploadProgress.get(progressId);
                    if (progress) {
                        progress.uploaded = bytes;
                        progress.percentage = Math.round((bytes / fileSize) * 100);
                    }
                },
                pin: options.pin !== false, // Pin by default
                wrapWithDirectory: false
            });

            const uploadTime = Date.now() - startTime;
            const ipfsHash = result.cid.toString();
            
            console.log(`[IPFS] Upload complete:`, {
                ipfsHash,
                fileName,
                fileSize: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
                uploadTime: `${(uploadTime / 1000).toFixed(2)}s`,
                speed: `${(fileSize / uploadTime * 1000 / 1024 / 1024).toFixed(2)} MB/s`
            });

            // Update progress
            const progress = this.uploadProgress.get(progressId);
            if (progress) {
                progress.status = 'complete';
                progress.ipfsHash = ipfsHash;
            }

            return {
                ipfsHash,
                fileName,
                fileSize,
                fileHash,
                uploadTime,
                gateway: this.getGatewayUrl(ipfsHash)
            };

        } catch (error) {
            console.error('[IPFS] Upload failed:', error);
            throw error;
        }
    }

    async uploadData(data, metadata = {}) {
        if (!this.connected) {
            throw new Error('IPFS not connected');
        }

        try {
            // Convert data to buffer if needed
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
            
            const result = await this.client.add(buffer, {
                pin: true,
                ...metadata
            });

            return result.cid.toString();
        } catch (error) {
            console.error('[IPFS] Data upload failed:', error);
            throw error;
        }
    }

    async retrieveFile(ipfsHash, outputPath = null) {
        if (!this.connected) {
            throw new Error('IPFS not connected');
        }

        try {
            console.log(`[IPFS] Retrieving file: ${ipfsHash}`);
            const startTime = Date.now();
            
            const chunks = [];
            for await (const chunk of this.client.cat(ipfsHash)) {
                chunks.push(chunk);
            }
            
            const content = Buffer.concat(chunks);
            const retrieveTime = Date.now() - startTime;
            
            console.log(`[IPFS] Retrieved ${content.length} bytes in ${(retrieveTime / 1000).toFixed(2)}s`);
            
            // Save to file if path provided
            if (outputPath) {
                await fs.writeFile(outputPath, content);
                console.log(`[IPFS] Saved to: ${outputPath}`);
            }
            
            return content;
        } catch (error) {
            console.error('[IPFS] Retrieval failed:', error);
            throw error;
        }
    }

    async pin(ipfsHash) {
        if (!this.connected) {
            throw new Error('IPFS not connected');
        }

        try {
            await this.client.pin.add(ipfsHash);
            console.log(`[IPFS] Pinned: ${ipfsHash}`);
            return true;
        } catch (error) {
            console.error('[IPFS] Pin failed:', error);
            return false;
        }
    }

    async unpin(ipfsHash) {
        if (!this.connected) {
            throw new Error('IPFS not connected');
        }

        try {
            await this.client.pin.rm(ipfsHash);
            console.log(`[IPFS] Unpinned: ${ipfsHash}`);
            return true;
        } catch (error) {
            console.error('[IPFS] Unpin failed:', error);
            return false;
        }
    }

    getGatewayUrl(ipfsHash) {
        // Return multiple gateway options for redundancy
        return {
            primary: `https://ipfs.io/ipfs/${ipfsHash}`,
            cloudflare: `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
            pinata: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
            infura: `https://infura-ipfs.io/ipfs/${ipfsHash}`
        };
    }

    getUploadProgress(progressId) {
        return this.uploadProgress.get(progressId);
    }

    clearProgress(progressId) {
        this.uploadProgress.delete(progressId);
    }

    async getStats() {
        if (!this.connected) {
            return { connected: false };
        }

        try {
            const stats = await this.client.stats.repo();
            return {
                connected: true,
                endpoint: this.currentEndpoint.name,
                repoSize: stats.repoSize,
                numObjects: stats.numObjects,
                ...stats
            };
        } catch (error) {
            console.error('[IPFS] Stats failed:', error);
            return { connected: false, error: error.message };
        }
    }
}

module.exports = IPFSService;