// VFT Rewards Tracking Service - Desktop Client Integration
// Automatically tracks all miner activities and ensures rewards are distributed

const { ipcRenderer } = require('electron');
const winston = require('winston');
const axios = require('axios');
const Store = require('electron-store');
const crypto = require('crypto');
const WebSocket = require('ws');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'rewards-tracker.log' })
    ]
});

// Persistent storage for tracking
const rewardsStore = new Store({
    name: 'vft-rewards-tracker',
    defaults: {
        wallet_address: null,
        pending_activities: [],
        total_earned: 0,
        last_sync: null,
        failed_submissions: []
    }
});

class RewardsTracker {
    constructor(apiEndpoint = null) {
        // Multiple API endpoints for failover
        this.apiEndpoints = [
            apiEndpoint || process.env.VFT_API_ENDPOINT || 'https://api.vftchain.com',
            'http://localhost:8000',  // Local development
            'https://backup-api.vftchain.com'
        ];
        this.currentEndpointIndex = 0;
        this.walletAddress = rewardsStore.get('wallet_address');
        this.isInitialized = false;
        this.retryQueue = [];
        this.syncInterval = null;
        this.offlineMode = false;
        this.websocket = null;
        this.heartbeatInterval = null;
        
        // Activity tracking state
        this.currentMiningSession = null;
        this.jobCompletions = new Map();
        this.pendingRewards = [];
        this.systemFingerprint = null;
        this.registrationData = null;
        
        // Duplicate prevention
        this.processedActivities = new Set();
        
        logger.info('Rewards tracker initialized');
    }

    /**
     * Initialize rewards tracking with wallet address
     */
    async initialize(walletAddress) {
        try {
            this.walletAddress = walletAddress;
            rewardsStore.set('wallet_address', walletAddress);
            
            // Generate system fingerprint
            await this.generateSystemFingerprint();
            
            // Register with desktop API first
            await this.registerWithDesktopAPI();
            
            // Start sync interval
            this.startSyncInterval();
            
            // Start heartbeat
            this.startHeartbeat();
            
            // Establish WebSocket connection
            await this.connectWebSocket();
            
            // Process any pending activities
            await this.processPendingActivities();
            
            // Check connection to rewards API
            await this.checkAPIConnection();
            
            this.isInitialized = true;
            logger.info(`Rewards tracker initialized for wallet: ${walletAddress}`);
            
            return { success: true, wallet: walletAddress, fingerprint: this.systemFingerprint };
        } catch (error) {
            logger.error('Failed to initialize rewards tracker:', error);
            // Still allow offline operation
            this.isInitialized = true;
            this.offlineMode = true;
            return { success: false, error: error.message, offlineMode: true };
        }
    }

    /**
     * Track mining session start
     */
    async trackMiningStart(sessionData) {
        try {
            const activity = {
                id: `mining_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'mining_started',
                wallet: this.walletAddress,
                timestamp: Date.now(),
                data: {
                    gpu_id: sessionData.gpuId,
                    gpu_name: sessionData.gpuName,
                    compute_power: sessionData.computePower,
                    session_id: sessionData.sessionId
                },
                status: 'pending'
            };
            
            this.currentMiningSession = activity;
            
            // Track activity
            await this.trackActivity(activity);
            
            logger.info('Mining session started:', activity.id);
            return { success: true, activityId: activity.id };
            
        } catch (error) {
            logger.error('Failed to track mining start:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Track job completion
     */
    async trackJobCompletion(jobData) {
        try {
            const activity = {
                id: `job_${jobData.jobId}_${Date.now()}`,
                type: 'job_completed',
                wallet: this.walletAddress,
                timestamp: Date.now(),
                data: {
                    job_id: jobData.jobId,
                    duration_seconds: jobData.duration,
                    vft_earned: jobData.vftEarned,
                    gpu_used: jobData.gpuId,
                    model_type: jobData.modelType,
                    success: true
                },
                status: 'pending'
            };
            
            // Store job completion
            this.jobCompletions.set(jobData.jobId, activity);
            
            // Track activity
            await this.trackActivity(activity);
            
            logger.info('Job completion tracked:', jobData.jobId);
            return { success: true, activityId: activity.id };
            
        } catch (error) {
            logger.error('Failed to track job completion:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Track validation provided
     */
    async trackValidation(validationData) {
        try {
            const activity = {
                id: `validation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: 'validation_provided',
                wallet: this.walletAddress,
                timestamp: Date.now(),
                data: {
                    job_id: validationData.jobId,
                    validation_score: validationData.score,
                    validation_type: validationData.type
                },
                status: 'pending'
            };
            
            // Track activity
            await this.trackActivity(activity);
            
            logger.info('Validation tracked:', activity.id);
            return { success: true, activityId: activity.id };
            
        } catch (error) {
            logger.error('Failed to track validation:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Core activity tracking with automatic retry
     */
    async trackActivity(activity) {
        try {
            // Store locally first (foolproof - never lose data)
            this.storePendingActivity(activity);
            
            // Try to submit immediately
            const result = await this.submitActivityToAPI(activity);
            
            if (result.success) {
                // Mark as submitted
                this.markActivitySubmitted(activity.id);
                
                // Update local rewards estimate
                this.updateLocalRewards(result.rewardAmount);
                
                // Emit event for UI update
                this.emitRewardUpdate({
                    activityId: activity.id,
                    type: activity.type,
                    rewardAmount: result.rewardAmount,
                    totalEarned: rewardsStore.get('total_earned')
                });
                
                return result;
            } else {
                // Add to retry queue
                this.addToRetryQueue(activity);
                return { success: false, queued: true };
            }
            
        } catch (error) {
            logger.error('Activity tracking failed:', error);
            
            // Always store for later retry (foolproof)
            this.addToRetryQueue(activity);
            
            return { success: false, error: error.message, queued: true };
        }
    }

    /**
     * Submit activity to rewards API with failover
     */
    async submitActivityToAPI(activity) {
        let lastError = null;
        
        // Try each endpoint in order
        for (let i = 0; i < this.apiEndpoints.length; i++) {
            try {
                const endpoint = `${this.apiEndpoints[this.currentEndpointIndex]}/api/v1/rewards/track`;
                
                const response = await axios.post(endpoint, {
                    wallet_address: activity.wallet,
                    activity_type: activity.type,
                    activity_data: activity.data,
                    timestamp: activity.timestamp,
                    fingerprint: this.systemFingerprint,
                    client_version: process.env.npm_package_version || '1.0.0'
                }, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Client-Type': 'desktop-miner',
                        'X-Wallet-Address': activity.wallet,
                        'X-System-Fingerprint': this.systemFingerprint
                    }
                });
                
                if (response.data.status === 'success') {
                    return {
                        success: true,
                        rewardAmount: response.data.reward_amount || 0,
                        transactionId: response.data.transaction_id
                    };
                } else {
                    throw new Error(response.data.message || 'API error');
                }
                
            } catch (error) {
                lastError = error;
                logger.warn(`API endpoint ${this.apiEndpoints[this.currentEndpointIndex]} failed, trying next...`);
                
                // Move to next endpoint
                this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.apiEndpoints.length;
                
                if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                    continue; // Try next endpoint
                }
            }
        }
        
        // All endpoints failed
        this.offlineMode = true;
        logger.warn('All API endpoints offline, switching to offline mode');
        throw lastError;
    }

    /**
     * Store pending activity locally
     */
    storePendingActivity(activity) {
        const pending = rewardsStore.get('pending_activities') || [];
        pending.push(activity);
        rewardsStore.set('pending_activities', pending);
    }

    /**
     * Mark activity as submitted
     */
    markActivitySubmitted(activityId) {
        const pending = rewardsStore.get('pending_activities') || [];
        const updated = pending.filter(a => a.id !== activityId);
        rewardsStore.set('pending_activities', updated);
    }

    /**
     * Add activity to retry queue
     */
    addToRetryQueue(activity) {
        if (!this.retryQueue.find(a => a.id === activity.id)) {
            activity.retryCount = (activity.retryCount || 0) + 1;
            activity.nextRetry = Date.now() + (activity.retryCount * 60000); // Exponential backoff
            this.retryQueue.push(activity);
            
            logger.info(`Activity ${activity.id} queued for retry (attempt ${activity.retryCount})`);
        }
    }

    /**
     * Process pending activities (called on startup and periodically)
     */
    async processPendingActivities() {
        const pending = rewardsStore.get('pending_activities') || [];
        const failed = rewardsStore.get('failed_submissions') || [];
        
        // Combine pending and failed for retry
        const toProcess = [...pending, ...failed];
        
        logger.info(`Processing ${toProcess.length} pending activities`);
        
        for (const activity of toProcess) {
            try {
                await this.trackActivity(activity);
            } catch (error) {
                logger.error(`Failed to process pending activity ${activity.id}:`, error);
            }
        }
    }

    /**
     * Retry failed submissions
     */
    async retryFailedSubmissions() {
        const now = Date.now();
        const toRetry = this.retryQueue.filter(a => a.nextRetry <= now);
        
        for (const activity of toRetry) {
            if (activity.retryCount > 5) {
                // Move to permanent failure after 5 retries
                const failed = rewardsStore.get('failed_submissions') || [];
                failed.push(activity);
                rewardsStore.set('failed_submissions', failed);
                
                // Remove from retry queue
                this.retryQueue = this.retryQueue.filter(a => a.id !== activity.id);
                
                logger.error(`Activity ${activity.id} permanently failed after 5 retries`);
                continue;
            }
            
            try {
                await this.trackActivity(activity);
                
                // Remove from retry queue on success
                this.retryQueue = this.retryQueue.filter(a => a.id !== activity.id);
                
            } catch (error) {
                logger.error(`Retry failed for activity ${activity.id}:`, error);
            }
        }
    }

    /**
     * Update local rewards estimate
     */
    updateLocalRewards(amount) {
        const currentTotal = rewardsStore.get('total_earned') || 0;
        const newTotal = currentTotal + amount;
        rewardsStore.set('total_earned', newTotal);
        rewardsStore.set('last_sync', Date.now());
    }

    /**
     * Get current rewards status
     */
    async getRewardsStatus() {
        try {
            // Try to get fresh data from API
            if (!this.offlineMode) {
                const response = await axios.get(
                    `${this.apiEndpoint}/api/v1/rewards/wallet/${this.walletAddress}`,
                    { timeout: 5000 }
                );
                
                if (response.data.status === 'success') {
                    // Update local cache
                    rewardsStore.set('total_earned', response.data.data.total_earned_estimate);
                    rewardsStore.set('last_sync', Date.now());
                    
                    return response.data.data;
                }
            }
        } catch (error) {
            logger.warn('Failed to fetch rewards status from API, using local data');
        }
        
        // Return local data as fallback
        return {
            wallet_address: this.walletAddress,
            total_earned_estimate: rewardsStore.get('total_earned') || 0,
            pending_activities: (rewardsStore.get('pending_activities') || []).length,
            failed_submissions: (rewardsStore.get('failed_submissions') || []).length,
            last_sync: rewardsStore.get('last_sync'),
            offline_mode: this.offlineMode
        };
    }

    /**
     * Start sync interval
     */
    startSyncInterval() {
        // Sync every 2 minutes (less aggressive to avoid mining interference)
        this.syncInterval = setInterval(async () => {
            try {
                await this.retryFailedSubmissions();
                // Only check API connection if not already in offline mode
                if (!this.offlineMode) {
                    await this.checkAPIConnection();
                }
            } catch (error) {
                // Silent fail to avoid affecting mining state
            }
        }, 120000); // Every 2 minutes
    }

    /**
     * Stop sync interval
     */
    stopSyncInterval() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    /**
     * Check API connection
     */
    async checkAPIConnection() {
        try {
            // Use current endpoint from array
            const currentEndpoint = this.apiEndpoints[this.currentEndpointIndex];
            const response = await axios.get(`${currentEndpoint}/api/v1/health`, { 
                timeout: 3000 // Shorter timeout
            });
            
            if (response.status === 200) {
                if (this.offlineMode) {
                    logger.info('API connection restored');
                    this.offlineMode = false;
                    
                    // Process pending activities in background
                    setTimeout(() => this.processPendingActivities(), 1000);
                }
            }
        } catch (error) {
            if (!this.offlineMode) {
                // Don't log - silent switch to offline mode
                this.offlineMode = true;
            }
        }
    }

    /**
     * Emit reward update event
     */
    emitRewardUpdate(data) {
        if (typeof window !== 'undefined' && window.electronAPI) {
            window.electronAPI.send('reward-update', data);
        }
    }

    /**
     * Generate system fingerprint for verification
     */
    async generateSystemFingerprint() {
        try {
            const si = require('systeminformation');
            const [cpu, system, os] = await Promise.all([
                si.cpu(),
                si.system(),
                si.osInfo()
            ]);
            
            const fingerprint = crypto.createHash('sha256')
                .update(cpu.manufacturer + cpu.brand + cpu.cores)
                .update(system.manufacturer + system.model)
                .update(os.platform + os.arch)
                .digest('hex');
                
            this.systemFingerprint = fingerprint;
            rewardsStore.set('system_fingerprint', fingerprint);
            
            return fingerprint;
        } catch (error) {
            logger.error('Failed to generate fingerprint:', error);
            // Use stored fingerprint if available
            this.systemFingerprint = rewardsStore.get('system_fingerprint') || 'unknown';
            return this.systemFingerprint;
        }
    }

    /**
     * Register with desktop API
     */
    async registerWithDesktopAPI() {
        try {
            const si = require('systeminformation');
            const [cpu, mem, graphics] = await Promise.all([
                si.cpu(),
                si.mem(),
                si.graphics()
            ]);
            
            const hardwareSpecs = {
                cpu: {
                    model: cpu.brand,
                    cores: cpu.cores,
                    speed: cpu.speed
                },
                memory: {
                    total: mem.total,
                    type: 'DDR4' // Default, could be detected
                },
                gpu: graphics.controllers.map(gpu => ({
                    model: gpu.model,
                    vram: gpu.vram,
                    vendor: gpu.vendor
                }))
            };
            
            // Try desktop API endpoints
            const desktopEndpoints = [
                'http://localhost:8000/api/desktop/register',
                `${this.apiEndpoints[0]}/api/desktop/register`
            ];
            
            for (const endpoint of desktopEndpoints) {
                try {
                    const response = await axios.post(endpoint, {
                        wallet_address: this.walletAddress,
                        hardware_specs: hardwareSpecs
                    }, {
                        timeout: 5000
                    });
                    
                    if (response.data.status === 'success') {
                        this.registrationData = response.data;
                        logger.info('Successfully registered with desktop API');
                        return true;
                    }
                } catch (error) {
                    logger.warn(`Failed to register at ${endpoint}:`, error.message);
                }
            }
            
            logger.warn('Could not register with desktop API, continuing in offline mode');
            return false;
            
        } catch (error) {
            logger.error('Registration failed:', error);
            return false;
        }
    }

    /**
     * Connect WebSocket for real-time updates
     */
    async connectWebSocket() {
        try {
            const WebSocket = require('ws');
            const wsEndpoints = [
                `ws://localhost:8000/api/desktop/ws/${this.walletAddress}`,
                `wss://api.vftchain.com/api/desktop/ws/${this.walletAddress}`
            ];
            
            for (const endpoint of wsEndpoints) {
                try {
                    this.websocket = new WebSocket(endpoint);
                    
                    await new Promise((resolve, reject) => {
                        this.websocket.on('open', () => {
                            logger.info('WebSocket connected');
                            resolve();
                        });
                        
                        this.websocket.on('error', reject);
                        
                        setTimeout(() => reject(new Error('WebSocket timeout')), 5000);
                    });
                    
                    // Setup WebSocket handlers
                    this.setupWebSocketHandlers();
                    
                    return true;
                } catch (error) {
                    logger.warn(`WebSocket connection failed for ${endpoint}`);
                }
            }
            
            logger.warn('Could not establish WebSocket connection');
            return false;
            
        } catch (error) {
            logger.error('WebSocket connection error:', error);
            return false;
        }
    }

    /**
     * Setup WebSocket event handlers
     */
    setupWebSocketHandlers() {
        if (!this.websocket) return;
        
        this.websocket.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                
                switch (message.type) {
                    case 'new_task':
                        this.handleNewTask(message.task);
                        break;
                    case 'task_available':
                        this.handleTaskAvailable(message);
                        break;
                    case 'reward_update':
                        this.updateLocalRewards(message.amount);
                        break;
                    case 'pong':
                        // Heartbeat response
                        break;
                }
            } catch (error) {
                logger.error('WebSocket message error:', error);
            }
        });
        
        this.websocket.on('close', () => {
            logger.warn('WebSocket disconnected, attempting reconnect...');
            setTimeout(() => this.connectWebSocket(), 5000);
        });
        
        this.websocket.on('error', (error) => {
            logger.error('WebSocket error:', error);
        });
    }

    /**
     * Start heartbeat to maintain connection
     */
    startHeartbeat() {
        // Send heartbeat to API (less frequent to avoid mining interference)
        this.heartbeatInterval = setInterval(async () => {
            try {
                // Only send heartbeat if not in offline mode
                if (this.offlineMode) return;
                
                // Send WebSocket ping only (no HTTP request to avoid network errors)
                if (this.websocket && this.websocket.readyState === 1) { // 1 = OPEN
                    this.websocket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                }
                
            } catch (error) {
                // Silent fail - don't log heartbeat errors to avoid spam
                // This prevents heartbeat failures from affecting mining state
            }
        }, 60000); // Every 60 seconds (less frequent)
    }

    /**
     * Handle new task from WebSocket
     */
    handleNewTask(task) {
        logger.info('New task received:', task);
        
        // Emit event for UI
        this.emitRewardUpdate({
            type: 'new_task',
            task: task
        });
    }

    /**
     * Handle task available notification
     */
    handleTaskAvailable(message) {
        logger.info('Task available:', message);
        
        // Emit event for UI
        this.emitRewardUpdate({
            type: 'task_available',
            taskId: message.task_id,
            priority: message.priority
        });
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.stopSyncInterval();
        
        // Stop heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // Close WebSocket
        if (this.websocket) {
            this.websocket.close();
        }
        
        // Save any pending data
        if (this.currentMiningSession) {
            this.storePendingActivity(this.currentMiningSession);
        }
        
        logger.info('Rewards tracker cleaned up');
    }
}

// Export singleton instance
const rewardsTracker = new RewardsTracker();

module.exports = { RewardsTracker, rewardsTracker };
