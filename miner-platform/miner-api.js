// VFT Miner Platform API Integration
// Connects miner dashboard with VFT Platform backend

class VFTMinerClient {
    constructor() {
        this.baseUrl = 'http://localhost:8000/api/v1';
        this.minerId = localStorage.getItem('vft_miner_id') || null;
        this.wallet = localStorage.getItem('vft_miner_wallet') || null;
        this.isOnline = false;
        this.currentJob = null;
        this.stats = {
            earnedVFT: 0,
            completedJobs: 0,
            uptime: 0,
            reputation: 100
        };
        this.hardware = {
            gpuUsage: 0,
            gpuTemp: 45,
            memUsage: '2.1/24 GB',
            powerDraw: 125
        };
        
        this.init();
    }

    async init() {
        await this.loadMinerData();
        await this.connectToNetwork();
        this.startRealTimeUpdates();
        this.updateUI();
    }

    async loadMinerData() {
        // Load miner data from localStorage or prompt for registration
        if (!this.minerId || !this.wallet) {
            await this.registerMiner();
        } else {
            await this.validateMiner();
        }
    }

    async registerMiner() {
        const walletAddress = prompt('Enter your wallet address to register as a miner:');
        const minerName = prompt('Enter a name for your mining rig:') || 'VFT Miner';
        const region = prompt('Enter your region (North America, Europe, Asia):') || 'North America';

        if (!walletAddress) {
            alert('Wallet address is required to start mining');
            return;
        }

        try {
            const response = await fetch(`${this.baseUrl}/miners`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: minerName,
                    region: region,
                    wallet_address: walletAddress,
                    compute_types: ['gpu'],
                    hardware_specs: this.detectHardware()
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.minerId = result.node_id;
                this.wallet = walletAddress;
                localStorage.setItem('vft_miner_id', this.minerId);
                localStorage.setItem('vft_miner_wallet', this.wallet);
                alert('Miner registered successfully! Welcome to the VFT network.');
            } else {
                throw new Error(result.message || 'Registration failed');
            }
        } catch (error) {
            console.error('Miner registration failed:', error);
            alert('Failed to register miner. Please try again.');
        }
    }

    async validateMiner() {
        try {
            const response = await fetch(`${this.baseUrl}/miners`);
            const result = await response.json();
            
            // Check if our miner ID exists in the network
            const minerExists = result.miners && result.miners.some(miner => miner.id === this.minerId);
            
            if (!minerExists) {
                // Miner not found, re-register
                localStorage.removeItem('vft_miner_id');
                localStorage.removeItem('vft_miner_wallet');
                await this.registerMiner();
            }
        } catch (error) {
            console.error('Miner validation failed:', error);
        }
    }

    detectHardware() {
        // Mock hardware detection - in real implementation this would detect actual GPU
        return {
            gpu: 'RTX 4090',
            vram: '24 GB',
            cpu: 'Intel i9-13900K',
            ram: '32 GB DDR5',
            detected: true
        };
    }

    async connectToNetwork() {
        try {
            const response = await fetch(`${this.baseUrl}/platform/stats`);
            if (response.ok) {
                this.isOnline = true;
                document.getElementById('nodeStatus').className = 'status-indicator bg-green-500';
                document.getElementById('statusText').textContent = 'Online';
                document.getElementById('statusText').className = 'text-green-400 font-medium';
            }
        } catch (error) {
            this.isOnline = false;
            document.getElementById('nodeStatus').className = 'status-indicator bg-red-500';
            document.getElementById('statusText').textContent = 'Offline';
            document.getElementById('statusText').className = 'text-red-400 font-medium';
        }
    }

    async checkForJobs() {
        try {
            const response = await fetch(`${this.baseUrl}/jobs`);
            const result = await response.json();
            
            if (result.jobs && result.jobs.length > 0) {
                const availableJob = result.jobs.find(job => job.status === 'pending');
                if (availableJob && !this.currentJob) {
                    this.assignJob(availableJob);
                }
            }
        } catch (error) {
            console.error('Failed to check for jobs:', error);
        }
    }

    assignJob(job) {
        this.currentJob = {
            id: job.id,
            title: job.title,
            type: job.compute_type,
            reward: job.budget_vft,
            progress: 0,
            startTime: Date.now()
        };
        
        this.startJobSimulation();
        this.updateJobUI();
    }

    startJobSimulation() {
        // Simulate job progress
        const duration = 30000 + Math.random() * 60000; // 30-90 seconds
        const startTime = Date.now();
        
        const progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min((elapsed / duration) * 100, 100);
            
            this.currentJob.progress = progress;
            this.updateJobProgress(progress);
            
            if (progress >= 100) {
                clearInterval(progressInterval);
                this.completeJob();
            }
        }, 1000);
    }

    completeJob() {
        if (this.currentJob) {
            this.stats.completedJobs++;
            this.stats.earnedVFT += this.currentJob.reward / 1000; // Convert to VFT
            this.addEarningHistory(this.currentJob);
            this.currentJob = null;
            this.updateUI();
            
            // Check for new jobs after completion
            setTimeout(() => this.checkForJobs(), 5000);
        }
    }

    updateJobProgress(progress) {
        document.getElementById('jobProgress').textContent = `${Math.round(progress)}%`;
        document.getElementById('progressBar').style.width = `${progress}%`;
        
        // Simulate hardware usage during job
        this.hardware.gpuUsage = Math.min(85 + Math.random() * 15, 100);
        this.hardware.gpuTemp = 65 + Math.random() * 20;
        this.updateHardwareUI();
    }

    updateJobUI() {
        const currentJobSection = document.getElementById('currentJobSection');
        const idleSection = document.getElementById('idleSection');
        
        if (this.currentJob) {
            document.getElementById('currentJobTitle').textContent = this.currentJob.title;
            document.getElementById('currentJobType').textContent = this.currentJob.type.toUpperCase() + ' Training';
            document.getElementById('jobReward').textContent = `${this.currentJob.reward} VFT`;
            
            currentJobSection.style.display = 'block';
            idleSection.style.display = 'none';
        } else {
            currentJobSection.style.display = 'none';
            idleSection.style.display = 'block';
        }
    }

    updateUI() {
        // Update stats
        document.getElementById('earnedVFT').textContent = this.stats.earnedVFT.toFixed(2);
        document.getElementById('completedJobs').textContent = this.stats.completedJobs;
        document.getElementById('reputation').textContent = this.stats.reputation;
        
        // Update miner info
        if (this.minerId) {
            document.getElementById('nodeId').textContent = this.minerId.substring(0, 16) + '...';
        }
        if (this.wallet) {
            document.getElementById('walletAddress').textContent = this.wallet.substring(0, 6) + '...' + this.wallet.substring(this.wallet.length - 4);
        }
        
        this.updateHardwareUI();
        this.updateNetworkStats();
    }

    updateHardwareUI() {
        document.getElementById('gpuUsage').textContent = `${Math.round(this.hardware.gpuUsage)}%`;
        document.getElementById('gpuBar').style.width = `${this.hardware.gpuUsage}%`;
        
        document.getElementById('gpuTemp').textContent = `${Math.round(this.hardware.gpuTemp)}°C`;
        document.getElementById('tempBar').style.width = `${Math.min(this.hardware.gpuTemp / 100 * 100, 100)}%`;
        
        document.getElementById('memUsage').textContent = this.hardware.memUsage;
        document.getElementById('powerDraw').textContent = `${this.hardware.powerDraw}W`;
    }

    async updateNetworkStats() {
        try {
            const response = await fetch(`${this.baseUrl}/platform/stats`);
            const stats = await response.json();
            
            document.getElementById('activeMiners').textContent = stats.activeMiners || 0;
            document.getElementById('pendingJobs').textContent = stats.pendingJobs || 0;
        } catch (error) {
            console.error('Failed to update network stats:', error);
        }
    }

    addEarningHistory(job) {
        const earningsHistory = document.getElementById('earningsHistory');
        const earning = document.createElement('div');
        earning.className = 'flex justify-between items-center py-2 border-b border-gray-700';
        earning.innerHTML = `
            <div>
                <div class="text-sm font-medium">${job.title}</div>
                <div class="text-xs text-gray-400">${new Date().toLocaleTimeString()}</div>
            </div>
            <div class="text-yellow-400 font-semibold">+${(job.reward / 1000).toFixed(2)} VFT</div>
        `;
        earningsHistory.insertBefore(earning, earningsHistory.firstChild);
        
        // Keep only last 5 entries
        while (earningsHistory.children.length > 5) {
            earningsHistory.removeChild(earningsHistory.lastChild);
        }
    }

    startRealTimeUpdates() {
        // Update uptime every second
        const startTime = Date.now();
        setInterval(() => {
            const uptime = Date.now() - startTime;
            const hours = Math.floor(uptime / (1000 * 60 * 60));
            const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
            
            document.getElementById('uptime').textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);

        // Check for jobs every 10 seconds
        setInterval(() => {
            if (!this.currentJob) {
                this.checkForJobs();
            }
        }, 10000);

        // Update network stats every 30 seconds
        setInterval(() => {
            this.updateNetworkStats();
        }, 30000);

        // Simulate hardware fluctuations when idle
        setInterval(() => {
            if (!this.currentJob) {
                this.hardware.gpuUsage = Math.random() * 10; // Low usage when idle
                this.hardware.gpuTemp = 35 + Math.random() * 15; // Cool when idle
                this.updateHardwareUI();
            }
        }, 5000);
    }
}

// Global functions
function refreshJobs() {
    if (window.minerClient) {
        window.minerClient.checkForJobs();
    }
}

function disconnect() {
    if (confirm('Are you sure you want to disconnect from the VFT network?')) {
        localStorage.removeItem('vft_miner_id');
        localStorage.removeItem('vft_miner_wallet');
        window.location.reload();
    }
}

// Initialize miner client when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.minerClient = new VFTMinerClient();
});