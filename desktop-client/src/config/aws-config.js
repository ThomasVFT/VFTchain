// AWS Configuration for VFT Desktop Client
// Production-ready configuration for worldwide distribution

const AWS_REGIONS = {
    'us-east-1': {
        name: 'US East (N. Virginia)',
        endpoint: 'https://api.us-east-1.vftchain.com',
        wsEndpoint: 'wss://ws.us-east-1.vftchain.com',
        s3Bucket: 'vft-client-updates-us-east-1'
    },
    'eu-west-1': {
        name: 'EU (Ireland)',
        endpoint: 'https://api.eu-west-1.vftchain.com',
        wsEndpoint: 'wss://ws.eu-west-1.vftchain.com',
        s3Bucket: 'vft-client-updates-eu-west-1'
    },
    'ap-southeast-1': {
        name: 'Asia Pacific (Singapore)',
        endpoint: 'https://api.ap-southeast-1.vftchain.com',
        wsEndpoint: 'wss://ws.ap-southeast-1.vftchain.com',
        s3Bucket: 'vft-client-updates-ap-southeast-1'
    },
    'ap-northeast-1': {
        name: 'Asia Pacific (Tokyo)',
        endpoint: 'https://api.ap-northeast-1.vftchain.com',
        wsEndpoint: 'wss://ws.ap-northeast-1.vftchain.com',
        s3Bucket: 'vft-client-updates-ap-northeast-1'
    }
};

const AWS_CONFIG = {
    // CloudFront Distribution
    cloudfront: {
        distributionId: 'E1XXXXXXXXXXXX',
        domain: 'cdn.vftchain.com',
        updatesDomain: 'updates.vftchain.com'
    },

    // API Gateway Configuration
    apiGateway: {
        baseUrl: 'https://api.vftchain.com',
        version: 'v1',
        timeout: 30000,
        retryConfig: {
            retries: 3,
            retryDelay: 1000,
            retryCondition: (error) => {
                return error.response && error.response.status >= 500;
            }
        }
    },

    // S3 Configuration
    s3: {
        region: 'us-east-1',
        updatesBucket: 'vft-desktop-updates',
        assetsBucket: 'vft-desktop-assets',
        logsBucket: 'vft-desktop-logs'
    },

    // DynamoDB Configuration
    dynamodb: {
        region: 'us-east-1',
        tables: {
            userSessions: 'vft-user-sessions',
            minerStats: 'vft-miner-stats',
            jobHistory: 'vft-job-history'
        }
    },

    // Cognito Configuration
    cognito: {
        region: 'us-east-1',
        userPoolId: 'us-east-1_XXXXXXXXX',
        clientId: 'XXXXXXXXXXXXXXXXXXXXXXXXXX',
        identityPoolId: 'us-east-1:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'
    },

    // CloudWatch Configuration
    cloudwatch: {
        region: 'us-east-1',
        namespace: 'VFT/DesktopClient',
        logGroup: '/aws/vft/desktop-client',
        metricsInterval: 60000 // 1 minute
    },

    // Auto-update Configuration
    autoUpdate: {
        enabled: true,
        checkInterval: 3600000, // 1 hour
        channel: 'stable', // stable, beta, nightly
        allowPrerelease: false,
        allowDowngrade: false
    },

    // Regional Failover Configuration
    failover: {
        enabled: true,
        healthCheckInterval: 30000, // 30 seconds
        maxRetries: 3,
        fallbackRegions: ['us-east-1', 'eu-west-1', 'ap-southeast-1']
    }
};

// Helper function to get nearest region based on latency
async function getNearestRegion() {
    const latencyTests = await Promise.all(
        Object.entries(AWS_REGIONS).map(async ([region, config]) => {
            const start = Date.now();
            try {
                const response = await fetch(`${config.endpoint}/health`, {
                    method: 'GET',
                    timeout: 5000
                });
                const latency = Date.now() - start;
                return { region, latency, available: response.ok };
            } catch (error) {
                return { region, latency: Infinity, available: false };
            }
        })
    );

    // Sort by latency and filter available regions
    const availableRegions = latencyTests
        .filter(test => test.available)
        .sort((a, b) => a.latency - b.latency);

    return availableRegions[0]?.region || 'us-east-1';
}

// Export configuration
module.exports = {
    AWS_CONFIG,
    AWS_REGIONS,
    getNearestRegion
};