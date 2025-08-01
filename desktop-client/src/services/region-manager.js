// Region Manager for Multi-Region Support and Failover
const { AWS_REGIONS, AWS_CONFIG } = require('../config/aws-config');
const EventEmitter = require('events');
const Store = require('electron-store');
const winston = require('winston');
const path = require('path');
const { app } = require('electron');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: path.join(app.getPath('userData'), 'region-manager.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 3
        })
    ]
});

class RegionManager extends EventEmitter {
    constructor() {
        super();
        this.store = new Store();
        this.currentRegion = null;
        this.regionHealth = new Map();
        this.healthCheckInterval = null;
        this.latencyHistory = new Map();
        this.failoverInProgress = false;
    }

    async initialize() {
        try {
            // Get stored preferred region or detect best region
            const preferredRegion = this.store.get('preferredRegion');
            
            if (preferredRegion && AWS_REGIONS[preferredRegion]) {
                // Verify preferred region is available
                const isAvailable = await this.checkRegionHealth(preferredRegion);
                if (isAvailable) {
                    this.currentRegion = preferredRegion;
                } else {
                    logger.warn(`Preferred region ${preferredRegion} unavailable, finding alternative`);
                    this.currentRegion = await this.findBestRegion();
                }
            } else {
                this.currentRegion = await this.findBestRegion();
            }

            logger.info(`Initialized with region: ${this.currentRegion}`);
            this.emit('region-selected', this.currentRegion);

            // Start health monitoring
            if (AWS_CONFIG.failover.enabled) {
                this.startHealthMonitoring();
            }

            return this.currentRegion;
        } catch (error) {
            logger.error('Failed to initialize region manager:', error);
            // Fallback to default region
            this.currentRegion = 'us-east-1';
            return this.currentRegion;
        }
    }

    async findBestRegion() {
        logger.info('Finding best region based on latency...');
        
        const latencyTests = await Promise.all(
            Object.entries(AWS_REGIONS).map(async ([region, config]) => {
                const latency = await this.measureLatency(region, config);
                return { region, latency, config };
            })
        );

        // Filter available regions and sort by latency
        const availableRegions = latencyTests
            .filter(test => test.latency < Infinity)
            .sort((a, b) => a.latency - b.latency);

        if (availableRegions.length === 0) {
            throw new Error('No available regions found');
        }

        const bestRegion = availableRegions[0];
        logger.info(`Best region found: ${bestRegion.region} (${bestRegion.latency}ms)`);

        // Store latency results
        availableRegions.forEach(({ region, latency }) => {
            this.updateLatencyHistory(region, latency);
        });

        return bestRegion.region;
    }

    async measureLatency(region, config) {
        const maxAttempts = 3;
        let totalLatency = 0;
        let successfulAttempts = 0;

        for (let i = 0; i < maxAttempts; i++) {
            const start = Date.now();
            try {
                const response = await fetch(`${config.endpoint}/health`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(5000)
                });

                if (response.ok) {
                    const latency = Date.now() - start;
                    totalLatency += latency;
                    successfulAttempts++;
                }
            } catch (error) {
                logger.debug(`Latency test failed for ${region}: ${error.message}`);
            }

            // Small delay between attempts
            if (i < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        if (successfulAttempts === 0) {
            return Infinity;
        }

        return Math.round(totalLatency / successfulAttempts);
    }

    async checkRegionHealth(region) {
        try {
            const config = AWS_REGIONS[region];
            if (!config) return false;

            const healthChecks = await Promise.all([
                // Check API endpoint
                fetch(`${config.endpoint}/health`, { 
                    method: 'GET',
                    signal: AbortSignal.timeout(10000)
                }),
                // Check WebSocket endpoint
                new Promise((resolve, reject) => {
                    const ws = new WebSocket(config.wsEndpoint);
                    const timeout = setTimeout(() => {
                        ws.close();
                        reject(new Error('WebSocket timeout'));
                    }, 10000);

                    ws.on('open', () => {
                        clearTimeout(timeout);
                        ws.close();
                        resolve(true);
                    });

                    ws.on('error', (err) => {
                        clearTimeout(timeout);
                        reject(err);
                    });
                })
            ]);

            const apiHealthy = healthChecks[0].ok;
            this.regionHealth.set(region, {
                healthy: apiHealthy,
                lastCheck: new Date(),
                latency: await this.measureLatency(region, config)
            });

            return apiHealthy;
        } catch (error) {
            logger.error(`Health check failed for region ${region}:`, error);
            this.regionHealth.set(region, {
                healthy: false,
                lastCheck: new Date(),
                error: error.message
            });
            return false;
        }
    }

    startHealthMonitoring() {
        logger.info('Starting health monitoring...');
        
        // Initial health check for all regions
        this.checkAllRegions();

        // Schedule periodic health checks
        this.healthCheckInterval = setInterval(() => {
            this.checkAllRegions();
        }, AWS_CONFIG.failover.healthCheckInterval);
    }

    async checkAllRegions() {
        logger.debug('Running health check for all regions...');
        
        const healthPromises = Object.keys(AWS_REGIONS).map(region => 
            this.checkRegionHealth(region)
        );

        await Promise.allSettled(healthPromises);

        // Check if current region is still healthy
        const currentRegionHealth = this.regionHealth.get(this.currentRegion);
        if (currentRegionHealth && !currentRegionHealth.healthy && !this.failoverInProgress) {
            logger.warn(`Current region ${this.currentRegion} is unhealthy, initiating failover`);
            this.initiateFailover();
        }

        // Emit health status
        this.emit('health-status', Array.from(this.regionHealth.entries()));
    }

    async initiateFailover() {
        if (this.failoverInProgress) {
            logger.warn('Failover already in progress');
            return;
        }

        this.failoverInProgress = true;
        this.emit('failover-started', this.currentRegion);

        try {
            logger.info(`Initiating failover from ${this.currentRegion}`);
            
            // Find healthy regions sorted by latency
            const healthyRegions = Array.from(this.regionHealth.entries())
                .filter(([region, health]) => health.healthy && region !== this.currentRegion)
                .sort((a, b) => (a[1].latency || Infinity) - (b[1].latency || Infinity));

            if (healthyRegions.length === 0) {
                throw new Error('No healthy regions available for failover');
            }

            const targetRegion = healthyRegions[0][0];
            logger.info(`Failing over to region: ${targetRegion}`);

            // Update current region
            const previousRegion = this.currentRegion;
            this.currentRegion = targetRegion;
            
            // Emit failover event
            this.emit('failover-completed', {
                from: previousRegion,
                to: targetRegion,
                reason: 'health-check-failure'
            });

            // Update stored preference temporarily
            this.store.set('temporaryRegion', targetRegion);
            
            logger.info(`Failover completed to ${targetRegion}`);
        } catch (error) {
            logger.error('Failover failed:', error);
            this.emit('failover-failed', error);
        } finally {
            this.failoverInProgress = false;
        }
    }

    updateLatencyHistory(region, latency) {
        if (!this.latencyHistory.has(region)) {
            this.latencyHistory.set(region, []);
        }

        const history = this.latencyHistory.get(region);
        history.push({
            timestamp: Date.now(),
            latency
        });

        // Keep only last 100 entries
        if (history.length > 100) {
            history.shift();
        }
    }

    getAverageLatency(region) {
        const history = this.latencyHistory.get(region);
        if (!history || history.length === 0) return null;

        const recentEntries = history.slice(-10); // Last 10 entries
        const sum = recentEntries.reduce((acc, entry) => acc + entry.latency, 0);
        return Math.round(sum / recentEntries.length);
    }

    setPreferredRegion(region) {
        if (!AWS_REGIONS[region]) {
            throw new Error(`Invalid region: ${region}`);
        }

        this.store.set('preferredRegion', region);
        logger.info(`Preferred region set to: ${region}`);
    }

    getCurrentRegion() {
        return this.currentRegion;
    }

    getRegionConfig() {
        return AWS_REGIONS[this.currentRegion];
    }

    getAllRegions() {
        return Object.entries(AWS_REGIONS).map(([key, config]) => ({
            id: key,
            name: config.name,
            endpoint: config.endpoint,
            health: this.regionHealth.get(key),
            averageLatency: this.getAverageLatency(key),
            current: key === this.currentRegion
        }));
    }

    destroy() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        this.removeAllListeners();
    }
}

module.exports = new RegionManager();