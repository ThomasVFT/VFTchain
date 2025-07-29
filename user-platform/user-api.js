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
        
        this.init();
    }

    async init() {
        if (this.wallet && this.authToken) {
            this.updateWalletUI();
            await this.loadUserData();
        }
        
        await this.loadNetworkStats();
        this.updateUI();
        this.startRealTimeUpdates();
        this.bindEvents();
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
            
            // Update user stats (mock data for now)
            this.userStats.vftBalance = Math.random() * 1000;
            this.userStats.completedJobs = this.userJobs.filter(job => job.status === 'completed').length;
            this.userStats.totalSpent = this.userJobs.reduce((total, job) => total + (job.budget_vft || 0), 0);
            
        } catch (error) {
            console.error('Failed to load user data:', error);
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
            document.getElementById('activeMiners').textContent = stats.activeMiners || 0;
            document.getElementById('totalJobs').textContent = stats.totalJobs || 0;
            
            // Update network status based on stats
            const load = stats.activeJobs / Math.max(stats.activeMiners, 1);
            let loadText = 'Low';
            if (load > 0.7) loadText = 'High';
            else if (load > 0.4) loadText = 'Medium';
            
            document.getElementById('networkLoad').textContent = loadText;
        } catch (error) {
            console.error('Failed to load network stats:', error);
        }
    }

    async submitJob() {
        if (!this.wallet) {
            this.showNotification('Please connect your wallet first', 'error');
            return;
        }

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

        try {
            document.getElementById('submitJobBtn').disabled = true;
            document.getElementById('submitJobBtn').innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...';

            const result = await this.request('/jobs', {
                method: 'POST',
                body: JSON.stringify(formData)
            });

            if (result.success) {
                this.showNotification('Job submitted successfully!', 'success');
                document.getElementById('jobForm').reset();
                await this.loadUserJobs();
                this.addRecentActivity('Job submitted', formData.title);
            } else {
                throw new Error(result.message || 'Job submission failed');
            }
        } catch (error) {
            console.error('Job submission failed:', error);
            this.showNotification('Failed to submit job. Please try again.', 'error');
        } finally {
            document.getElementById('submitJobBtn').disabled = false;
            document.getElementById('submitJobBtn').innerHTML = '<i class="fas fa-rocket mr-2"></i>Submit Job';
        }
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
                'running': 'blue',
                'completed': 'green',
                'failed': 'red'
            }[job.status] || 'gray';

            const statusIcon = {
                'pending': 'clock',
                'running': 'cog fa-spin',
                'completed': 'check-circle',
                'failed': 'times-circle'
            }[job.status] || 'question';

            return `
                <div class="glass-dark rounded-lg p-4 card-hover cursor-pointer" onclick="viewJob('${job.id}')">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="font-semibold">${job.title}</h4>
                            <p class="text-gray-400 text-sm">${job.compute_type.toUpperCase()}</p>
                        </div>
                        <div class="flex items-center space-x-2">
                            <span class="bg-${statusColor}-500 text-xs px-2 py-1 rounded-full">${job.status}</span>
                            <i class="fas fa-${statusIcon} text-${statusColor}-400"></i>
                        </div>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-400">Budget: ${job.budget_vft} VFT</span>
                        <span class="text-gray-400">${new Date(job.created_at).toLocaleDateString()}</span>
                    </div>
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