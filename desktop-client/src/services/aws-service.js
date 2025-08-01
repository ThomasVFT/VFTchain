// AWS Service Integration for VFT Desktop Client
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { AWS_CONFIG, AWS_REGIONS, getNearestRegion } = require('../config/aws-config');
const Store = require('electron-store');

class AWSService {
    constructor() {
        this.store = new Store();
        this.currentRegion = null;
        this.credentials = null;
        this.clients = {};
        this.initialized = false;
    }

    async initialize() {
        try {
            // Get nearest region
            this.currentRegion = await getNearestRegion();
            console.log(`Selected AWS region: ${this.currentRegion}`);

            // Initialize temporary credentials
            await this.refreshCredentials();

            // Initialize AWS clients
            this.initializeClients();

            this.initialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize AWS service:', error);
            throw error;
        }
    }

    async refreshCredentials() {
        try {
            // Get stored auth token
            const authToken = this.store.get('authToken');
            if (!authToken) {
                throw new Error('No authentication token found');
            }

            // Exchange token for temporary AWS credentials
            const response = await fetch(`${AWS_CONFIG.apiGateway.baseUrl}/auth/aws-credentials`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    region: this.currentRegion
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get AWS credentials');
            }

            const data = await response.json();
            this.credentials = {
                accessKeyId: data.AccessKeyId,
                secretAccessKey: data.SecretAccessKey,
                sessionToken: data.SessionToken,
                expiration: new Date(data.Expiration)
            };

            // Schedule credential refresh before expiration
            const refreshTime = this.credentials.expiration.getTime() - Date.now() - 300000; // 5 minutes before expiration
            setTimeout(() => this.refreshCredentials(), refreshTime);

        } catch (error) {
            console.error('Failed to refresh AWS credentials:', error);
            throw error;
        }
    }

    initializeClients() {
        const clientConfig = {
            region: this.currentRegion,
            credentials: {
                accessKeyId: this.credentials.accessKeyId,
                secretAccessKey: this.credentials.secretAccessKey,
                sessionToken: this.credentials.sessionToken
            }
        };

        this.clients = {
            s3: new S3Client(clientConfig),
            dynamodb: new DynamoDBClient(clientConfig),
            cloudwatch: new CloudWatchClient(clientConfig),
            cognito: new CognitoIdentityProviderClient(clientConfig),
            sts: new STSClient(clientConfig)
        };
    }

    // S3 Operations
    async uploadToS3(bucket, key, data, metadata = {}) {
        try {
            const command = new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: data,
                Metadata: metadata,
                ServerSideEncryption: 'AES256'
            });

            const response = await this.clients.s3.send(command);
            return response;
        } catch (error) {
            console.error('S3 upload error:', error);
            throw error;
        }
    }

    async downloadFromS3(bucket, key) {
        try {
            const command = new GetObjectCommand({
                Bucket: bucket,
                Key: key
            });

            const response = await this.clients.s3.send(command);
            return response.Body;
        } catch (error) {
            console.error('S3 download error:', error);
            throw error;
        }
    }

    // DynamoDB Operations
    async putItem(tableName, item) {
        try {
            const command = new PutItemCommand({
                TableName: tableName,
                Item: item,
                ReturnValues: 'ALL_OLD'
            });

            const response = await this.clients.dynamodb.send(command);
            return response;
        } catch (error) {
            console.error('DynamoDB put error:', error);
            throw error;
        }
    }

    async getItem(tableName, key) {
        try {
            const command = new GetItemCommand({
                TableName: tableName,
                Key: key
            });

            const response = await this.clients.dynamodb.send(command);
            return response.Item;
        } catch (error) {
            console.error('DynamoDB get error:', error);
            throw error;
        }
    }

    // CloudWatch Metrics
    async putMetric(metricName, value, unit = 'Count', dimensions = []) {
        try {
            const command = new PutMetricDataCommand({
                Namespace: AWS_CONFIG.cloudwatch.namespace,
                MetricData: [{
                    MetricName: metricName,
                    Value: value,
                    Unit: unit,
                    Timestamp: new Date(),
                    Dimensions: dimensions
                }]
            });

            await this.clients.cloudwatch.send(command);
        } catch (error) {
            console.error('CloudWatch metric error:', error);
            // Don't throw - metrics are non-critical
        }
    }

    // Regional Failover
    async handleRegionalFailover() {
        console.log('Attempting regional failover...');
        
        for (const region of AWS_CONFIG.failover.fallbackRegions) {
            if (region === this.currentRegion) continue;
            
            try {
                // Test region availability
                const response = await fetch(`${AWS_REGIONS[region].endpoint}/health`, {
                    timeout: 5000
                });

                if (response.ok) {
                    console.log(`Failing over to region: ${region}`);
                    this.currentRegion = region;
                    await this.refreshCredentials();
                    this.initializeClients();
                    return true;
                }
            } catch (error) {
                console.error(`Region ${region} unavailable:`, error.message);
            }
        }

        throw new Error('All regions unavailable');
    }

    // Telemetry
    async sendTelemetry(eventType, eventData) {
        try {
            const telemetryData = {
                eventType,
                eventData,
                timestamp: new Date().toISOString(),
                clientVersion: require('../../package.json').version,
                region: this.currentRegion,
                platform: process.platform,
                arch: process.arch
            };

            await this.putItem(AWS_CONFIG.dynamodb.tables.userSessions, {
                userId: { S: this.store.get('userId') || 'anonymous' },
                timestamp: { N: Date.now().toString() },
                telemetryData: { S: JSON.stringify(telemetryData) }
            });

            await this.putMetric(`Event_${eventType}`, 1, 'Count', [
                { Name: 'Region', Value: this.currentRegion },
                { Name: 'Platform', Value: process.platform }
            ]);
        } catch (error) {
            console.error('Telemetry error:', error);
            // Don't throw - telemetry is non-critical
        }
    }
}

module.exports = new AWSService();