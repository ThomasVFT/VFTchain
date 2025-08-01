// Production-ready configuration
module.exports = {
    // Network Configuration
    network: {
        mainnet: {
            rpcEndpoint: 'https://api.mainnet-beta.solana.com',
            wsEndpoint: 'wss://api.mainnet-beta.solana.com',
            explorerUrl: 'https://explorer.solana.com'
        },
        testnet: {
            rpcEndpoint: 'https://api.testnet.solana.com',
            wsEndpoint: 'wss://api.testnet.solana.com',
            explorerUrl: 'https://explorer.solana.com?cluster=testnet'
        },
        current: 'mainnet'
    },
    
    // P2P Configuration
    p2p: {
        port: 42069,
        maxPeers: 100,
        discoveryInterval: 30000,
        heartbeatInterval: 15000,
        reconnectDelay: 5000
    },
    
    // Mining Configuration
    mining: {
        defaultGpuUtilization: 80,
        temperatureLimit: 85,
        minJobReward: 0.1,
        jobTimeout: 3600000, // 1 hour
        proofGenerationInterval: 60000 // 1 minute
    },
    
    // Storage Configuration
    storage: {
        maxChunkSize: 268435456, // 256MB
        tempDirectory: './temp',
        cacheSize: 5368709120, // 5GB
        cleanupInterval: 3600000 // 1 hour
    },
    
    // API Configuration - Updated for AWS
    api: {
        baseUrl: 'https://vftchain.com',
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000
    },
    
    // Security Configuration
    security: {
        encryptionAlgorithm: 'aes-256-gcm',
        hashAlgorithm: 'sha256',
        tokenExpiry: 86400000, // 24 hours
        maxLoginAttempts: 5
    },
    
    // UI Configuration
    ui: {
        theme: 'dark',
        animationsEnabled: true,
        notificationsEnabled: true,
        autoUpdate: true
    },
    
    // Logging Configuration
    logging: {
        level: 'info',
        maxFiles: 10,
        maxFileSize: 10485760, // 10MB
        directory: './logs'
    }
};
