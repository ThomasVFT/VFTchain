// VFT User Platform API Integration
// Connects user dashboard with VFT Platform backend

class VFTUserClient {
    constructor() {
        this.baseUrl = 'http://localhost:8000/api/v1';
        this.wallet = localStorage.getItem('vft_user_wallet') || null;
        this.authToken = localStorage.getItem('vft_auth_token') || null;
        this.userJobs = [];
        this.userStats = {
            vftBalance: 0,
            completedJobs: 0,
            totalSpent: 0,
            memberSince: new Date().toLocaleDateString()
        };
        this.sessionId = this.generateSessionId();
        this.isOnline = false;
        this.heartbeatInterval = null;
        
        this.init();
    }

    async init() {
        if (this.wallet && this.authToken) {
            this.updateWalletUI();
            await this.loadUserData();
            await this.registerUserSession();
        }
        
        await this.loadNetworkStats();
        this.updateUI();
        this.startRealTimeUpdates();
        this.startHeartbeat();
        this.bindEvents();
        
        // Handle page unload to mark user offline
        window.addEventListener('beforeunload', () => {
            this.markUserOffline();
        });
    }

    bindEvents() {
        // Job form submission
        document.getElementById('jobForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitJob();
        });

        // Budget change updates estimation
        document.getElementById('jobBudget').addEventListener('input', () => {
            this.updateEstimation();
        });

        // Compute type change updates estimation
        document.getElementById('computeType').addEventListener('change', () => {
            this.updateEstimation();
        });
    }

    async connectWallet() {
        try {
            // Check if Phantom wallet is available
            if (window.solana && window.solana.isPhantom) {
                const response = await window.solana.connect();
                const walletAddress = response.publicKey.toString();
                
                // Authenticate with backend
                const authResult = await this.request('/auth/wallet', {
                    method: 'POST',
                    body: JSON.stringify({
                        wallet_address: walletAddress,
                        signature: 'mock_signature'
                    })
                });

                if (authResult.success) {
                    this.wallet = walletAddress;
                    this.authToken = authResult.access_token;
                    localStorage.setItem('vft_user_wallet', this.wallet);
                    localStorage.setItem('vft_auth_token', this.authToken);
                    
                    this.updateWalletUI();
                    await this.loadUserData();
                    await this.registerUserSession();
                    this.startHeartbeat();
                    this.showNotification('Wallet connected successfully!', 'success');
                } else {
                    throw new Error('Authentication failed');
                }
            } else {
                // Fallback for demo - prompt for wallet address
                const walletAddress = prompt('Enter your Solana wallet address for demo:');
                if (walletAddress) {
                    const authResult = await this.request('/auth/wallet', {
                        method: 'POST',
                        body: JSON.stringify({
                            wallet_address: walletAddress,
                            signature: 'demo_signature'
                        })
                    });

                    if (authResult.success) {
                        this.wallet = walletAddress;
                        this.authToken = authResult.access_token;
                        localStorage.setItem('vft_user_wallet', this.wallet);
                        localStorage.setItem('vft_auth_token', this.authToken);
                        
                        this.updateWalletUI();
                        await this.loadUserData();
                        await this.registerUserSession();
                        this.startHeartbeat();
                        this.showNotification('Demo wallet connected!', 'success');
                    }
                }
            }
        } catch (error) {
            console.error('Wallet connection failed:', error);
            this.showNotification('Failed to connect wallet. Please try again.', 'error');
        }
    }

    updateWalletUI() {
        if (this.wallet) {
            const truncated = this.wallet.substring(0, 6) + '...' + this.wallet.substring(this.wallet.length - 4);
            document.getElementById('walletDisplay').textContent = truncated;
            document.getElementById('walletBtn').innerHTML = '<i class="fas fa-check mr-2"></i>Connected';
            document.getElementById('walletBtn').className = 'bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg';
        }
    }

    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
                },
                ...options
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    async loadUserData() {
        try {
            // Load user jobs
            await this.loadUserJobs();
            
            // Get real user stats from backend
            const userStats = await this.request('/users/stats');
            this.userStats.vftBalance = userStats.vftBalance || 0;
            this.userStats.completedJobs = userStats.completedJobs || 0;
            this.userStats.totalSpent = userStats.totalSpent || 0;
            this.userStats.memberSince = userStats.memberSince || new Date().toLocaleDateString();
            
        } catch (error) {
            console.error('Failed to load user data:', error);
            // Fallback to calculated stats from jobs
            this.userStats.completedJobs = this.userJobs.filter(job => job.status === 'completed').length;
            this.userStats.totalSpent = this.userJobs.reduce((total, job) => total + (job.budget_vft || 0), 0);
        }
    }

    async loadUserJobs() {
        try {
            const response = await this.request('/jobs');
            this.userJobs = response.jobs || [];
            this.updateJobsList();
        } catch (error) {
            console.error('Failed to load jobs:', error);
            this.userJobs = [];
        }
    }

    async loadNetworkStats() {
        try {
            const stats = await this.request('/platform/stats');
            
            // Update dashboard metrics with real data
            document.getElementById('activeMiners').textContent = stats.activeMiners || 0;
            document.getElementById('totalTflops').textContent = this.formatNumber(stats.totalTflops || 0);
            document.getElementById('dataProcessed').textContent = this.formatBytes(stats.dataProcessedToday || 0);
            document.getElementById('vftRewards').textContent = this.formatNumber(stats.vftDistributedToday || 0);
            document.getElementById('avgTime').textContent = stats.avgProcessingTime || '--';
            
            // Update network status based on stats
            const load = stats.activeJobs / Math.max(stats.activeMiners, 1);
            let loadText = 'Low';
            if (load > 0.7) loadText = 'High';
            else if (load > 0.4) loadText = 'Medium';
            
            document.getElementById('networkLoad').textContent = loadText;
            document.getElementById('queuePosition').textContent = stats.userQueuePosition || '--';
            document.getElementById('avgWaitTime').textContent = stats.avgWaitTime || '--';
        } catch (error) {
            console.error('Failed to load network stats:', error);
        }
    }

    async submitJob() {
        if (!this.wallet) {
            this.showNotification('Please connect your wallet first', 'error');
            return;
        }

        // Get basic form data
        const formData = {
            title: document.getElementById('jobTitle').value,
            description: document.getElementById('jobDescription').value,
            compute_type: document.getElementById('computeType').value,
            budget: parseInt(document.getElementById('jobBudget').value),
            priority: parseInt(document.getElementById('jobPriority').value)
        };

        if (!formData.title || !formData.description || !formData.compute_type || !formData.budget) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }

        // Check if files are selected
        if (!window.uploadManager || window.uploadManager.selectedFiles.length === 0) {
            this.showNotification('Please select files or datasets for processing', 'error');
            return;
        }

        try {
            document.getElementById('submitJobBtn').disabled = true;
            document.getElementById('submitJobBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing Dataset...';

            // Step 1: Upload/prepare dataset
            let dataSourceInfo;
            if (window.uploadManager.uploadMethod === 'drag') {
                dataSourceInfo = await this.handleDirectUpload();
            } else if (window.uploadManager.uploadMethod === 'torrent') {
                dataSourceInfo = await this.handleTorrentDataset();
            } else if (window.uploadManager.uploadMethod === 'ipfs') {
                dataSourceInfo = await this.handleIPFSDataset();
            }

            if (!dataSourceInfo) {
                throw new Error('Failed to prepare dataset');
            }

            // Step 2: Get delivery configuration
            const deliveryConfig = this.getDeliveryConfiguration();

            // Step 3: Submit comprehensive job
            const jobData = {
                ...formData,
                data_sources: dataSourceInfo.sources,
                total_data_size: window.uploadManager.totalSize,
                delivery_config: deliveryConfig,
                estimated_processing_time: document.getElementById('estimatedTime').textContent,
                miners_required: document.getElementById('minersRequired').textContent,
                storage_requirements: {
                    input_size: window.uploadManager.totalSize,
                    estimated_output_size: window.uploadManager.totalSize * 0.5, // Estimate
                    storage_duration: deliveryConfig.storage_duration || 2592000 // 30 days default
                }
            };

            document.getElementById('submitJobBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Submitting to Mining Pool...';

            const result = await this.request('/jobs/terabyte', {
                method: 'POST',
                body: JSON.stringify(jobData)
            });

            if (result.success) {
                // Step 4: Distribute to Filecoin if large dataset
                if (window.uploadManager.totalSize > 10 * 1024 * 1024 * 1024) { // > 10GB
                    document.getElementById('submitJobBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Distributing to Filecoin...';
                    await this.distributeToFilecoin(result.job_id, dataSourceInfo.sources);
                }

                // Step 5: Stream to mining pool
                document.getElementById('submitJobBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Streaming to GPU Miners...';
                await this.streamToMiningPool(result.job_id, jobData);

                this.showNotification('Job submitted successfully to mining pool!', 'success');
                document.getElementById('jobForm').reset();
                window.uploadManager.selectedFiles = [];
                window.uploadManager.totalSize = 0;
                document.getElementById('filesSummary').classList.add('hidden');
                
                await this.loadUserJobs();
                this.addRecentActivity('Terabyte AI job submitted', formData.title);
            } else {
                throw new Error(result.message || 'Job submission failed');
            }
        } catch (error) {
            console.error('Job submission failed:', error);
            this.showNotification(`Failed to submit job: ${error.message}`, 'error');
        } finally {
            document.getElementById('submitJobBtn').disabled = false;
            document.getElementById('submitJobBtn').innerHTML = '<i class="fas fa-rocket mr-2"></i>Submit AI Job';
        }
    }

    async handleDirectUpload() {
        const files = window.uploadManager.selectedFiles;
        const uploadResults = [];

        for (const file of files) {
            if (file.size > 100 * 1024 * 1024) { // > 100MB, use chunked upload
                const uploadId = await window.uploadManager.startChunkedUpload(file);
                uploadResults.push({
                    name: file.name,
                    size: file.size,
                    type: 'chunked_upload',
                    upload_id: uploadId
                });
            } else {
                // Direct upload for smaller files
                const uploadResult = await this.uploadSmallFile(file);
                uploadResults.push(uploadResult);
            }
        }

        return {
            sources: uploadResults,
            total_size: window.uploadManager.totalSize,
            method: 'direct_upload'
        };
    }

    async handleTorrentDataset() {
        const torrentFile = window.uploadManager.selectedFiles[0];
        let torrentData;

        if (torrentFile.type === 'magnet') {
            torrentData = { magnet_url: torrentFile.magnetUrl };
        } else {
            torrentData = { torrent_data: torrentFile.torrentData };
        }

        const result = await this.request('/storage/prepare-torrent', {
            method: 'POST',
            body: JSON.stringify(torrentData)
        });

        return {
            sources: [{
                name: torrentFile.name,
                size: torrentFile.size,
                type: 'torrent',
                torrent_id: result.torrent_id
            }],
            total_size: torrentFile.size,
            method: 'torrent'
        };
    }

    async handleIPFSDataset() {
        const ipfsFile = window.uploadManager.selectedFiles[0];
        const ipfsHash = document.getElementById('ipfsHash').value;
        const expectedSize = document.getElementById('ipfsSize').value;

        const result = await this.request('/storage/prepare-ipfs', {
            method: 'POST',
            body: JSON.stringify({
                ipfs_hash: ipfsHash,
                expected_size: expectedSize,
                filecoin_deal: document.getElementById('filecoinDeal').value
            })
        });

        return {
            sources: [{
                name: ipfsFile.name,
                size: ipfsFile.size,
                type: 'ipfs',
                ipfs_hash: ipfsHash,
                retrieval_info: result.retrieval_info
            }],
            total_size: ipfsFile.size,
            method: 'ipfs'
        };
    }

    async uploadSmallFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('purpose', 'ai_processing');

        const response = await fetch(`${this.baseUrl}/storage/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.authToken}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`File upload failed: ${response.statusText}`);
        }

        const result = await response.json();
        return {
            name: file.name,
            size: file.size,
            type: 'direct_file',
            ipfs_hash: result.ipfs_hash,
            storage_url: result.storage_url
        };
    }

    getDeliveryConfiguration() {
        const deliveryMethod = document.getElementById('deliveryMethod').value;
        const backupDelivery = document.getElementById('backupDelivery').value;
        
        const config = {
            primary_method: deliveryMethod,
            backup_method: backupDelivery !== 'none' ? backupDelivery : null
        };

        // Add method-specific configuration
        const deliveryConfigDiv = document.getElementById('deliveryConfig');
        const inputs = deliveryConfigDiv.querySelectorAll('input, select');
        
        inputs.forEach(input => {
            if (input.value) {
                config[input.id || input.name] = input.value;
            }
        });

        return config;
    }

    async distributeToFilecoin(jobId, dataSources) {
        try {
            await this.request(`/jobs/${jobId}/distribute-filecoin`, {
                method: 'POST',
                body: JSON.stringify({
                    data_sources: dataSources,
                    replication_factor: 3,
                    storage_duration: 1036800 // 1 year
                })
            });
        } catch (error) {
            console.warn('Filecoin distribution failed:', error);
            // Non-critical error, job can proceed without Filecoin
        }
    }

    async streamToMiningPool(jobId, jobData) {
        return await this.request(`/jobs/${jobId}/stream-to-miners`, {
            method: 'POST',
            body: JSON.stringify({
                compute_requirements: {
                    type: jobData.compute_type,
                    memory_required: Math.ceil(jobData.total_data_size / (1024 * 1024 * 1024)), // GB
                    priority: jobData.priority
                },
                data_sources: jobData.data_sources,
                delivery_config: jobData.delivery_config
            })
        });
    }

    updateJobsList() {
        const jobsList = document.getElementById('jobsList');
        const noJobs = document.getElementById('noJobs');

        if (this.userJobs.length === 0) {
            jobsList.style.display = 'none';
            noJobs.style.display = 'block';
            return;
        }

        jobsList.style.display = 'block';
        noJobs.style.display = 'none';

        jobsList.innerHTML = this.userJobs.map(job => {
            const statusColor = {
                'pending': 'yellow',
                'processing': 'blue',
                'mining': 'purple',
                'completed': 'green',
                'failed': 'red',
                'delivering': 'cyan'
            }[job.status] || 'gray';

            const statusIcon = {
                'pending': 'clock',
                'processing': 'cog fa-spin',
                'mining': 'microchip fa-pulse',
                'completed': 'check-circle',
                'failed': 'times-circle',
                'delivering': 'download fa-bounce'
            }[job.status] || 'question';

            const dataSize = job.total_data_size ? this.formatBytes(job.total_data_size) : 'N/A';
            const progress = job.progress || 0;

            return `
                <div class="glass-dark rounded-lg p-4 card-hover cursor-pointer" onclick="viewJob('${job.id}')">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex-1">
                            <h4 class="font-semibold">${job.title}</h4>
                            <p class="text-gray-400 text-sm">${job.compute_type?.toUpperCase() || 'AI Processing'} • ${dataSize}</p>
                            ${job.miners_count ? `<p class="text-blue-400 text-xs mt-1">${job.miners_count} miners assigned</p>` : ''}
                        </div>
                        <div class="flex items-center space-x-2">
                            <span class="bg-${statusColor}-500 text-xs px-2 py-1 rounded-full">${job.status}</span>
                            <i class="fas fa-${statusIcon} text-${statusColor}-400"></i>
                        </div>
                    </div>
                    
                    ${progress > 0 ? `
                        <div class="mb-3">
                            <div class="flex justify-between text-xs mb-1">
                                <span class="text-gray-400">Progress</span>
                                <span class="text-${statusColor}-400">${progress}%</span>
                            </div>
                            <div class="w-full bg-gray-600 rounded-full h-1.5">
                                <div class="bg-${statusColor}-500 h-1.5 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-400">Budget: ${job.budget_vft?.toLocaleString() || 'N/A'} VFT</span>
                        <span class="text-gray-400">${new Date(job.created_at).toLocaleDateString()}</span>
                    </div>
                    
                    ${job.delivery_method ? `
                        <div class="mt-2 text-xs text-cyan-400">
                            <i class="fas fa-download mr-1"></i>Delivery: ${job.delivery_method.toUpperCase()}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    updateEstimation() {
        const budget = parseInt(document.getElementById('jobBudget').value) || 0;
        const computeType = document.getElementById('computeType').value;
        
        let estimatedTime = '30-60 minutes';
        
        if (computeType === 'gpu') {
            if (budget < 500) estimatedTime = '45-90 minutes';
            else if (budget < 1000) estimatedTime = '30-60 minutes';
            else estimatedTime = '15-45 minutes';
        } else if (computeType === 'cpu') {
            estimatedTime = '10-30 minutes';
        } else if (computeType === 'storage') {
            estimatedTime = '5-15 minutes';
        }
        
        document.getElementById('estimatedTime').textContent = estimatedTime;
    }

    updateUI() {
        // Update account info
        document.getElementById('vftBalance').textContent = `${this.userStats.vftBalance.toFixed(2)} VFT`;
        document.getElementById('completedJobs').textContent = this.userStats.completedJobs;
        document.getElementById('totalSpent').textContent = `${this.userStats.totalSpent} VFT`;
        document.getElementById('memberSince').textContent = this.userStats.memberSince;
    }

    addRecentActivity(action, details) {
        const recentActivity = document.getElementById('recentActivity');
        
        // Remove the "no activity" message if it exists
        if (recentActivity.children.length === 1 && recentActivity.children[0].querySelector('.fa-clock')) {
            recentActivity.innerHTML = '';
        }
        
        const activity = document.createElement('div');
        activity.className = 'flex justify-between items-center py-2 border-b border-gray-700';
        activity.innerHTML = `
            <div>
                <div class="text-sm font-medium">${action}</div>
                <div class="text-xs text-gray-400">${details}</div>
            </div>
            <div class="text-xs text-gray-400">${new Date().toLocaleTimeString()}</div>
        `;
        
        recentActivity.insertBefore(activity, recentActivity.firstChild);
        
        // Keep only last 5 activities
        while (recentActivity.children.length > 5) {
            recentActivity.removeChild(recentActivity.lastChild);
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-20 right-4 p-4 rounded-lg text-white z-50 ${
            type === 'success' ? 'bg-green-600' : 
            type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    generateSessionId() {
        return 'user_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    async registerUserSession() {
        if (!this.wallet) return;
        
        try {
            await this.request('/users/session', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: this.sessionId,
                    wallet_address: this.wallet,
                    user_agent: navigator.userAgent,
                    platform: 'web'
                })
            });
            this.isOnline = true;
        } catch (error) {
            console.error('Failed to register user session:', error);
        }
    }

    async markUserOffline() {
        if (!this.wallet || !this.isOnline) return;
        
        try {
            await this.request(`/users/session/${this.sessionId}`, {
                method: 'DELETE'
            });
            this.isOnline = false;
        } catch (error) {
            console.error('Failed to mark user offline:', error);
        }
    }

    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(async () => {
            if (this.wallet && this.isOnline) {
                try {
                    await this.request(`/users/session/${this.sessionId}/heartbeat`, {
                        method: 'POST',
                        body: JSON.stringify({
                            timestamp: Date.now(),
                            active_jobs: this.userJobs.filter(job => job.status === 'running').length
                        })
                    });
                } catch (error) {
                    console.error('Heartbeat failed:', error);
                }
            }
        }, 30000); // Every 30 seconds
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    startRealTimeUpdates() {
        // Reload jobs every 30 seconds
        setInterval(() => {
            if (this.wallet) {
                this.loadUserJobs();
            }
        }, 30000);

        // Update network stats every 15 seconds
        setInterval(() => {
            this.loadNetworkStats();
        }, 15000);

        // Update user stats every 60 seconds
        setInterval(() => {
            if (this.wallet) {
                this.loadUserData();
            }
        }, 60000);
    }
}

// Global functions
function connectWallet() {
    if (window.userClient) {
        window.userClient.connectWallet();
    }
}

function viewJob(jobId) {
    if (window.userClient) {
        const job = window.userClient.userJobs.find(j => j.id === jobId);
        if (job) {
            document.getElementById('modalJobTitle').textContent = job.title;
            document.getElementById('modalContent').innerHTML = `
                <div class="space-y-4">
                    <div>
                        <h4 class="font-semibold mb-2">Job Details</h4>
                        <p class="text-gray-300">${job.description}</p>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <span class="text-gray-400">Status:</span>
                            <span class="ml-2 font-semibold">${job.status}</span>
                        </div>
                        <div>
                            <span class="text-gray-400">Budget:</span>
                            <span class="ml-2 font-semibold">${job.budget_vft} VFT</span>
                        </div>
                        <div>
                            <span class="text-gray-400">Type:</span>
                            <span class="ml-2 font-semibold">${job.compute_type.toUpperCase()}</span>
                        </div>
                        <div>
                            <span class="text-gray-400">Created:</span>
                            <span class="ml-2 font-semibold">${new Date(job.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    ${job.status === 'completed' ? `
                        <div>
                            <h4 class="font-semibold mb-2">Results</h4>
                            <div class="bg-gray-800 p-4 rounded-lg">
                                <p class="text-green-400">Job completed successfully!</p>
                                <p class="text-sm text-gray-400 mt-2">Results would be available for download here.</p>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
            document.getElementById('jobModal').classList.remove('hidden');
        }
    }
}

function closeModal() {
    document.getElementById('jobModal').classList.add('hidden');
}

function showTopUp() {
    alert('VFT token purchase integration would be implemented here. Contact support for token purchases during beta.');
}

// Initialize user client when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.userClient = new VFTUserClient();
});

// Handle page visibility changes to pause/resume heartbeat
document.addEventListener('visibilitychange', () => {
    if (window.userClient) {
        if (document.hidden) {
            // Page is hidden, reduce update frequency
            if (window.userClient.heartbeatInterval) {
                clearInterval(window.userClient.heartbeatInterval);
            }
        } else {
            // Page is visible again, resume normal updates
            window.userClient.startHeartbeat();
            window.userClient.loadNetworkStats();
        }
    }
});