// VFT Platform - Terabyte-Scale Upload System
// Handles massive file uploads with chunking, resume capability, and distributed storage

class TerabyteUploadManager {
    constructor() {
        this.baseUrl = 'http://localhost:8000/api/v1';
        this.chunkSize = 100 * 1024 * 1024; // 100MB chunks
        this.maxConcurrentChunks = 3;
        this.activeUploads = new Map();
        this.selectedFiles = [];
        this.uploadMethod = 'drag';
        this.totalSize = 0;
        
        this.initializeUploadSystem();
    }

    initializeUploadSystem() {
        this.setupDragAndDrop();
        this.setupFileInput();
        this.setupDeliveryConfig();
        this.bindUploadEvents();
    }

    setupDragAndDrop() {
        const dropZone = document.getElementById('dropZone');
        if (!dropZone) return;

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-blue-500', 'bg-blue-900/20');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-500', 'bg-blue-900/20');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-500', 'bg-blue-900/20');
            
            const files = Array.from(e.dataTransfer.files);
            this.handleFileSelection(files);
        });

        dropZone.addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
    }

    setupFileInput() {
        const fileInput = document.getElementById('fileInput');
        if (!fileInput) return;

        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            this.handleFileSelection(files);
        });

        // Setup torrent file input
        const torrentInput = document.getElementById('torrentFile');
        if (torrentInput) {
            torrentInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file && file.name.endsWith('.torrent')) {
                    this.handleTorrentFile(file);
                }
            });
        }
    }

    setupDeliveryConfig() {
        const deliveryMethod = document.getElementById('deliveryMethod');
        if (!deliveryMethod) return;

        deliveryMethod.addEventListener('change', (e) => {
            this.updateDeliveryConfig(e.target.value);
        });

        // Initialize with default
        this.updateDeliveryConfig('ipfs');
    }

    updateDeliveryConfig(method) {
        const configDiv = document.getElementById('deliveryConfig');
        if (!configDiv) return;

        let configHTML = '';

        switch (method) {
            case 'ipfs':
                configHTML = `
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">IPFS Gateway</label>
                            <select class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                                <option value="default">Default Gateway</option>
                                <option value="pinata">Pinata (Recommended)</option>
                                <option value="infura">Infura IPFS</option>
                                <option value="custom">Custom Gateway</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Pin Duration</label>
                            <select class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                                <option value="30">30 days</option>
                                <option value="90">90 days</option>
                                <option value="365">1 year</option>
                                <option value="permanent">Permanent</option>
                            </select>
                        </div>
                    </div>
                `;
                break;

            case 'filecoin':
                configHTML = `
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium mb-2">Storage Duration</label>
                                <select class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                                    <option value="518400">6 months</option>
                                    <option value="1036800">1 year</option>
                                    <option value="2073600">2 years</option>
                                    <option value="5184000">5 years</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2">Replication Factor</label>
                                <select class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                                    <option value="1">1 copy</option>
                                    <option value="3">3 copies (Recommended)</option>
                                    <option value="5">5 copies (High availability)</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Maximum Price per GB/Year (FIL)</label>
                            <input type="number" step="0.001" placeholder="0.01" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                        </div>
                    </div>
                `;
                break;

            case 'ftp':
                configHTML = `
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-2">FTP Server</label>
                            <input type="text" placeholder="ftp.example.com" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Port</label>
                            <input type="number" placeholder="21" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Username</label>
                            <input type="text" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-2">Password</label>
                            <input type="password" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                        </div>
                    </div>
                `;
                break;

            case 's3':
                configHTML = `
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium mb-2">S3 Bucket Name</label>
                                <input type="text" placeholder="my-results-bucket" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2">AWS Region</label>
                                <select class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                                    <option value="us-east-1">US East (N. Virginia)</option>
                                    <option value="us-west-2">US West (Oregon)</option>
                                    <option value="eu-west-1">Europe (Ireland)</option>
                                    <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                                </select>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium mb-2">Access Key ID</label>
                                <input type="text" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2">Secret Access Key</label>
                                <input type="password" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded">
                            </div>
                        </div>
                    </div>
                `;
                break;

            default:
                configHTML = '<p class="text-sm text-gray-400">No additional configuration required.</p>';
        }

        configDiv.innerHTML = configHTML;
    }

    bindUploadEvents() {
        // Torrent link input
        const torrentLink = document.getElementById('torrentLink');
        if (torrentLink) {
            torrentLink.addEventListener('input', (e) => {
                if (e.target.value.startsWith('magnet:')) {
                    this.handleMagnetLink(e.target.value);
                }
            });
        }

        // IPFS hash input
        const ipfsHash = document.getElementById('ipfsHash');
        if (ipfsHash) {
            ipfsHash.addEventListener('input', (e) => {
                if (e.target.value.startsWith('Qm') || e.target.value.startsWith('bafy')) {
                    this.handleIPFSHash(e.target.value);
                }
            });
        }
    }

    handleFileSelection(files) {
        if (files.length === 0) return;

        this.selectedFiles = files;
        this.totalSize = files.reduce((total, file) => total + file.size, 0);

        this.updateFilesSummary();
        this.showUploadProgress();
        this.calculateCosts();
    }

    handleTorrentFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            // In production, parse torrent file to get info
            this.selectedFiles = [{ 
                name: file.name, 
                size: 0, // Will be determined from torrent
                type: 'torrent',
                torrentData: e.target.result
            }];
            this.updateFilesSummary();
        };
        reader.readAsArrayBuffer(file);
    }

    handleMagnetLink(magnetUrl) {
        // Extract info from magnet link
        const match = magnetUrl.match(/dn=([^&]+)/);
        const name = match ? decodeURIComponent(match[1]) : 'Torrent Dataset';
        
        this.selectedFiles = [{
            name: name,
            size: 0, // Will be determined when torrent is processed
            type: 'magnet',
            magnetUrl: magnetUrl
        }];
        
        this.updateFilesSummary();
        this.validateMagnetLink(magnetUrl);
    }

    handleIPFSHash(hash) {
        // Fetch IPFS metadata
        this.validateIPFSHash(hash);
    }

    async validateMagnetLink(magnetUrl) {
        try {
            // In production, validate with torrent tracker
            const response = await fetch(`${this.baseUrl}/storage/validate-torrent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnet_url: magnetUrl })
            });
            
            const result = await response.json();
            if (result.valid) {
                this.selectedFiles[0].size = result.size;
                this.totalSize = result.size;
                this.updateFilesSummary();
            }
        } catch (error) {
            console.error('Failed to validate magnet link:', error);
        }
    }

    async validateIPFSHash(hash) {
        try {
            const response = await fetch(`${this.baseUrl}/storage/validate-ipfs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ipfs_hash: hash })
            });
            
            const result = await response.json();
            if (result.valid) {
                this.selectedFiles = [{
                    name: result.name || 'IPFS Dataset',
                    size: result.size,
                    type: 'ipfs',
                    ipfsHash: hash
                }];
                this.totalSize = result.size;
                this.updateFilesSummary();
            }
        } catch (error) {
            console.error('Failed to validate IPFS hash:', error);
        }
    }

    updateFilesSummary() {
        const summary = document.getElementById('filesSummary');
        if (!summary) return;

        summary.classList.remove('hidden');

        document.getElementById('totalSize').textContent = this.formatBytes(this.totalSize);
        document.getElementById('fileCount').textContent = this.selectedFiles.length;
        document.getElementById('storageMethod').textContent = this.getStorageMethod();
        
        // Calculate processing time based on file size and type
        const processingTime = this.calculateProcessingTime();
        document.getElementById('estProcessingTime').textContent = processingTime;
    }

    getStorageMethod() {
        if (this.selectedFiles.length === 0) return '--';
        
        const firstFile = this.selectedFiles[0];
        if (firstFile.type === 'torrent' || firstFile.type === 'magnet') {
            return 'BitTorrent P2P';
        } else if (firstFile.type === 'ipfs') {
            return 'IPFS Distributed';
        } else if (this.totalSize > 100 * 1024 * 1024 * 1024) { // > 100GB
            return 'Chunked + Filecoin';
        } else {
            return 'Direct Upload + IPFS';
        }
    }

    calculateProcessingTime() {
        if (this.totalSize === 0) return '--';
        
        // Estimate based on size and complexity
        const gb = this.totalSize / (1024 * 1024 * 1024);
        const computeType = document.getElementById('computeType').value;
        
        let timeMultiplier = 1;
        switch (computeType) {
            case 'llm_inference': timeMultiplier = 2; break;
            case 'video_processing': timeMultiplier = 1.5; break;
            case 'model_training': timeMultiplier = 3; break;
            case 'scientific_computing': timeMultiplier = 2.5; break;
            default: timeMultiplier = 1;
        }
        
        const minutes = Math.ceil(gb * 0.5 * timeMultiplier); // 0.5 min per GB base
        
        if (minutes < 60) return `${minutes} minutes`;
        if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
        return `${Math.round(minutes / 1440)} days`;
    }

    calculateCosts() {
        const gb = this.totalSize / (1024 * 1024 * 1024);
        const computeType = document.getElementById('computeType').value;
        const priority = parseInt(document.getElementById('jobPriority').value);
        
        // Base cost: 10 VFT per GB
        let baseCost = Math.ceil(gb * 10);
        
        // Compute type multipliers
        const typeMultipliers = {
            'llm_inference': 3,
            'video_processing': 2,
            'model_training': 4,
            'scientific_computing': 3,
            'image_processing': 1.5,
            'cpu': 0.5,
            'storage': 0.2
        };
        
        baseCost *= (typeMultipliers[computeType] || 1);
        
        // Priority multipliers
        const priorityMultipliers = [1, 1, 1.25, 1.5, 2]; // Index matches priority value
        baseCost *= priorityMultipliers[priority] || 1;
        
        // Update UI
        document.getElementById('totalCost').textContent = `${baseCost.toLocaleString()} VFT`;
        document.getElementById('jobBudget').value = baseCost;
        
        // Calculate miners required
        const minersRequired = Math.max(1, Math.ceil(gb / 100)); // 1 miner per 100GB
        document.getElementById('minersRequired').textContent = minersRequired > 10 ? '10+' : `${minersRequired}`;
        
        // Update free tier usage
        const freeTierUsed = Math.min(gb, 100);
        document.getElementById('freeTierUsed').textContent = `${freeTierUsed.toFixed(1)}GB / 100GB used`;
        
        // Storage requirements
        const storageGB = gb * 2; // Input + output storage
        document.getElementById('storageRequired').textContent = `${storageGB.toFixed(1)}GB required`;
    }

    showUploadProgress() {
        document.getElementById('uploadProgress').classList.remove('hidden');
    }

    async startChunkedUpload(file) {
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const totalChunks = Math.ceil(file.size / this.chunkSize);
        
        const uploadInfo = {
            file: file,
            uploadId: uploadId,
            totalChunks: totalChunks,
            completedChunks: 0,
            uploadedBytes: 0,
            startTime: Date.now()
        };
        
        this.activeUploads.set(uploadId, uploadInfo);
        
        // Create UI element for this upload
        this.createUploadProgressElement(uploadInfo);
        
        // Start chunked upload
        const chunks = [];
        for (let i = 0; i < totalChunks; i++) {
            const start = i * this.chunkSize;
            const end = Math.min(start + this.chunkSize, file.size);
            chunks.push({ index: i, start, end });
        }
        
        // Upload chunks with concurrency control
        await this.uploadChunksConcurrently(uploadInfo, chunks);
        
        return uploadId;
    }

    createUploadProgressElement(uploadInfo) {
        const uploadList = document.getElementById('uploadList');
        const progressElement = document.createElement('div');
        progressElement.id = `upload_${uploadInfo.uploadId}`;
        progressElement.className = 'bg-gray-700 rounded-lg p-4';
        
        progressElement.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="font-medium">${uploadInfo.file.name}</span>
                <span class="text-sm text-gray-400">${this.formatBytes(uploadInfo.file.size)}</span>
            </div>
            <div class="flex justify-between text-sm mb-2">
                <span>Chunk <span id="chunk_${uploadInfo.uploadId}">0</span>/${uploadInfo.totalChunks}</span>
                <span id="percent_${uploadInfo.uploadId}">0%</span>
            </div>
            <div class="w-full bg-gray-600 rounded-full h-2">
                <div class="bg-green-500 h-2 rounded-full transition-all duration-300" 
                     id="bar_${uploadInfo.uploadId}" style="width: 0%"></div>
            </div>
            <div class="flex justify-between text-xs text-gray-400 mt-2">
                <span id="speed_${uploadInfo.uploadId}">0 MB/s</span>
                <span id="eta_${uploadInfo.uploadId}">Calculating...</span>
            </div>
        `;
        
        uploadList.appendChild(progressElement);
    }

    async uploadChunksConcurrently(uploadInfo, chunks) {
        const semaphore = new Array(this.maxConcurrentChunks).fill().map(() => Promise.resolve());
        let semaphoreIndex = 0;
        
        const uploadPromises = chunks.map(async (chunk) => {
            // Wait for available semaphore slot
            await semaphore[semaphoreIndex];
            const currentIndex = semaphoreIndex;
            semaphoreIndex = (semaphoreIndex + 1) % this.maxConcurrentChunks;
            
            // Upload this chunk
            semaphore[currentIndex] = this.uploadChunk(uploadInfo, chunk);
            await semaphore[currentIndex];
        });
        
        await Promise.all(uploadPromises);
    }

    async uploadChunk(uploadInfo, chunk) {
        const { file, uploadId } = uploadInfo;
        const chunkBlob = file.slice(chunk.start, chunk.end);
        
        const formData = new FormData();
        formData.append('chunk', chunkBlob);
        formData.append('upload_id', uploadId);
        formData.append('chunk_index', chunk.index);
        formData.append('total_chunks', uploadInfo.totalChunks);
        formData.append('file_name', file.name);
        formData.append('file_size', file.size);
        
        try {
            const response = await fetch(`${this.baseUrl}/storage/upload-chunk`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('vft_auth_token')}`
                },
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Chunk upload failed: ${response.statusText}`);
            }
            
            // Update progress
            uploadInfo.completedChunks++;
            uploadInfo.uploadedBytes += chunkBlob.size;
            
            this.updateUploadProgress(uploadInfo);
            
            const result = await response.json();
            return result;
            
        } catch (error) {
            console.error(`Failed to upload chunk ${chunk.index}:`, error);
            // Implement retry logic here
            throw error;
        }
    }

    updateUploadProgress(uploadInfo) {
        const progress = (uploadInfo.completedChunks / uploadInfo.totalChunks) * 100;
        const elapsed = Date.now() - uploadInfo.startTime;
        const speed = uploadInfo.uploadedBytes / (elapsed / 1000); // bytes per second
        const remaining = uploadInfo.file.size - uploadInfo.uploadedBytes;
        const eta = remaining / speed;
        
        // Update individual file progress
        document.getElementById(`chunk_${uploadInfo.uploadId}`).textContent = uploadInfo.completedChunks;
        document.getElementById(`percent_${uploadInfo.uploadId}`).textContent = `${Math.round(progress)}%`;
        document.getElementById(`bar_${uploadInfo.uploadId}`).style.width = `${progress}%`;
        document.getElementById(`speed_${uploadInfo.uploadId}`).textContent = `${this.formatBytes(speed)}/s`;
        document.getElementById(`eta_${uploadInfo.uploadId}`).textContent = this.formatTime(eta);
        
        // Update overall progress
        this.updateOverallProgress();
    }

    updateOverallProgress() {
        const uploads = Array.from(this.activeUploads.values());
        const totalSize = uploads.reduce((sum, u) => sum + u.file.size, 0);
        const uploadedSize = uploads.reduce((sum, u) => sum + u.uploadedBytes, 0);
        const progress = totalSize > 0 ? (uploadedSize / totalSize) * 100 : 0;
        
        const totalSpeed = uploads.reduce((sum, u) => {
            const elapsed = Date.now() - u.startTime;
            return sum + (u.uploadedBytes / (elapsed / 1000));
        }, 0);
        
        const remaining = totalSize - uploadedSize;
        const eta = totalSpeed > 0 ? remaining / totalSpeed : 0;
        
        document.getElementById('overallPercent').textContent = `${Math.round(progress)}%`;
        document.getElementById('overallProgressBar').style.width = `${progress}%`;
        document.getElementById('uploadSpeed').textContent = `${this.formatBytes(totalSpeed)}/s`;
        document.getElementById('timeRemaining').textContent = this.formatTime(eta);
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatTime(seconds) {
        if (!seconds || seconds === Infinity) return 'Calculating...';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${secs}s`;
        return `${secs}s`;
    }

    async distributeToFilecoin(uploadId, files) {
        try {
            const response = await fetch(`${this.baseUrl}/storage/distribute-filecoin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('vft_auth_token')}`
                },
                body: JSON.stringify({
                    upload_id: uploadId,
                    files: files.map(f => ({
                        name: f.name,
                        size: f.size,
                        ipfs_hash: f.ipfsHash
                    })),
                    replication_factor: 3,
                    storage_duration: 1036800 // 1 year in epochs
                })
            });

            const result = await response.json();
            return result;
            
        } catch (error) {
            console.error('Failed to distribute to Filecoin:', error);
            throw error;
        }
    }

    async streamToMiningPool(jobData) {
        try {
            const response = await fetch(`${this.baseUrl}/mining/distribute-job`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('vft_auth_token')}`
                },
                body: JSON.stringify({
                    job_id: jobData.job_id,
                    data_sources: jobData.data_sources,
                    compute_requirements: {
                        type: jobData.compute_type,
                        gpu_memory: jobData.gpu_memory_required,
                        estimated_runtime: jobData.estimated_runtime
                    },
                    budget: jobData.budget,
                    priority: jobData.priority
                })
            });

            const result = await response.json();
            return result;
            
        } catch (error) {
            console.error('Failed to stream to mining pool:', error);
            throw error;
        }
    }
}

// Global upload manager instance
window.uploadManager = new TerabyteUploadManager();

// Global functions for UI interaction
function selectUploadMethod(method) {
    // Hide all upload methods
    document.querySelectorAll('.upload-method').forEach(el => el.classList.add('hidden'));
    
    // Show selected method
    const selectedMethod = document.getElementById(`${method}Upload`);
    if (selectedMethod) {
        selectedMethod.classList.remove('hidden');
    }
    
    // Update active state
    document.querySelectorAll('[onclick^="selectUploadMethod"]').forEach(el => {
        el.classList.remove('border-blue-500', 'bg-blue-900/20');
    });
    event.target.closest('div').classList.add('border-blue-500', 'bg-blue-900/20');
    
    window.uploadManager.uploadMethod = method;
}

// Initialize with drag method selected
document.addEventListener('DOMContentLoaded', () => {
    selectUploadMethod('drag');
});