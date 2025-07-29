# VFT Platform - Miner & User Interfaces

Professional web interfaces for the VFT decentralized AI computing network.

## 🚀 Platforms Included

### Miner Platform (Port 8080)
- **GPU Mining Dashboard**: Monitor hardware performance and earnings
- **Real-time Job Assignment**: Automatic AI computation job allocation  
- **VFT Token Rewards**: Track earnings from useful AI work
- **Hardware Monitoring**: GPU utilization, temperature, and performance metrics

### User Platform (Port 8090)  
- **AI Job Submission**: Submit training and inference workloads
- **Wallet Integration**: Connect Solana wallet for payments
- **Real-time Monitoring**: Track job progress and completion
- **Cost Management**: Budget control and spending analytics

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

### Miner Platform Features
- **Wallet Connection**: Connect Solana wallet for mining rewards
- **Hardware Registration**: Register GPU specifications and capabilities
- **Job Assignment**: Automatic assignment of AI computation tasks
- **Performance Monitoring**: Real-time hardware utilization tracking
- **Earnings Dashboard**: VFT token rewards and payout history
- **Reputation System**: Build mining reputation for premium jobs

### User Platform Features  
- **Job Submission**: Create and submit AI computation jobs
- **Compute Selection**: Choose GPU, CPU, or storage compute types
- **Budget Management**: Set VFT token budgets and priority levels
- **Progress Tracking**: Monitor job status and completion in real-time
- **Results Download**: Access completed job results and outputs
- **Usage Analytics**: Track spending and platform usage statistics

## 🔧 Technical Details

### Architecture
- **Frontend**: Pure HTML/CSS/JavaScript with Tailwind CSS
- **API Integration**: RESTful API communication with VFT Platform backend
- **Real-time Updates**: WebSocket connections for live data
- **Wallet Integration**: Solana web3.js for blockchain interactions

### API Endpoints
The platforms connect to the VFT Platform backend at `http://localhost:8000/api/v1/`:

- `GET /platform/stats` - Platform statistics
- `POST /auth/wallet` - Wallet authentication  
- `POST /jobs` - Submit AI computation jobs
- `GET /jobs` - List user jobs
- `POST /miners` - Register mining hardware
- `GET /miners/{id}` - Get miner status

### File Structure
```
VFTchain/
├── miner-platform/
│   ├── index.html          # Miner dashboard interface
│   ├── miner-api.js        # API integration and wallet logic
│   └── Dockerfile          # Container configuration
├── user-platform/
│   ├── index.html          # User job submission interface  
│   ├── user-api.js         # API integration and job management
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
These interfaces are designed to integrate with the full VFT Platform infrastructure:
- **API Gateway**: FastAPI backend for job coordination
- **PostgreSQL Database**: Job and user data storage
- **Redis Cache**: Real-time data and session management
- **Solana Blockchain**: Smart contract interactions
- **IPFS/Filecoin**: Decentralized storage for AI datasets

### Wallet Integration
- **Phantom Wallet**: Primary Solana wallet for mainnet
- **Demo Mode**: Testing without wallet connection
- **Auto-connect**: Remembers wallet connections across sessions

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

**Part of the VFT Platform ecosystem - Decentralized AI Computing Network**

*Professional interfaces for GPU miners and AI developers*