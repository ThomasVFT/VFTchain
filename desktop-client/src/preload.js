// VFT Platform Preload
const { contextBridge, ipcRenderer } = require('electron');

// Check if contextBridge is available (contextIsolation: true)
if (contextBridge && contextBridge.exposeInMainWorld) {
    // Production mode with contextIsolation: true
    contextBridge.exposeInMainWorld('vftAPI', {
        // Network operations
        getNetworkStatus: () => ipcRenderer.invoke('getNetworkStatus'),
        
        // GPU operations
        detectGPUs: () => ipcRenderer.invoke('detectGPUs'),
        getGPUHealth: () => ipcRenderer.invoke('getGPUHealth'),
        
        // System metrics
        getSystemMetrics: () => ipcRenderer.invoke('getSystemMetrics'),
        getAnalytics: () => ipcRenderer.invoke('getAnalytics'),
        
        // Job operations
        submitJob: (job) => ipcRenderer.invoke('submitJob', job),
        jobCompleted: (jobData) => ipcRenderer.invoke('jobCompleted', jobData),
        
        // Mining operations
        startMining: (config) => ipcRenderer.invoke('startMining', config),
        stopMining: () => ipcRenderer.invoke('stopMining'),
        streamMiningLogs: (callback) => {
            ipcRenderer.on('mining-log', (event, message) => callback(message));
            return Promise.resolve();
        },
        stopMiningLogs: () => {
            ipcRenderer.removeAllListeners('mining-log');
        },
        
        // Wallet operations
        connectWallet: (walletType) => ipcRenderer.invoke('connectWallet', walletType),
        disconnectWallet: () => ipcRenderer.invoke('disconnectWallet'),
        getWalletBalance: () => ipcRenderer.invoke('getWalletBalance'),
        getNetworkInfo: () => ipcRenderer.invoke('getNetworkInfo'),
        
        // Validation operations
        validationProvided: (validationData) => ipcRenderer.invoke('validationProvided', validationData),
        
        // Rewards tracking
        getRewardsStatus: () => ipcRenderer.invoke('getRewardsStatus'),
        trackPlatformLogin: () => ipcRenderer.invoke('trackPlatformLogin'),
        
        // Task management
        getAvailableTasks: () => ipcRenderer.invoke('getAvailableTasks'),
        
        // Event listeners
        on: (channel, callback) => {
            const validChannels = [
                'job-assigned',
                'job-completed', 
                'miner-joined',
                'network-update',
                'reward-update',
                'rewards-sync',
                'rewards-initialized',
                'mining-started',
                'mining-stopped',
                'new-task-available',
                'auto-resume-mining',
                'task-available',
                'wallet-restored',
                'mining-log'
            ];
            
            if (validChannels.includes(channel)) {
                ipcRenderer.on(channel, (event, ...args) => callback(...args));
            }
        },
        
        // Remove event listeners
        off: (channel, callback) => {
            ipcRenderer.removeListener(channel, callback);
        }
    });
} else {
    // Development mode with contextIsolation: false
    window.vftAPI = {
    // Network operations
    getNetworkStatus: () => ipcRenderer.invoke('getNetworkStatus'),
    
    // GPU operations
    detectGPUs: () => ipcRenderer.invoke('detectGPUs'),
    getGPUHealth: () => ipcRenderer.invoke('getGPUHealth'),
    
    // System metrics
    getSystemMetrics: () => ipcRenderer.invoke('getSystemMetrics'),
    getAnalytics: () => ipcRenderer.invoke('getAnalytics'),
    
    // Job operations
    submitJob: (job) => ipcRenderer.invoke('submitJob', job),
    jobCompleted: (jobData) => ipcRenderer.invoke('jobCompleted', jobData),
    
    // Mining operations
    startMining: (config) => ipcRenderer.invoke('startMining', config),
    stopMining: () => ipcRenderer.invoke('stopMining'),
    streamMiningLogs: (callback) => {
        ipcRenderer.on('mining-log', (event, message) => callback(message));
        return Promise.resolve();
    },
    stopMiningLogs: () => {
        ipcRenderer.removeAllListeners('mining-log');
    },
    
    // Wallet operations
    connectWallet: (walletType) => ipcRenderer.invoke('connectWallet', walletType),
    disconnectWallet: () => ipcRenderer.invoke('disconnectWallet'),
    getWalletBalance: () => ipcRenderer.invoke('getWalletBalance'),
    getNetworkInfo: () => ipcRenderer.invoke('getNetworkInfo'),
    
    // Validation operations
    validationProvided: (validationData) => ipcRenderer.invoke('validationProvided', validationData),
    
    // Rewards tracking
    getRewardsStatus: () => ipcRenderer.invoke('getRewardsStatus'),
    trackPlatformLogin: () => ipcRenderer.invoke('trackPlatformLogin'),
    
    // Task management
    getAvailableTasks: () => ipcRenderer.invoke('getAvailableTasks'),
    
    // Event listeners
    on: (channel, callback) => {
        const validChannels = [
            'job-assigned',
            'job-completed', 
            'miner-joined',
            'network-update',
            'reward-update',
            'rewards-sync',
            'rewards-initialized',
            'mining-started',
            'mining-stopped',
            'new-task-available',
            'auto-resume-mining',
            'task-available',
            'wallet-restored',
            'mining-log'
        ];
        
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    
    // Remove event listeners
    off: (channel, callback) => {
        ipcRenderer.removeListener(channel, callback);
    }
};

    console.log('VFT Platform preload ready (contextIsolation: false)');
}

// Log preload environment
console.log('Preload environment:', {
    contextIsolation: typeof contextBridge !== 'undefined',
    nodeIntegration: typeof require !== 'undefined',
    platform: process.platform
});
