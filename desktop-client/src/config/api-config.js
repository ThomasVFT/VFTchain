// API Configuration for VFT Desktop Client - Foolproof Integration

// Production API Configuration with multiple fallbacks
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

const API_CONFIG = {
    // Primary endpoints with automatic fallback
    BASE_URL: isDev ? 'http://localhost:8000' : 'https://vftchain.com',
    WS_URL: isDev ? 'ws://localhost:8000' : 'wss://vftchain.com',
    
    // Fallback endpoints for resilience
    FALLBACK_URLS: [
        'https://vftchain.com',
        'https://api.vftchain.com',
        'https://backup-api.vftchain.com',
        'http://localhost:8000'
    ],
    
    // Service endpoints
    endpoints: {
        // Storage Service
        storage: {
            uploadChunk: '/api/v1/storage/upload/chunk',
            uploadComplete: '/api/v1/storage/upload/complete',
            downloadFile: '/api/v1/storage/download',
            getFileStatus: '/api/v1/storage/status'
        },
        
        // Job Marketplace
        jobs: {
            create: '/api/v1/jobs/create',
            list: '/api/v1/jobs/list',
            get: '/api/v1/jobs/',
            submit: '/api/v1/jobs/submit',
            status: '/api/v1/jobs/status'
        },
        
        // Mining
        mining: {
            register: '/api/v1/mining/register',
            heartbeat: '/api/v1/mining/heartbeat',
            getTask: '/api/v1/mining/task',
            submitProof: '/api/v1/mining/proof',
            stats: '/api/v1/mining/stats'
        },
        
        // Wallet
        wallet: {
            balance: '/api/v1/wallet/balance',
            transactions: '/api/v1/wallet/transactions',
            transfer: '/api/v1/wallet/transfer'
        },
        
        // P2P Network
        p2p: {
            seeds: '/api/v1/network/seeds',
            announce: '/api/v1/network/announce',
            peers: '/api/v1/network/peers'
        },
        
        // Desktop API Integration
        desktop: {
            register: '/api/desktop/register',
            heartbeat: '/api/desktop/heartbeat',
            tasksAvailable: '/api/desktop/tasks/available',
            taskStart: '/api/desktop/tasks/:taskId/start',
            taskComplete: '/api/desktop/tasks/:taskId/complete',
            earnings: '/api/desktop/earnings',
            stake: '/api/desktop/stake',
            networkStats: '/api/desktop/network/stats'
        },
        
        // Rewards Tracking API
        rewards: {
            track: '/api/v1/rewards/track',
            status: '/api/v1/rewards/wallet/:walletAddress',
            history: '/api/v1/rewards/history/:walletAddress',
            export: '/api/v1/rewards/export/:walletAddress',
            health: '/api/v1/health'
        }
    },
    
    // Timeouts
    timeouts: {
        default: 30000,
        upload: 300000,
        download: 300000
    },
    
    // Headers
    getHeaders: (token) => {
        const headers = {
            'Content-Type': 'application/json',
            'X-Client-Version': require('../../package.json').version,
            'X-Platform': process.platform
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        return headers;
    }
};

// Helper function to build full URLs with parameter substitution
API_CONFIG.buildUrl = function(endpoint, params = {}) {
    let url = `${this.BASE_URL}${endpoint}`;
    
    // Replace path parameters
    Object.keys(params).forEach(key => {
        url = url.replace(':' + key, params[key]);
    });
    
    return url;
};

// Helper function to build WebSocket URLs
API_CONFIG.buildWsUrl = function(endpoint, params = {}) {
    let url = `${this.WS_URL}${endpoint}`;
    
    // Replace path parameters
    Object.keys(params).forEach(key => {
        url = url.replace(':' + key, params[key]);
    });
    
    return url;
};

// Get desktop WebSocket URL
API_CONFIG.getDesktopWsUrl = function(walletAddress) {
    return this.buildWsUrl(`/api/desktop/ws/${walletAddress}`);
};

// Try multiple endpoints with automatic fallback
API_CONFIG.tryEndpoints = async function(endpoint, options = {}, params = {}) {
    let lastError = null;
    
    for (const baseUrl of this.FALLBACK_URLS) {
        try {
            let url = baseUrl + endpoint;
            
            // Replace path parameters
            Object.keys(params).forEach(key => {
                url = url.replace(':' + key, params[key]);
            });
            
            const response = await fetch(url, {
                ...options,
                timeout: options.timeout || this.timeouts.default,
                headers: this.getHeaders(options.token)
            });
            
            if (response.ok) {
                // Update BASE_URL to the working endpoint
                this.BASE_URL = baseUrl;
                return response;
            }
        } catch (error) {
            lastError = error;
            console.warn(`API endpoint ${baseUrl} failed:`, error.message);
        }
    }
    
    throw lastError || new Error('All API endpoints failed');
};

module.exports = API_CONFIG;