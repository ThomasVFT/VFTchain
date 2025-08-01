// Hybrid Job Service - Combines AWS coordination with P2P data transfer
// Handles job submission with IPFS storage and direct peer transfers

class HybridJobService {
    constructor(ipfsService, p2pTransfer, apiConfig) {
        this.ipfs = ipfsService;
        this.p2p = p2pTransfer;
        this.api = apiConfig;
        this.activeJobs = new Map();
    }

    async submitJob(jobData, dataFiles = []) {
        console.log('[Hybrid] Submitting job with P2P data transfer');
        
        try {
            // Step 1: Upload data files to IPFS
            const dataHashes = [];
            let totalDataSize = 0;
            
            for (const file of dataFiles) {
                console.log(`[Hybrid] Uploading ${file.name} to IPFS...`);
                
                const uploadResult = await this.ipfs.uploadFile(file.path, {
                    pin: true,
                    metadata: {
                        jobId: jobData.id,
                        fileName: file.name,
                        mimeType: file.type
                    }
                });
                
                dataHashes.push({
                    ipfsHash: uploadResult.ipfsHash,
                    fileName: uploadResult.fileName,
                    fileSize: uploadResult.fileSize,
                    checksum: uploadResult.fileHash
                });
                
                totalDataSize += uploadResult.fileSize;
                
                console.log(`[Hybrid] File uploaded to IPFS: ${uploadResult.ipfsHash}`);
            }
            
            // Step 2: Upload job script to IPFS if provided
            let scriptHash = null;
            if (jobData.script) {
                const scriptBuffer = Buffer.from(jobData.script);
                scriptHash = await this.ipfs.uploadData(scriptBuffer, {
                    fileName: 'job_script.py',
                    mimeType: 'text/x-python'
                });
                console.log(`[Hybrid] Script uploaded to IPFS: ${scriptHash}`);
            }
            
            // Step 3: Create job metadata (small payload for AWS)
            const jobMetadata = {
                id: jobData.id,
                name: jobData.name,
                computeType: jobData.computeType,
                framework: jobData.framework,
                
                // IPFS hashes instead of actual data
                dataHashes: dataHashes,
                scriptHash: scriptHash,
                totalDataSize: totalDataSize,
                
                // Resource requirements
                requirements: {
                    gpuCount: jobData.gpuCount,
                    minGpuMemory: jobData.minGpuMemory,
                    gpuType: jobData.gpuType,
                    systemMemory: jobData.systemMemory,
                    storageRequired: jobData.storageRequired
                },
                
                // Job settings
                settings: {
                    priority: jobData.priority,
                    enableP2P: true,
                    enableSharding: jobData.enableSharding,
                    enableCompression: jobData.enableCompression,
                    enableCaching: jobData.enableCaching,
                    checkpointInterval: jobData.checkpointInterval
                },
                
                // Metadata only - no actual data
                status: 'pending',
                timestamp: new Date().toISOString(),
                estimatedCost: jobData.estimatedCost,
                submittedBy: await this.getWalletAddress()
            };
            
            // Step 4: Submit metadata to AWS (lightweight)
            console.log('[Hybrid] Submitting job metadata to AWS...');
            const response = await fetch(this.api.buildUrl('/api/v1/jobs/create'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-P2P-Enabled': 'true'
                },
                body: JSON.stringify(jobMetadata)
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const result = await response.json();
            const backendJobId = result.job.id;
            
            console.log(`[Hybrid] Job registered with ID: ${backendJobId}`);
            
            // Step 5: Store job info locally for P2P coordination
            this.activeJobs.set(backendJobId, {
                metadata: jobMetadata,
                dataHashes: dataHashes,
                scriptHash: scriptHash,
                status: 'pending',
                miners: new Set(),
                transfers: new Map()
            });
            
            // Step 6: Announce job availability to P2P network
            this.p2p.emit('job-available', {
                jobId: backendJobId,
                requirements: jobMetadata.requirements,
                dataSize: totalDataSize,
                reward: jobData.estimatedCost
            });
            
            return {
                success: true,
                jobId: backendJobId,
                dataStorage: 'IPFS',
                dataHashes: dataHashes,
                message: 'Job submitted with P2P data distribution'
            };
            
        } catch (error) {
            console.error('[Hybrid] Job submission failed:', error);
            throw error;
        }
    }

    async acceptJobAsMiner(jobId) {
        console.log(`[Hybrid] Accepting job ${jobId} as miner`);
        
        try {
            // Step 1: Get job metadata from AWS
            const response = await fetch(this.api.buildUrl(`/api/v1/jobs/${jobId}`));
            if (!response.ok) throw new Error('Job not found');
            
            const jobData = await response.json();
            
            // Step 2: Register as miner with AWS
            await fetch(this.api.buildUrl(`/api/v1/jobs/${jobId}/claim`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    minerWallet: await this.getWalletAddress(),
                    capabilities: await this.getSystemCapabilities()
                })
            });
            
            // Step 3: Retrieve data from IPFS
            console.log('[Hybrid] Retrieving job data from IPFS...');
            const dataFiles = [];
            
            for (const dataHash of jobData.dataHashes) {
                console.log(`[Hybrid] Downloading ${dataHash.fileName} from IPFS...`);
                
                const fileData = await this.ipfs.retrieveFile(dataHash.ipfsHash);
                dataFiles.push({
                    name: dataHash.fileName,
                    data: fileData,
                    size: dataHash.fileSize
                });
                
                // Verify checksum
                const crypto = require('crypto');
                const checksum = crypto.createHash('sha256').update(fileData).digest('hex');
                if (checksum !== dataHash.checksum) {
                    throw new Error(`Checksum mismatch for ${dataHash.fileName}`);
                }
            }
            
            // Step 4: Retrieve script if present
            let script = null;
            if (jobData.scriptHash) {
                const scriptData = await this.ipfs.retrieveFile(jobData.scriptHash);
                script = scriptData.toString('utf-8');
            }
            
            console.log('[Hybrid] All job data retrieved successfully');
            
            return {
                jobId: jobId,
                jobData: jobData,
                dataFiles: dataFiles,
                script: script,
                status: 'ready_to_process'
            };
            
        } catch (error) {
            console.error('[Hybrid] Failed to accept job:', error);
            throw error;
        }
    }

    async submitResults(jobId, results) {
        console.log(`[Hybrid] Submitting results for job ${jobId}`);
        
        try {
            // Step 1: Upload results to IPFS
            const resultsBuffer = Buffer.isBuffer(results) ? results : Buffer.from(JSON.stringify(results));
            const resultsHash = await this.ipfs.uploadData(resultsBuffer, {
                fileName: `results_${jobId}.json`,
                mimeType: 'application/json'
            });
            
            console.log(`[Hybrid] Results uploaded to IPFS: ${resultsHash}`);
            
            // Step 2: Submit results hash to AWS
            const response = await fetch(this.api.buildUrl(`/api/v1/jobs/${jobId}/results`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    resultsHash: resultsHash,
                    resultSize: resultsBuffer.length,
                    completedAt: new Date().toISOString(),
                    minerWallet: await this.getWalletAddress()
                })
            });
            
            if (!response.ok) throw new Error('Failed to submit results');
            
            // Step 3: Make results available for P2P transfer
            const job = this.activeJobs.get(jobId);
            if (job) {
                job.resultsHash = resultsHash;
                job.status = 'completed';
            }
            
            return {
                success: true,
                resultsHash: resultsHash,
                message: 'Results submitted to IPFS and registered with platform'
            };
            
        } catch (error) {
            console.error('[Hybrid] Failed to submit results:', error);
            throw error;
        }
    }

    async enableDirectTransfer(jobId, peerId) {
        // Enable direct P2P transfer for large datasets
        console.log(`[Hybrid] Enabling direct transfer for job ${jobId} with peer ${peerId}`);
        
        const job = this.activeJobs.get(jobId);
        if (!job) throw new Error('Job not found');
        
        try {
            // Connect to peer
            await this.p2p.connectToPeer(peerId);
            
            // Transfer data files directly
            for (const dataHash of job.dataHashes) {
                console.log(`[Hybrid] Direct transfer of ${dataHash.fileName} to ${peerId}`);
                
                // Retrieve from IPFS
                const fileData = await this.ipfs.retrieveFile(dataHash.ipfsHash);
                
                // Send directly to peer
                const transferId = await this.p2p.sendFile(peerId, fileData, {
                    fileName: dataHash.fileName,
                    ipfsHash: dataHash.ipfsHash,
                    jobId: jobId
                });
                
                job.transfers.set(transferId, {
                    peerId: peerId,
                    fileName: dataHash.fileName,
                    status: 'transferring'
                });
            }
            
            return {
                success: true,
                message: 'Direct P2P transfer initiated'
            };
            
        } catch (error) {
            console.error('[Hybrid] Direct transfer failed:', error);
            throw error;
        }
    }

    async getWalletAddress() {
        // Get wallet address from secure storage or Electron main process
        return window.electronAPI ? 
            await window.electronAPI.getWalletAddress() : 
            'demo-wallet-address';
    }

    async getSystemCapabilities() {
        // Get system capabilities for miner registration
        return {
            gpuCount: 1,
            gpuType: 'RTX 4090',
            gpuMemory: 24,
            systemMemory: 64,
            storageAvailable: 1000,
            p2pEnabled: true,
            ipfsEnabled: true
        };
    }

    getJobStatus(jobId) {
        const job = this.activeJobs.get(jobId);
        return job ? job.status : 'unknown';
    }

    getActiveJobs() {
        return Array.from(this.activeJobs.entries()).map(([id, job]) => ({
            id: id,
            name: job.metadata.name,
            status: job.status,
            dataSize: job.metadata.totalDataSize,
            miners: job.miners.size
        }));
    }
}

module.exports = HybridJobService;