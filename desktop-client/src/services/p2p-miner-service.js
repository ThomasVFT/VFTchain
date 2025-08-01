// P2P Miner Service - Handles job processing with P2P data retrieval
// NO data flows through AWS - only job coordination

class P2PMinerService {
    constructor(ipfsService, p2pTransfer, apiConfig) {
        this.ipfs = ipfsService;
        this.p2p = p2pTransfer;
        this.api = apiConfig;
        this.activeJobs = new Map();
        this.processingJobs = new Map();
    }

    async startMining() {
        console.log('[P2P Miner] Starting P2P mining service...');
        
        // Ensure P2P is connected
        if (!this.ipfs.connected) {
            throw new Error('IPFS required for mining. No centralized data transfer available.');
        }
        
        // Start polling for available jobs (metadata only from AWS)
        this.miningInterval = setInterval(() => {
            this.checkForJobs();
        }, 5000); // Check every 5 seconds
        
        return true;
    }

    async checkForJobs() {
        try {
            // Get available jobs from AWS (metadata only)
            const response = await fetch(this.api.buildUrl('/api/v1/jobs/available'), {
                headers: {
                    'X-Miner-Wallet': await this.getWalletAddress(),
                    'X-Miner-Capabilities': JSON.stringify(await this.getCapabilities())
                }
            });
            
            if (!response.ok) return;
            
            const jobs = await response.json();
            
            for (const jobMeta of jobs) {
                if (!this.processingJobs.has(jobMeta.id)) {
                    console.log(`[P2P Miner] Found job: ${jobMeta.id} - ${jobMeta.name}`);
                    console.log(`[P2P Miner] Data size: ${this.formatBytes(jobMeta.totalDataSize)}`);
                    console.log(`[P2P Miner] IPFS hashes: ${jobMeta.dataHashes.length} files`);
                    
                    // Process this job
                    this.processJob(jobMeta);
                }
            }
        } catch (error) {
            console.error('[P2P Miner] Failed to check jobs:', error);
        }
    }

    async processJob(jobMeta) {
        const jobId = jobMeta.id;
        this.processingJobs.set(jobId, { status: 'claiming' });
        
        try {
            // Step 1: Claim the job with AWS (coordination only)
            console.log(`[P2P Miner] Claiming job ${jobId}...`);
            const claimResponse = await fetch(this.api.buildUrl(`/api/v1/jobs/${jobId}/claim`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    minerWallet: await this.getWalletAddress(),
                    capabilities: await this.getCapabilities()
                })
            });
            
            if (!claimResponse.ok) {
                throw new Error('Failed to claim job');
            }
            
            this.processingJobs.set(jobId, { status: 'downloading' });
            
            // Step 2: Download ALL data from IPFS (P2P)
            console.log(`[P2P Miner] Downloading data from IPFS...`);
            const startTime = Date.now();
            const dataFiles = [];
            
            for (const dataHash of jobMeta.dataHashes) {
                console.log(`[P2P Miner] Retrieving ${dataHash.fileName} (${dataHash.ipfsHash})...`);
                
                try {
                    // Try direct IPFS first
                    const fileData = await this.ipfs.retrieveFile(dataHash.ipfsHash);
                    
                    // Verify integrity
                    const crypto = require('crypto');
                    const checksum = crypto.createHash('sha256').update(fileData).digest('hex');
                    if (checksum !== dataHash.checksum) {
                        throw new Error(`Checksum mismatch for ${dataHash.fileName}`);
                    }
                    
                    dataFiles.push({
                        name: dataHash.fileName,
                        data: fileData,
                        size: dataHash.fileSize
                    });
                    
                    console.log(`[P2P Miner] ✓ Retrieved ${dataHash.fileName} (${this.formatBytes(dataHash.fileSize)})`);
                } catch (ipfsError) {
                    // Try P2P transfer from job submitter
                    console.log(`[P2P Miner] IPFS failed, trying direct P2P from submitter...`);
                    
                    if (jobMeta.submitterId) {
                        const fileData = await this.p2p.requestFile(jobMeta.submitterId, dataHash.ipfsHash);
                        dataFiles.push({
                            name: dataHash.fileName,
                            data: fileData,
                            size: dataHash.fileSize
                        });
                    } else {
                        throw ipfsError;
                    }
                }
            }
            
            const downloadTime = Date.now() - startTime;
            console.log(`[P2P Miner] All data downloaded in ${(downloadTime/1000).toFixed(2)}s`);
            
            // Step 3: Download script from IPFS
            let script = null;
            if (jobMeta.scriptHash) {
                console.log(`[P2P Miner] Downloading job script...`);
                const scriptData = await this.ipfs.retrieveFile(jobMeta.scriptHash);
                script = scriptData.toString('utf-8');
            }
            
            this.processingJobs.set(jobId, { status: 'processing' });
            
            // Step 4: Process the job locally
            console.log(`[P2P Miner] Processing job...`);
            const processStartTime = Date.now();
            
            // This is where actual GPU/CPU processing happens
            const results = await this.executeJob(jobMeta, dataFiles, script);
            
            const processTime = Date.now() - processStartTime;
            console.log(`[P2P Miner] Job processed in ${(processTime/1000).toFixed(2)}s`);
            
            this.processingJobs.set(jobId, { status: 'uploading' });
            
            // Step 5: Upload results to IPFS
            console.log(`[P2P Miner] Uploading results to IPFS...`);
            const resultsBuffer = Buffer.from(JSON.stringify(results));
            const resultsHash = await this.ipfs.uploadData(resultsBuffer, {
                fileName: `results_${jobId}.json`,
                pin: true
            });
            
            console.log(`[P2P Miner] Results uploaded: ${resultsHash}`);
            
            // Step 6: Submit completion to AWS (metadata only)
            await fetch(this.api.buildUrl(`/api/v1/jobs/${jobId}/complete`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    resultsHash: resultsHash,
                    resultSize: resultsBuffer.length,
                    processTime: processTime,
                    downloadTime: downloadTime,
                    minerWallet: await this.getWalletAddress()
                })
            });
            
            console.log(`[P2P Miner] ✓ Job ${jobId} completed successfully!`);
            console.log(`[P2P Miner] Results available at IPFS: ${resultsHash}`);
            
            // Cleanup
            this.processingJobs.delete(jobId);
            
        } catch (error) {
            console.error(`[P2P Miner] Job ${jobId} failed:`, error);
            this.processingJobs.delete(jobId);
            
            // Report failure to AWS
            try {
                await fetch(this.api.buildUrl(`/api/v1/jobs/${jobId}/fail`), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        error: error.message,
                        minerWallet: await this.getWalletAddress()
                    })
                });
            } catch (e) {
                console.error('[P2P Miner] Failed to report job failure:', e);
            }
        }
    }

    async executeJob(jobMeta, dataFiles, script) {
        // Simulate job execution - in real implementation this would:
        // 1. Set up the compute environment (Docker, conda, etc)
        // 2. Load the data into memory/GPU
        // 3. Execute the provided script
        // 4. Capture and return results
        
        console.log(`[P2P Miner] Executing ${jobMeta.computeType} job...`);
        console.log(`[P2P Miner] Framework: ${jobMeta.framework}`);
        console.log(`[P2P Miner] Data files: ${dataFiles.length}`);
        console.log(`[P2P Miner] Total data: ${this.formatBytes(dataFiles.reduce((sum, f) => sum + f.size, 0))}`);
        
        // Simulate processing time based on data size
        const totalSize = dataFiles.reduce((sum, f) => sum + f.size, 0);
        const processingTime = Math.max(5000, totalSize / 1000000); // 1ms per KB minimum 5s
        
        await new Promise(resolve => setTimeout(resolve, processingTime));
        
        // Return mock results
        return {
            jobId: jobMeta.id,
            status: 'completed',
            metrics: {
                dataProcessed: totalSize,
                processingTime: processingTime,
                gpuUtilization: 0.95,
                memoryUsed: totalSize * 2
            },
            outputs: {
                summary: `Processed ${dataFiles.length} files successfully`,
                accuracy: 0.97,
                loss: 0.023
            }
        };
    }

    async getWalletAddress() {
        // Get from secure storage
        return 'miner-wallet-' + Math.random().toString(36).substr(2, 9);
    }

    async getCapabilities() {
        return {
            gpu: {
                count: 1,
                model: 'RTX 4090',
                memory: 24576,
                cuda: '12.0'
            },
            cpu: {
                cores: 16,
                model: 'AMD Ryzen 9 5950X'
            },
            memory: 65536,
            storage: 2000000,
            network: {
                bandwidth: 1000, // Mbps
                p2pEnabled: true,
                ipfsNode: true
            }
        };
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    stopMining() {
        if (this.miningInterval) {
            clearInterval(this.miningInterval);
            this.miningInterval = null;
        }
        console.log('[P2P Miner] Mining stopped');
    }
}

module.exports = P2PMinerService;