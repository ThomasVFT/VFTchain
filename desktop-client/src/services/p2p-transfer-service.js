// P2P Transfer Service for Direct Data Exchange
// Handles WebRTC connections for peer-to-peer file transfers

const EventEmitter = require('events');
const crypto = require('crypto');

class P2PTransferService extends EventEmitter {
    constructor() {
        super();
        this.peers = new Map();
        this.transfers = new Map();
        this.signalServer = null;
        this.localPeerId = crypto.randomUUID();
        
        // WebRTC configuration
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
        
        // Transfer chunk size (64KB)
        this.CHUNK_SIZE = 64 * 1024;
    }

    async initialize(signalServerUrl) {
        console.log('[P2P] Initializing P2P transfer service...');
        
        // Connect to signaling server (AWS WebSocket for peer discovery only)
        this.signalServer = new WebSocket(signalServerUrl);
        
        this.signalServer.onopen = () => {
            console.log('[P2P] Connected to signal server');
            this.register();
        };
        
        this.signalServer.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            await this.handleSignalMessage(message);
        };
        
        this.signalServer.onerror = (error) => {
            console.error('[P2P] Signal server error:', error);
        };
    }

    register() {
        // Register with signal server (only peer ID, no data)
        this.sendSignal({
            type: 'register',
            peerId: this.localPeerId,
            capabilities: {
                webrtc: true,
                maxConnections: 10,
                protocols: ['vft-transfer/1.0']
            }
        });
    }

    async connectToPeer(remotePeerId) {
        console.log(`[P2P] Connecting to peer: ${remotePeerId}`);
        
        const connection = new RTCPeerConnection(this.rtcConfig);
        const dataChannel = connection.createDataChannel('vft-data', {
            ordered: true,
            maxRetransmits: 3
        });
        
        // Set up connection handlers
        this.setupConnection(connection, remotePeerId);
        this.setupDataChannel(dataChannel, remotePeerId);
        
        // Create offer
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        
        // Send offer through signal server
        this.sendSignal({
            type: 'offer',
            from: this.localPeerId,
            to: remotePeerId,
            offer: offer
        });
        
        // Store connection
        this.peers.set(remotePeerId, {
            connection,
            dataChannel,
            state: 'connecting'
        });
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 30000);
            
            dataChannel.onopen = () => {
                clearTimeout(timeout);
                console.log(`[P2P] Connected to ${remotePeerId}`);
                resolve(dataChannel);
            };
            
            dataChannel.onerror = (error) => {
                clearTimeout(timeout);
                reject(error);
            };
        });
    }

    async handleSignalMessage(message) {
        switch (message.type) {
            case 'offer':
                await this.handleOffer(message);
                break;
            case 'answer':
                await this.handleAnswer(message);
                break;
            case 'ice-candidate':
                await this.handleIceCandidate(message);
                break;
            case 'peer-list':
                this.emit('peer-list', message.peers);
                break;
        }
    }

    async handleOffer(message) {
        console.log(`[P2P] Received offer from ${message.from}`);
        
        const connection = new RTCPeerConnection(this.rtcConfig);
        this.setupConnection(connection, message.from);
        
        // Set remote description
        await connection.setRemoteDescription(message.offer);
        
        // Create answer
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        
        // Send answer
        this.sendSignal({
            type: 'answer',
            from: this.localPeerId,
            to: message.from,
            answer: answer
        });
        
        // Handle incoming data channel
        connection.ondatachannel = (event) => {
            const dataChannel = event.channel;
            this.setupDataChannel(dataChannel, message.from);
            
            this.peers.set(message.from, {
                connection,
                dataChannel,
                state: 'connected'
            });
        };
    }

    async handleAnswer(message) {
        const peer = this.peers.get(message.from);
        if (peer) {
            await peer.connection.setRemoteDescription(message.answer);
        }
    }

    async handleIceCandidate(message) {
        const peer = this.peers.get(message.from);
        if (peer) {
            await peer.connection.addIceCandidate(message.candidate);
        }
    }

    setupConnection(connection, peerId) {
        connection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    type: 'ice-candidate',
                    from: this.localPeerId,
                    to: peerId,
                    candidate: event.candidate
                });
            }
        };
        
        connection.onconnectionstatechange = () => {
            console.log(`[P2P] Connection state: ${connection.connectionState}`);
        };
    }

    setupDataChannel(dataChannel, peerId) {
        const chunks = new Map();
        
        dataChannel.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'file-metadata':
                    this.handleFileMetadata(data, peerId);
                    break;
                case 'file-chunk':
                    this.handleFileChunk(data, peerId, chunks);
                    break;
                case 'transfer-complete':
                    this.handleTransferComplete(data, peerId, chunks);
                    break;
                case 'request-file':
                    await this.handleFileRequest(data, peerId);
                    break;
            }
        };
        
        dataChannel.onerror = (error) => {
            console.error(`[P2P] Data channel error with ${peerId}:`, error);
        };
        
        dataChannel.onclose = () => {
            console.log(`[P2P] Data channel closed with ${peerId}`);
            this.peers.delete(peerId);
        };
    }

    async sendFile(peerId, file, metadata = {}) {
        const peer = this.peers.get(peerId);
        if (!peer || peer.state !== 'connected') {
            throw new Error('Peer not connected');
        }
        
        const transferId = crypto.randomUUID();
        const fileBuffer = Buffer.isBuffer(file) ? file : await this.readFile(file);
        const totalChunks = Math.ceil(fileBuffer.length / this.CHUNK_SIZE);
        
        console.log(`[P2P] Sending file to ${peerId}:`, {
            size: fileBuffer.length,
            chunks: totalChunks,
            transferId
        });
        
        // Send metadata
        peer.dataChannel.send(JSON.stringify({
            type: 'file-metadata',
            transferId,
            fileName: metadata.fileName || 'data',
            fileSize: fileBuffer.length,
            totalChunks,
            checksum: crypto.createHash('sha256').update(fileBuffer).digest('hex'),
            ...metadata
        }));
        
        // Send chunks
        let chunkIndex = 0;
        for (let offset = 0; offset < fileBuffer.length; offset += this.CHUNK_SIZE) {
            const chunk = fileBuffer.slice(offset, offset + this.CHUNK_SIZE);
            
            peer.dataChannel.send(JSON.stringify({
                type: 'file-chunk',
                transferId,
                chunkIndex,
                data: chunk.toString('base64'),
                checksum: crypto.createHash('md5').update(chunk).digest('hex')
            }));
            
            chunkIndex++;
            
            // Emit progress
            this.emit('send-progress', {
                transferId,
                peerId,
                progress: (chunkIndex / totalChunks) * 100
            });
            
            // Small delay to avoid overwhelming the channel
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        // Send completion
        peer.dataChannel.send(JSON.stringify({
            type: 'transfer-complete',
            transferId
        }));
        
        return transferId;
    }

    async requestFile(peerId, ipfsHash) {
        const peer = this.peers.get(peerId);
        if (!peer || peer.state !== 'connected') {
            throw new Error('Peer not connected');
        }
        
        const requestId = crypto.randomUUID();
        
        peer.dataChannel.send(JSON.stringify({
            type: 'request-file',
            requestId,
            ipfsHash
        }));
        
        return new Promise((resolve, reject) => {
            this.once(`file-received-${requestId}`, resolve);
            this.once(`file-error-${requestId}`, reject);
            
            setTimeout(() => {
                reject(new Error('File request timeout'));
            }, 60000); // 60 second timeout
        });
    }

    handleFileMetadata(data, peerId) {
        console.log(`[P2P] Receiving file from ${peerId}:`, {
            fileName: data.fileName,
            fileSize: data.fileSize,
            chunks: data.totalChunks
        });
        
        this.transfers.set(data.transferId, {
            metadata: data,
            chunks: new Map(),
            startTime: Date.now()
        });
        
        this.emit('incoming-transfer', {
            transferId: data.transferId,
            peerId,
            metadata: data
        });
    }

    handleFileChunk(data, peerId, chunks) {
        const transfer = this.transfers.get(data.transferId);
        if (!transfer) return;
        
        // Verify chunk
        const chunkBuffer = Buffer.from(data.data, 'base64');
        const checksum = crypto.createHash('md5').update(chunkBuffer).digest('hex');
        
        if (checksum !== data.checksum) {
            console.error(`[P2P] Chunk checksum mismatch for ${data.chunkIndex}`);
            return;
        }
        
        transfer.chunks.set(data.chunkIndex, chunkBuffer);
        
        // Emit progress
        const progress = (transfer.chunks.size / transfer.metadata.totalChunks) * 100;
        this.emit('receive-progress', {
            transferId: data.transferId,
            peerId,
            progress
        });
    }

    handleTransferComplete(data, peerId, chunks) {
        const transfer = this.transfers.get(data.transferId);
        if (!transfer) return;
        
        // Reconstruct file
        const fileChunks = [];
        for (let i = 0; i < transfer.metadata.totalChunks; i++) {
            const chunk = transfer.chunks.get(i);
            if (!chunk) {
                console.error(`[P2P] Missing chunk ${i}`);
                return;
            }
            fileChunks.push(chunk);
        }
        
        const fileBuffer = Buffer.concat(fileChunks);
        const fileChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        
        if (fileChecksum !== transfer.metadata.checksum) {
            console.error('[P2P] File checksum mismatch');
            return;
        }
        
        const transferTime = Date.now() - transfer.startTime;
        console.log(`[P2P] Transfer complete:`, {
            fileName: transfer.metadata.fileName,
            fileSize: fileBuffer.length,
            transferTime: `${(transferTime / 1000).toFixed(2)}s`,
            speed: `${(fileBuffer.length / transferTime * 1000 / 1024 / 1024).toFixed(2)} MB/s`
        });
        
        this.emit('transfer-complete', {
            transferId: data.transferId,
            peerId,
            file: fileBuffer,
            metadata: transfer.metadata
        });
        
        // Cleanup
        this.transfers.delete(data.transferId);
    }

    async handleFileRequest(data, peerId) {
        // This would integrate with IPFS service to retrieve and send requested file
        console.log(`[P2P] File requested by ${peerId}: ${data.ipfsHash}`);
        
        try {
            // Retrieve from IPFS
            const file = await this.ipfsService.retrieveFile(data.ipfsHash);
            
            // Send file back to requester
            await this.sendFile(peerId, file, {
                requestId: data.requestId,
                ipfsHash: data.ipfsHash
            });
        } catch (error) {
            console.error('[P2P] Failed to handle file request:', error);
            
            const peer = this.peers.get(peerId);
            if (peer) {
                peer.dataChannel.send(JSON.stringify({
                    type: 'file-error',
                    requestId: data.requestId,
                    error: error.message
                }));
            }
        }
    }

    sendSignal(message) {
        if (this.signalServer && this.signalServer.readyState === WebSocket.OPEN) {
            this.signalServer.send(JSON.stringify(message));
        }
    }

    async readFile(filePath) {
        const fs = require('fs').promises;
        return await fs.readFile(filePath);
    }

    getConnectedPeers() {
        return Array.from(this.peers.entries())
            .filter(([_, peer]) => peer.state === 'connected')
            .map(([peerId, _]) => peerId);
    }

    disconnect() {
        // Close all peer connections
        for (const [peerId, peer] of this.peers) {
            peer.dataChannel.close();
            peer.connection.close();
        }
        this.peers.clear();
        
        // Close signal server
        if (this.signalServer) {
            this.signalServer.close();
        }
    }
}

module.exports = P2PTransferService;