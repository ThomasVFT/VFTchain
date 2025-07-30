# VFT Platform - AI Mining & User Interfaces

Next-generation web interfaces for the VFT decentralized AI computing ecosystem with terabyte-scale processing capabilities.

## 🚀 Platforms Included

### AI Miner Platform (Port 8080)
- **Advanced GPU Mining Dashboard**: Monitor hardware performance and AI job earnings
- **Real-time Session Management**: Automatic heartbeat monitoring and job assignment
- **Terabyte Job Processing**: Handle massive AI datasets with distributed computing
- **VFT Token Rewards**: Track earnings from quantum-enhanced AI computations
- **Hardware Monitoring**: GPU utilization, temperature, and performance metrics
- **Cross-Chain Mining**: Support for multiple blockchain networks

### AI User Platform (Port 8090)  
- **Terabyte-Scale AI Jobs**: Submit massive datasets up to 1TB+ for processing
- **Multi-Upload System**: Drag/drop, torrent, and IPFS dataset integration
- **Quantum-Enhanced Computing**: Automatic quantum-classical hybrid processing
- **Wallet Integration**: Universal wallet support across multiple blockchains
- **Real-time Session Tracking**: Live monitoring with heartbeat connectivity
- **Flexible Delivery Options**: Results via cloud storage, email, IPFS, or direct download

## 🛠️ Quick Start

### Prerequisites
- Web server (nginx, Apache, or simple HTTP server)
- Modern web browser with JavaScript enabled

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/ThomasVFT/VFTchain.git
cd VFTchain
```

2. **Serve the platforms**
```bash
# Option 1: Using Python
cd miner-platform && python -m http.server 8080
cd user-platform && python -m http.server 8090

# Option 2: Using Docker
docker build -t vft-miner ./miner-platform
docker build -t vft-user ./user-platform
docker run -p 8080:80 vft-miner
docker run -p 8090:80 vft-user
```

3. **Access the platforms**
- **Miner Platform**: [http://localhost:8080](http://localhost:8080)
- **User Platform**: [http://localhost:8090](http://localhost:8090)

## 💻 Platform Features

### AI Miner Platform Features
- **Universal Wallet Connection**: Support for Solana, Ethereum, and multi-chain wallets
- **Advanced Hardware Registration**: Register GPU specifications for quantum-classical workloads
- **Intelligent Job Assignment**: AI-powered assignment of terabyte-scale computation tasks
- **Real-time Session Monitoring**: Heartbeat tracking and automatic reconnection
- **Enhanced Earnings Dashboard**: VFT token rewards from AI mining across chains
- **Dynamic Reputation System**: Build mining reputation for premium quantum-enhanced jobs
- **Job Completion Reporting**: Automated result submission to mining pool

### AI User Platform Features  
- **Terabyte Job Submission**: Create and submit massive AI computation jobs up to 1TB+
- **Advanced Upload System**: Multiple methods including chunked upload, torrent, and IPFS
- **Quantum-Classical Selection**: Automatic detection of quantum-suitable workloads
- **Comprehensive Budget Management**: Set VFT token budgets with dynamic pricing
- **Real-time Progress Tracking**: Live job monitoring with miner assignment details
- **Flexible Result Delivery**: Configure delivery to cloud storage, email, IPFS, or download
- **Session Management**: Persistent sessions with heartbeat monitoring
- **Cross-Chain Payment**: Pay with tokens from multiple blockchain networks

## 🔧 Technical Details

### Architecture
- **Frontend**: Modern HTML/CSS/JavaScript with Tailwind CSS and glass morphism design
- **API Integration**: RESTful API with comprehensive session management
- **Real-time Updates**: WebSocket connections with heartbeat monitoring
- **Multi-Chain Integration**: Support for Solana, Ethereum, and cross-chain operations
- **Quantum Integration**: Hybrid quantum-classical compute orchestration
- **Terabyte Processing**: Chunked upload system for massive datasets

### Enhanced API Endpoints
The platforms connect to the VFT Platform backend at `http://localhost:8000/api/v1/`:

**Core Endpoints:**
- `GET /platform/stats` - Real-time platform statistics (no hardcoded values)
- `POST /auth/wallet` - Multi-chain wallet authentication  
- `POST /jobs/terabyte` - Submit terabyte-scale AI computation jobs
- `GET /jobs` - List user jobs with real-time status
- `POST /miners` - Register mining hardware with capabilities
- `POST /storage/upload-chunk` - Chunked upload for large files

**Session Management:**
- `POST /users/session` - Register user session with heartbeat
- `POST /miners/session` - Register miner session with heartbeat
- `POST /users/session/{id}/heartbeat` - Maintain session connectivity
- `DELETE /users/session/{id}` - Clean session termination

**Advanced Features:**
- `POST /jobs/{id}/distribute-filecoin` - Distribute to Filecoin network
- `POST /jobs/{id}/stream-to-miners` - Stream jobs to mining pool
- `POST /jobs/{id}/complete` - Job completion reporting

### File Structure
```
VFTchain/
├── miner-platform/
│   ├── index.html          # Advanced AI miner dashboard
│   ├── miner-api.js        # Session management and job processing
│   └── Dockerfile          # Container configuration
├── user-platform/
│   ├── index.html          # Terabyte-scale job submission interface  
│   ├── user-api.js         # Comprehensive job management and uploads
│   ├── terabyte-upload.js  # Large file upload system
│   └── Dockerfile          # Container configuration
└── README.md               # This documentation
```

## 🎨 UI/UX Features

### Design Elements
- **Modern Glass Morphism**: Translucent panels with backdrop blur
- **Responsive Layout**: Mobile-friendly design with Tailwind CSS
- **Real-time Animations**: Smooth transitions and loading states
- **Professional Color Scheme**: Blue/purple gradient theme
- **Intuitive Navigation**: Clean, user-friendly interface design

### Interactive Components
- **Live Charts**: Real-time performance and earnings visualization
- **Modal Dialogs**: Job details and transaction confirmations
- **Form Validation**: Input validation with helpful error messages
- **Status Indicators**: Visual job status and system health indicators
- **Notification System**: Success/error notifications for user actions

## 🔗 Integration

### VFT Platform Backend
These interfaces integrate with the advanced VFT Platform infrastructure:
- **API Gateway**: FastAPI backend with session management and terabyte processing
- **PostgreSQL Database**: Comprehensive job, user, and miner data storage
- **Redis Cache**: Real-time session tracking and heartbeat monitoring
- **Multi-Chain Integration**: Solana, Ethereum, BSC, Polygon smart contracts
- **IPFS/Filecoin**: Decentralized storage for terabyte-scale AI datasets
- **Quantum Computing**: Integration with IBM, AWS Braket, Azure Quantum
- **Cross-Chain Bridge**: Universal token bridging and arbitrage systems

### Advanced Wallet Integration
- **Multi-Chain Support**: Phantom (Solana), MetaMask (Ethereum), and universal wallets
- **Cross-Chain Payments**: Automatic token bridging for seamless payments
- **Demo Mode**: Full-featured testing without wallet connection
- **Session Persistence**: Remembers connections with heartbeat monitoring
- **Auto-Reconnect**: Automatic reconnection on network interruptions

## 📱 Browser Compatibility

- **Chrome**: Full support (recommended)
- **Firefox**: Full support  
- **Safari**: Full support
- **Edge**: Full support
- **Mobile**: Responsive design for mobile browsers

## 🛡️ Security Features

- **Client-side Validation**: Input sanitization and validation
- **Secure API Communication**: HTTPS/WSS for production
- **Wallet Security**: Never stores private keys locally
- **CORS Protection**: Proper cross-origin request handling

## 📞 Support & Contact

- **GitHub Issues**: [Report bugs and feature requests](https://github.com/ThomasVFT/VFTchain/issues)
- **Documentation**: Complete API documentation in main VFT Platform repo
- **Email**: support@vftplatform.com

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Part of the VFT Platform ecosystem - Next-Generation Decentralized AI Computing Network**

*Advanced interfaces for quantum-enhanced AI mining and terabyte-scale computation*

## 🌟 What Makes This Different

- **Terabyte-Scale Processing**: Handle datasets up to 1TB+ with distributed computing
- **Quantum-Enhanced AI**: Automatic quantum-classical hybrid processing for exponential speedups
- **Real-Time Everything**: No hardcoded values - all metrics pulled from live system state
- **Universal Multi-Chain**: Seamless operation across 7+ blockchain networks
- **Self-Evolving Platform**: AI agents continuously optimize and improve the system
- **Professional Grade**: Production-ready with comprehensive session management and monitoring