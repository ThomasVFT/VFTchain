// Telemetry Service for VFT Desktop Client
const { app } = require('electron');
const os = require('os');
const si = require('systeminformation');
const Store = require('electron-store');
const winston = require('winston');
const path = require('path');
const awsService = require('./aws-service');
const { AWS_CONFIG } = require('../config/aws-config');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: path.join(app.getPath('userData'), 'telemetry.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 3
        })
    ]
});

class TelemetryService {
    constructor() {
        this.store = new Store();
        this.sessionId = null;
        this.userId = null;
        this.metrics = new Map();
        this.telemetryEnabled = true;
        this.batchInterval = null;
        this.metricsBuffer = [];
        this.systemInfo = null;
    }

    async initialize() {
        try {
            // Check if telemetry is enabled
            this.telemetryEnabled = this.store.get('telemetryEnabled', true);
            if (!this.telemetryEnabled) {
                logger.info('Telemetry is disabled by user preference');
                return;
            }

            // Generate session ID
            this.sessionId = this.generateSessionId();
            this.userId = this.store.get('userId', 'anonymous');

            // Collect system information
            await this.collectSystemInfo();

            // Send session start event
            await this.sendEvent('session_start', {
                version: app.getVersion(),
                platform: process.platform,
                arch: process.arch,
                systemInfo: this.systemInfo
            });

            // Start metrics collection
            this.startMetricsCollection();

            // Setup app event handlers
            this.setupEventHandlers();

            logger.info('Telemetry service initialized', {
                sessionId: this.sessionId,
                userId: this.userId
            });
        } catch (error) {
            logger.error('Failed to initialize telemetry:', error);
        }
    }

    async collectSystemInfo() {
        try {
            const [cpu, memory, graphics, osInfo] = await Promise.all([
                si.cpu(),
                si.mem(),
                si.graphics(),
                si.osInfo()
            ]);

            this.systemInfo = {
                cpu: {
                    manufacturer: cpu.manufacturer,
                    brand: cpu.brand,
                    cores: cpu.cores,
                    physicalCores: cpu.physicalCores,
                    speed: cpu.speed
                },
                memory: {
                    total: memory.total,
                    free: memory.free,
                    used: memory.used
                },
                graphics: graphics.controllers.map(gpu => ({
                    vendor: gpu.vendor,
                    model: gpu.model,
                    vram: gpu.vram,
                    driverVersion: gpu.driverVersion
                })),
                os: {
                    platform: osInfo.platform,
                    distro: osInfo.distro,
                    release: osInfo.release,
                    arch: osInfo.arch
                }
            };
        } catch (error) {
            logger.error('Failed to collect system info:', error);
            this.systemInfo = { error: error.message };
        }
    }

    setupEventHandlers() {
        // App lifecycle events
        app.on('window-all-closed', () => {
            this.sendEvent('app_closing');
        });

        app.on('before-quit', async (event) => {
            event.preventDefault();
            await this.shutdown();
            app.exit();
        });

        // GPU crash handler
        app.on('gpu-process-crashed', (event, killed) => {
            this.sendEvent('gpu_crash', { killed });
        });

        // Renderer crash handler
        app.on('render-process-gone', (event, webContents, details) => {
            this.sendEvent('renderer_crash', details);
        });
    }

    startMetricsCollection() {
        // Collect metrics every minute
        this.batchInterval = setInterval(() => {
            this.collectAndSendMetrics();
        }, AWS_CONFIG.cloudwatch.metricsInterval);

        // Initial collection
        this.collectAndSendMetrics();
    }

    async collectAndSendMetrics() {
        if (!this.telemetryEnabled || !awsService.initialized) return;

        try {
            // Collect current metrics
            const [cpuUsage, memoryInfo, gpuInfo] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.graphics()
            ]);

            const metrics = {
                cpu_usage: cpuUsage.currentLoad,
                memory_usage: (memoryInfo.used / memoryInfo.total) * 100,
                memory_available: memoryInfo.available,
                gpu_usage: gpuInfo.controllers[0]?.utilizationGpu || 0,
                gpu_memory: gpuInfo.controllers[0]?.memoryUsed || 0,
                gpu_temperature: gpuInfo.controllers[0]?.temperatureGpu || 0
            };

            // Send metrics to CloudWatch
            const timestamp = new Date();
            for (const [metric, value] of Object.entries(metrics)) {
                if (value !== null && value !== undefined) {
                    await awsService.putMetric(metric, value, 'Percent', [
                        { Name: 'SessionId', Value: this.sessionId },
                        { Name: 'Platform', Value: process.platform }
                    ]);
                }
            }

            // Store in buffer for batch upload
            this.metricsBuffer.push({
                timestamp: timestamp.toISOString(),
                metrics,
                sessionId: this.sessionId
            });

            // Upload batch if buffer is large enough
            if (this.metricsBuffer.length >= 10) {
                await this.uploadMetricsBatch();
            }

        } catch (error) {
            logger.error('Failed to collect metrics:', error);
        }
    }

    async uploadMetricsBatch() {
        if (this.metricsBuffer.length === 0) return;

        try {
            const batch = this.metricsBuffer.splice(0, this.metricsBuffer.length);
            
            // Upload to DynamoDB
            for (const metricData of batch) {
                await awsService.putItem(AWS_CONFIG.dynamodb.tables.minerStats, {
                    userId: { S: this.userId },
                    timestamp: { N: new Date(metricData.timestamp).getTime().toString() },
                    sessionId: { S: this.sessionId },
                    metrics: { S: JSON.stringify(metricData.metrics) }
                });
            }

            logger.info(`Uploaded ${batch.length} metrics to DynamoDB`);
        } catch (error) {
            logger.error('Failed to upload metrics batch:', error);
            // Re-add to buffer for retry
            this.metricsBuffer.unshift(...batch);
        }
    }

    async sendEvent(eventType, eventData = {}) {
        if (!this.telemetryEnabled) return;

        try {
            const event = {
                eventType,
                eventData,
                timestamp: new Date().toISOString(),
                sessionId: this.sessionId,
                userId: this.userId,
                version: app.getVersion(),
                platform: process.platform
            };

            // Send to AWS
            if (awsService.initialized) {
                await awsService.sendTelemetry(eventType, eventData);
            }

            // Log locally
            logger.info('Telemetry event sent', { eventType, eventData });

        } catch (error) {
            logger.error('Failed to send telemetry event:', error);
        }
    }

    trackError(error, context = {}) {
        this.sendEvent('error', {
            message: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString()
        });
    }

    trackPerformance(operation, duration, metadata = {}) {
        this.sendEvent('performance', {
            operation,
            duration,
            metadata,
            timestamp: new Date().toISOString()
        });
    }

    trackFeatureUsage(feature, metadata = {}) {
        this.sendEvent('feature_usage', {
            feature,
            metadata,
            timestamp: new Date().toISOString()
        });
    }

    setTelemetryEnabled(enabled) {
        this.telemetryEnabled = enabled;
        this.store.set('telemetryEnabled', enabled);
        
        if (!enabled) {
            // Stop metrics collection
            if (this.batchInterval) {
                clearInterval(this.batchInterval);
                this.batchInterval = null;
            }
            logger.info('Telemetry disabled by user');
        } else {
            // Restart metrics collection
            this.startMetricsCollection();
            logger.info('Telemetry enabled by user');
        }
    }

    generateSessionId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    async shutdown() {
        logger.info('Shutting down telemetry service');
        
        // Send session end event
        await this.sendEvent('session_end', {
            duration: Date.now() - parseInt(this.sessionId.split('-')[0])
        });

        // Upload remaining metrics
        await this.uploadMetricsBatch();

        // Clear interval
        if (this.batchInterval) {
            clearInterval(this.batchInterval);
        }
    }

    // Privacy-focused methods
    async exportUserData() {
        // Allow users to export their telemetry data
        const userData = {
            userId: this.userId,
            telemetryEnabled: this.telemetryEnabled,
            sessionHistory: this.store.get('sessionHistory', []),
            systemInfo: this.systemInfo
        };

        return userData;
    }

    async deleteUserData() {
        // Allow users to delete their telemetry data
        this.store.delete('sessionHistory');
        this.store.delete('userId');
        this.userId = 'anonymous';
        
        logger.info('User telemetry data deleted');
        return true;
    }
}

module.exports = new TelemetryService();