// P2P Transfer Service for VFT Desktop Client
// Handles direct peer-to-peer data transfers for AI workloads
const WebTorrent = require('webtorrent');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const Store = require('electron-store');
const winston = require('winston');
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
            filename: path.join(app.getPath('userData'), 'p2p-transfer.log'),
            maxsize: 10485760, // 10MB
            maxFiles: 5
        })
    ]
});

class P2PTransferService extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.store = new Store();
        this.activeTransfers = new Map();
        this.peerConnections = new Map();
        this.downloadPath = path.join(app.getPath('userData'), 'p2p-downloads');
        this.uploadBandwidthLimit = 10 * 1024 * 1024; // 10 MB/s default
        this.downloadBandwidthLimit = 50 * 1024 * 1024; // 50 MB/s default
    }

    async initialize() {
        try {
            // Create download directory
            if (!fs.existsSync(this.downloadPath)) {
                fs.mkdirSync(this.downloadPath, { recursive: true });
            }

            // Initialize WebTorrent client with optimizations for large files
            this.client = new WebTorrent({
                maxConns: 100,
                nodeId: this.generateNodeId(),
                webSeeds: true,
                dht: true,
                lsd: true,
                tracker: {
                    announce: [
                        'wss://tracker.vftchain.com',
                        'wss://tracker.openwebtorrent.com',
                        'wss://tracker.btorrent.xyz'
                    ]
                },
                uploadLimit: this.uploadBandwidthLimit,
                downloadLimit: this.downloadBandwidthLimit
            });

            this.setupEventHandlers();
            logger.info('P2P Transfer Service initialized');

            // Connect to VFT tracker for peer discovery
            await this.connectToVFTTracker();

            return true;
        } catch (error) {
            logger.error('Failed to initialize P2P service:', error);
            throw error;
        }
    }

    async connectToVFTTracker() {
        try {
            // Connect to VFT's private tracker for better peer discovery
            const response = await fetch('https://api.vftchain.com/p2p/announce', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.store.get('authToken')}`
                },
                body: JSON.stringify({
                    nodeId: this.client.nodeId,
                    platform: process.platform,
                    version: app.getVersion()
                })
            });

            if (response.ok) {
                const data = await response.json();
                logger.info('Connected to VFT tracker', { peers: data.peers });
                this.emit('tracker-connected', data);
            }
        } catch (error) {
            logger.error('Failed to connect to VFT tracker:', error);
        }
    }

    setupEventHandlers() {
        this.client.on('error', (err) => {
            logger.error('WebTorrent error:', err);
            this.emit('error', err);
        });

        this.client.on('torrent', (torrent) => {
            logger.info('Torrent ready:', {
                infoHash: torrent.infoHash,
                name: torrent.name,
                size: torrent.length
            });
            this.emit('torrent-ready', torrent);
        });
    }

    // Create a torrent for large file/dataset upload
    async createTorrent(filePath, metadata = {}) {
        return new Promise((resolve, reject) => {
            const torrentId = crypto.randomBytes(16).toString('hex');
            
            // Torrent options optimized for large files
            const opts = {
                name: path.basename(filePath),
                comment: `VFT Dataset - ${metadata.jobId || 'direct-transfer'}`,
                createdBy: 'VFT Desktop Client',
                private: false,
                pieceLength: 2 * 1024 * 1024, // 2MB pieces for large files
                announceList: [
                    ['wss://tracker.vftchain.com'],
                    ['wss://tracker.openwebtorrent.com']
                ],
                urlList: metadata.webSeeds || []
            };

            this.client.seed(filePath, opts, (torrent) => {
                const transfer = {
                    id: torrentId,
                    type: 'upload',
                    torrent: torrent,
                    metadata: metadata,
                    startTime: Date.now(),
                    progress: 0,
                    speed: 0,
                    peers: 0
                };

                this.activeTransfers.set(torrentId, transfer);
                this.monitorTransfer(torrentId);

                // Create magnet URI for sharing
                const magnetURI = torrent.magnetURI;

                // Register with VFT tracker
                this.registerTorrentWithTracker(torrent, metadata);

                resolve({
                    transferId: torrentId,
                    magnetURI: magnetURI,
                    infoHash: torrent.infoHash,
                    size: torrent.length,
                    pieces: torrent.pieces.length
                });
            });
        });
    }

    // Download using magnet URI or info hash
    async downloadTorrent(magnetURI, metadata = {}) {
        return new Promise((resolve, reject) => {
            const torrentId = crypto.randomBytes(16).toString('hex');
            
            const opts = {
                path: this.downloadPath,
                maxWebConns: 5,
                strategy: 'sequential' // Better for large files
            };

            const torrent = this.client.add(magnetURI, opts, (torrent) => {
                const transfer = {
                    id: torrentId,
                    type: 'download',
                    torrent: torrent,
                    metadata: metadata,
                    startTime: Date.now(),
                    progress: 0,
                    speed: 0,
                    peers: 0
                };

                this.activeTransfers.set(torrentId, transfer);
                this.monitorTransfer(torrentId);

                resolve({
                    transferId: torrentId,
                    name: torrent.name,
                    size: torrent.length,
                    savePath: path.join(this.downloadPath, torrent.name)
                });
            });

            torrent.on('error', reject);
        });
    }

    // Monitor transfer progress
    monitorTransfer(transferId) {
        const transfer = this.activeTransfers.get(transferId);
        if (!transfer) return;

        const interval = setInterval(() => {
            const torrent = transfer.torrent;
            
            if (!torrent || torrent.destroyed) {
                clearInterval(interval);
                this.activeTransfers.delete(transferId);
                return;
            }

            const progress = Math.round(torrent.progress * 100);
            const speed = torrent.downloadSpeed || torrent.uploadSpeed;
            const peers = torrent.numPeers;
            
            transfer.progress = progress;
            transfer.speed = speed;
            transfer.peers = peers;

            this.emit('transfer-progress', {
                transferId,
                type: transfer.type,
                progress,
                speed,
                peers,
                downloaded: torrent.downloaded,
                uploaded: torrent.uploaded,
                remaining: torrent.length - torrent.downloaded,
                timeRemaining: torrent.timeRemaining
            });

            // Check if complete
            if (progress === 100 && transfer.type === 'download') {
                this.emit('transfer-complete', {
                    transferId,
                    type: transfer.type,
                    duration: Date.now() - transfer.startTime,
                    path: path.join(this.downloadPath, torrent.name)
                });
                
                // Continue seeding for a while to help network
                setTimeout(() => {
                    this.stopTransfer(transferId);
                }, 300000); // 5 minutes
            }

        }, 1000); // Update every second
    }

    // Direct peer connection for ultra-fast transfers
    async createDirectConnection(peerId, files) {
        try {
            // Use WebRTC for direct peer connection
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.vftchain.com:3478' },
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            });

            // Create data channel for file transfer
            const dataChannel = pc.createDataChannel('fileTransfer', {
                ordered: true,
                maxPacketLifeTime: 3000
            });

            this.peerConnections.set(peerId, {
                connection: pc,
                dataChannel: dataChannel,
                files: files
            });

            // Handle data channel events
            dataChannel.onopen = () => {
                logger.info(`Direct connection established with ${peerId}`);
                this.emit('peer-connected', peerId);
            };

            dataChannel.onmessage = (event) => {
                this.handleDirectTransferData(peerId, event.data);
            };

            return await this.negotiateConnection(peerId, pc);
        } catch (error) {
            logger.error('Failed to create direct connection:', error);
            throw error;
        }
    }

    // Register torrent with VFT tracker for better discovery
    async registerTorrentWithTracker(torrent, metadata) {
        try {
            await fetch('https://api.vftchain.com/p2p/register-torrent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.store.get('authToken')}`
                },
                body: JSON.stringify({
                    infoHash: torrent.infoHash,
                    magnetURI: torrent.magnetURI,
                    name: torrent.name,
                    size: torrent.length,
                    metadata: metadata,
                    nodeId: this.client.nodeId
                })
            });
        } catch (error) {
            logger.error('Failed to register torrent:', error);
        }
    }

    // Stop a transfer
    async stopTransfer(transferId) {
        const transfer = this.activeTransfers.get(transferId);
        if (!transfer) return;

        transfer.torrent.destroy();
        this.activeTransfers.delete(transferId);
        
        logger.info(`Transfer ${transferId} stopped`);
        this.emit('transfer-stopped', transferId);
    }

    // Get transfer statistics
    getTransferStats(transferId) {
        const transfer = this.activeTransfers.get(transferId);
        if (!transfer) return null;

        const torrent = transfer.torrent;
        return {
            transferId,
            type: transfer.type,
            name: torrent.name,
            size: torrent.length,
            progress: torrent.progress,
            downloaded: torrent.downloaded,
            uploaded: torrent.uploaded,
            downloadSpeed: torrent.downloadSpeed,
            uploadSpeed: torrent.uploadSpeed,
            peers: torrent.numPeers,
            ratio: torrent.ratio,
            timeRemaining: torrent.timeRemaining
        };
    }

    // Set bandwidth limits
    setBandwidthLimits(uploadLimit, downloadLimit) {
        this.uploadBandwidthLimit = uploadLimit;
        this.downloadBandwidthLimit = downloadLimit;
        
        if (this.client) {
            this.client.throttleUpload(uploadLimit);
            this.client.throttleDownload(downloadLimit);
        }
        
        logger.info(`Bandwidth limits set - Upload: ${uploadLimit}, Download: ${downloadLimit}`);
    }

    // Clean up old downloads
    async cleanupDownloads(olderThanDays = 7) {
        const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
        const files = fs.readdirSync(this.downloadPath);
        
        for (const file of files) {
            const filePath = path.join(this.downloadPath, file);
            const stats = fs.statSync(filePath);
            
            if (stats.mtimeMs < cutoffTime) {
                fs.unlinkSync(filePath);
                logger.info(`Cleaned up old file: ${file}`);
            }
        }
    }

    generateNodeId() {
        return crypto.randomBytes(20).toString('hex');
    }

    destroy() {
        if (this.client) {
            this.client.destroy();
        }
        this.activeTransfers.clear();
        this.peerConnections.clear();
        this.removeAllListeners();
    }
}

module.exports = new P2PTransferService();