// VFT GPU Manager - Windows GPU Detection
const { exec } = require('child_process');
const os = require('os');
const winston = require('winston');
const { WindowsAPIGPUDetector } = require('./gpu-detector-windows-api');
const { ProductionGPUDetector } = require('./gpu-detector-production');
const { SimpleGPUDetector } = require('./gpu-detector-simple');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'gpu-manager.log' })
    ]
});

class GPUManager {
    constructor() {
        this.gpus = [];
        this.platform = os.platform();
        logger.info('GPU Manager initialized on platform:', this.platform);
    }

    // Main GPU detection method
    async detectGPUs() {
        logger.info('Starting GPU detection...');
        
        try {
            if (this.platform === 'win32') {
                // Windows GPU detection
                return await this.detectWindowsGPUs();
            } else if (this.platform === 'linux') {
                // Linux GPU detection
                return await this.detectLinuxGPUs();
            } else if (this.platform === 'darwin') {
                // macOS GPU detection
                return await this.detectMacGPUs();
            } else {
                logger.warn('Unsupported platform:', this.platform);
                return [];
            }
        } catch (error) {
            logger.error('GPU detection failed:', error);
            return [];
        }
    }

    // Windows GPU detection using comprehensive vendor-specific methods
    async detectWindowsGPUs() {
        const gpus = [];
        let uniqueGPUs = [];
        
        try {
            // FIRST: Try simple detector (works best in packaged apps)
            const simpleDetector = new SimpleGPUDetector();
            const simpleGPUs = await simpleDetector.detectGPUs();
            
            if (simpleGPUs.length > 0) {
                logger.info(`Simple detector found ${simpleGPUs.length} GPU(s)`);
                return simpleGPUs; // Return immediately if successful
            }
            
            // SECOND: Try production detector
            const productionDetector = new ProductionGPUDetector();
            const productionGPUs = await productionDetector.detectGPUs();
            
            if (productionGPUs.length > 0) {
                logger.info(`Production detector found ${productionGPUs.length} GPU(s)`);
                return productionGPUs; // Return immediately if successful
            }
            
            // FALLBACK: Try ALL other methods in parallel
            logger.info('Simple and production detectors failed, trying all fallback methods...');
            const detectionPromises = [
                this.detectNvidiaGPUs(),
                this.detectAMDGPUs(), 
                this.detectIntelGPUs(),
                this.detectViaWMIC(),
                this.detectViaPowerShell(),
                this.detectViaWindowsAPI()  // Windows API method
            ];
            
            const results = await Promise.allSettled(detectionPromises);
            
            // Combine all successful results
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.length > 0) {
                    const methodName = ['NVIDIA', 'AMD', 'Intel', 'WMIC', 'PowerShell', 'WindowsAPI'][index];
                    logger.info(`${methodName} detection found ${result.value.length} GPU(s)`);
                    gpus.push(...result.value);
                }
            });
            
            // Remove duplicates based on GPU name
            uniqueGPUs = this.removeDuplicateGPUs(gpus);
            
        } catch (error) {
            logger.error('Windows GPU detection error:', error);
        }
        
        // If no GPUs detected, return empty array - NO MOCK DATA IN PRODUCTION  
        if (uniqueGPUs.length === 0) {
            logger.error('No GPUs detected - check GPU drivers and system');
            return [];
        }
        
        return uniqueGPUs;
    }

    // NVIDIA GPU detection using multiple NVIDIA tools
    async detectNvidiaGPUs() {
        return new Promise((resolve) => {
            // Try nvidia-smi first (most comprehensive)
            exec('nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits', (error, stdout, stderr) => {
                if (!error && stdout.trim()) {
                    const gpus = [];
                    const lines = stdout.trim().split('\n');
                    
                    lines.forEach((line, index) => {
                        const [name, memory, driver] = line.split(',').map(s => s.trim());
                        
                        gpus.push({
                            id: `nvidia-${index}`,
                            name: name,
                            memory: Math.round(parseInt(memory) / 1024), // Convert MB to GB
                            compute: this.estimateComputePower(name, parseInt(memory) * 1024 * 1024),
                            type: 'NVIDIA',
                            driver: driver,
                            available: true,
                            vendor: 'NVIDIA Corporation'
                        });
                    });
                    
                    logger.info(`nvidia-smi detected ${gpus.length} NVIDIA GPUs`);
                    resolve(gpus);
                    return;
                }
                
                // Fallback: Try nvidia-ml-py alternative command
                exec('nvidia-smi -L', (error2, stdout2) => {
                    if (!error2 && stdout2.trim()) {
                        const gpus = [];
                        const lines = stdout2.trim().split('\n');
                        
                        lines.forEach((line, index) => {
                            const match = line.match(/GPU (\d+): (.+) \(UUID: .+\)/);
                            if (match) {
                                const name = match[2];
                                gpus.push({
                                    id: `nvidia-${index}`,
                                    name: name,
                                    memory: 8, // Default estimate
                                    compute: this.estimateComputePower(name, 8 * 1024 * 1024 * 1024),
                                    type: 'NVIDIA',
                                    available: true,
                                    vendor: 'NVIDIA Corporation'
                                });
                            }
                        });
                        
                        logger.info(`nvidia-smi list detected ${gpus.length} NVIDIA GPUs`);
                        resolve(gpus);
                    } else {
                        logger.info('No NVIDIA tools available');
                        resolve([]);
                    }
                });
            });
        });
    }

    // AMD GPU detection using multiple AMD tools
    async detectAMDGPUs() {
        return new Promise((resolve) => {
            // Try rocm-smi first (ROCm toolkit)
            exec('rocm-smi --showmeminfo vram --csv', (error, stdout, stderr) => {
                if (!error && stdout.trim()) {
                    const gpus = [];
                    const lines = stdout.trim().split('\n').slice(1); // Skip header
                    
                    lines.forEach((line, index) => {
                        const parts = line.split(',');
                        if (parts.length >= 2) {
                            const memory = parseInt(parts[1]) || 4;
                            gpus.push({
                                id: `amd-${index}`,
                                name: `AMD GPU ${index}`,
                                memory: Math.round(memory / 1024), // Convert MB to GB
                                compute: this.estimateComputePower(`AMD GPU ${index}`, memory * 1024 * 1024),
                                type: 'AMD',
                                available: true,
                                vendor: 'Advanced Micro Devices'
                            });
                        }
                    });
                    
                    logger.info(`rocm-smi detected ${gpus.length} AMD GPUs`);
                    resolve(gpus);
                    return;
                }
                
                // Fallback: Try AMD-specific registry/WMI query
                exec('wmic path win32_VideoController where "Name like \'%AMD%\' or Name like \'%Radeon%\'" get Name,AdapterRAM /format:list', (error2, stdout2) => {
                    if (!error2 && stdout2.trim()) {
                        const gpus = [];
                        const lines = stdout2.split('\n');
                        let currentGPU = {};
                        let index = 0;
                        
                        lines.forEach(line => {
                            line = line.trim();
                            if (line.startsWith('AdapterRAM=')) {
                                currentGPU.memory = parseInt(line.split('=')[1]) || 0;
                            } else if (line.startsWith('Name=')) {
                                currentGPU.name = line.split('=')[1];
                            } else if (!line && currentGPU.name) {
                                const memoryGB = currentGPU.memory > 0 ? Math.round(currentGPU.memory / (1024 * 1024 * 1024)) : 4;
                                gpus.push({
                                    id: `amd-${index++}`,
                                    name: currentGPU.name,
                                    memory: memoryGB,
                                    compute: this.estimateComputePower(currentGPU.name, currentGPU.memory),
                                    type: 'AMD',
                                    available: true,
                                    vendor: 'Advanced Micro Devices'
                                });
                                currentGPU = {};
                            }
                        });
                        
                        logger.info(`AMD WMI detected ${gpus.length} AMD GPUs`);
                        resolve(gpus);
                    } else {
                        logger.info('No AMD tools available');
                        resolve([]);
                    }
                });
            });
        });
    }
    
    // Intel GPU detection using Intel-specific tools
    async detectIntelGPUs() {
        return new Promise((resolve) => {
            // Try Intel GPU tools
            exec('intel_gpu_top -l', (error, stdout, stderr) => {
                if (!error && stdout.trim()) {
                    const gpus = [];
                    // Parse Intel GPU output
                    logger.info(`Intel tools detected ${gpus.length} Intel GPUs`);
                    resolve(gpus);
                    return;
                }
                
                // Fallback: Intel-specific WMI query
                exec('wmic path win32_VideoController where "Name like \'%Intel%\'" get Name,AdapterRAM /format:list', (error2, stdout2) => {
                    if (!error2 && stdout2.trim()) {
                        const gpus = [];
                        const lines = stdout2.split('\n');
                        let currentGPU = {};
                        let index = 0;
                        
                        lines.forEach(line => {
                            line = line.trim();
                            if (line.startsWith('AdapterRAM=')) {
                                currentGPU.memory = parseInt(line.split('=')[1]) || 0;
                            } else if (line.startsWith('Name=')) {
                                currentGPU.name = line.split('=')[1];
                            } else if (!line && currentGPU.name) {
                                const memoryGB = currentGPU.memory > 0 ? Math.round(currentGPU.memory / (1024 * 1024 * 1024)) : 2;
                                gpus.push({
                                    id: `intel-${index++}`,
                                    name: currentGPU.name,
                                    memory: Math.max(1, memoryGB),
                                    compute: this.estimateComputePower(currentGPU.name, currentGPU.memory),
                                    type: 'Intel',
                                    available: true,
                                    vendor: 'Intel Corporation'
                                });
                                currentGPU = {};
                            }
                        });
                        
                        logger.info(`Intel WMI detected ${gpus.length} Intel GPUs`);
                        resolve(gpus);
                    } else {
                        logger.info('No Intel tools available');
                        resolve([]);
                    }
                });
            });
        });
    }

    // Windows WMIC GPU detection - PRODUCTION VERSION
    async detectViaWMIC() {
        return new Promise((resolve) => {
            // Use simpler WMIC command that works more reliably
            exec('wmic path win32_VideoController get name,AdapterRAM /format:list', (error, stdout, stderr) => {
                if (error) {
                    logger.error('WMIC error:', error);
                    // Try alternative format
                    exec('wmic path win32_VideoController get name,AdapterRAM', (error2, stdout2) => {
                        if (error2) {
                            resolve([]);
                            return;
                        }
                        resolve(this.parseWMICTable(stdout2));
                    });
                    return;
                }
                
                const gpus = [];
                const lines = stdout.split('\n');
                let currentGPU = {};
                let gpuIndex = 0;
                
                lines.forEach(line => {
                    line = line.trim();
                    if (!line) {
                        // Empty line means end of GPU entry
                        if (currentGPU.Name) {
                            const vram = parseInt(currentGPU.AdapterRAM) || 0;
                            const memoryGB = vram > 0 ? Math.round(vram / (1024 * 1024 * 1024)) : 1;
                            
                            gpus.push({
                                id: `gpu-${gpuIndex++}`,
                                name: currentGPU.Name,
                                memory: Math.max(1, memoryGB),
                                compute: this.estimateComputePower(currentGPU.Name, vram),
                                type: this.detectGPUType(currentGPU.Name),
                                available: true
                            });
                        }
                        currentGPU = {};
                        return;
                    }
                    
                    if (line.startsWith('AdapterRAM=')) {
                        currentGPU.AdapterRAM = line.split('=')[1];
                    } else if (line.startsWith('Name=')) {
                        currentGPU.Name = line.split('=')[1];
                    }
                });
                
                // Handle last GPU if no trailing empty line
                if (currentGPU.Name) {
                    const vram = parseInt(currentGPU.AdapterRAM) || 0;
                    const memoryGB = vram > 0 ? Math.round(vram / (1024 * 1024 * 1024)) : 1;
                    
                    gpus.push({
                        id: `gpu-${gpuIndex}`,
                        name: currentGPU.Name,
                        memory: Math.max(1, memoryGB),
                        compute: this.estimateComputePower(currentGPU.Name, vram),
                        type: this.detectGPUType(currentGPU.Name),
                        available: true
                    });
                }
                
                logger.info(`Detected ${gpus.length} GPUs via WMIC`);
                resolve(gpus);
            });
        });
    }
    
    // Parse WMIC table format as fallback
    parseWMICTable(stdout) {
        const gpus = [];
        const lines = stdout.trim().split('\n');
        
        // Find header row
        let headerIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes('adapteram') && lines[i].toLowerCase().includes('name')) {
                headerIndex = i;
                break;
            }
        }
        
        if (headerIndex === -1) return gpus;
        
        // Parse data rows
        for (let i = headerIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Split by multiple spaces to handle table format
            const parts = line.split(/\s{2,}/);
            if (parts.length >= 2) {
                const vramStr = parts[0].trim();
                const name = parts[1].trim();
                
                if (name && name !== 'Name') {
                    const vram = parseInt(vramStr) || 0;
                    const memoryGB = vram > 0 ? Math.round(vram / (1024 * 1024 * 1024)) : 1;
                    
                    gpus.push({
                        id: `gpu-${gpus.length}`,
                        name: name,
                        memory: Math.max(1, memoryGB),
                        compute: this.estimateComputePower(name, vram),
                        type: this.detectGPUType(name),
                        available: true
                    });
                }
            }
        }
        
        return gpus;
    }

    // PowerShell GPU detection
    async detectViaPowerShell() {
        return new Promise((resolve) => {
            const psCommand = 'Get-WmiObject Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json';
            
            exec(`powershell -Command "${psCommand}"`, (error, stdout, stderr) => {
                if (error) {
                    logger.info('PowerShell GPU detection failed');
                    resolve([]);
                    return;
                }
                
                try {
                    const gpuData = JSON.parse(stdout);
                    const gpuArray = Array.isArray(gpuData) ? gpuData : [gpuData];
                    const gpus = [];
                    
                    gpuArray.forEach((gpu, index) => {
                        if (!gpu.Name) return;
                        
                        // Include ALL GPUs for comprehensive detection
                        const memoryGB = gpu.AdapterRAM ? Math.round(gpu.AdapterRAM / (1024 * 1024 * 1024)) : 2;
                        
                        gpus.push({
                            id: `gpu-${index}`,
                            name: gpu.Name,
                            memory: memoryGB || 2, // Minimum 2GB
                            compute: this.estimateComputePower(gpu.Name, gpu.AdapterRAM || 0),
                            type: this.detectGPUType(gpu.Name),
                            driver: gpu.DriverVersion,
                            available: true
                        });
                    });
                    
                    logger.info(`Detected ${gpus.length} GPUs via PowerShell`);
                    resolve(gpus);
                } catch (e) {
                    logger.error('PowerShell parse error:', e);
                    resolve([]);
                }
            });
        });
    }

    // Windows API GPU detection for packaged applications
    async detectViaWindowsAPI() {
        try {
            logger.info('Attempting Windows API GPU detection (for packaged apps)...');
            const detector = new WindowsAPIGPUDetector();
            const gpus = await detector.detectGPUs();
            
            logger.info(`Windows API detected ${gpus.length} GPUs`);
            return gpus;
        } catch (error) {
            logger.error('Windows API GPU detection failed:', error);
            return [];
        }
    }
    
    // DirectX diagnostics GPU detection
    async detectViaDxDiag() {
        return new Promise((resolve) => {
            // Create temporary file for dxdiag output
            const tempFile = require('path').join(os.tmpdir(), 'dxdiag.txt');
            
            exec(`dxdiag /t ${tempFile}`, (error) => {
                if (error) {
                    logger.error('DxDiag error:', error);
                    resolve([]);
                    return;
                }
                
                // Wait for file to be created
                setTimeout(() => {
                    require('fs').readFile(tempFile, 'utf8', (err, data) => {
                        if (err) {
                            resolve([]);
                            return;
                        }
                        
                        const gpus = [];
                        // Parse DxDiag output for GPU info
                        const displayMatch = data.match(/Display Devices\s*[-]+\s*([\s\S]+?)(?=\n\s*Sound Devices|$)/);
                        
                        if (displayMatch) {
                            const gpuInfo = displayMatch[1];
                            const nameMatch = gpuInfo.match(/Card name:\s*(.+)/);
                            const memoryMatch = gpuInfo.match(/Dedicated Memory:\s*(\d+)\s*MB/);
                            
                            if (nameMatch) {
                                const name = nameMatch[1].trim();
                                const memory = memoryMatch ? parseInt(memoryMatch[1]) / 1024 : 4; // Convert to GB
                                
                                gpus.push({
                                    id: 'gpu-0',
                                    name: name,
                                    memory: Math.round(memory),
                                    compute: this.estimateComputePower(name, memory * 1024),
                                    type: this.detectGPUType(name),
                                    available: true
                                });
                            }
                        }
                        
                        // Clean up temp file
                        require('fs').unlink(tempFile, () => {});
                        
                        logger.info(`Detected ${gpus.length} GPUs via DxDiag`);
                        resolve(gpus);
                    });
                }, 3000); // Wait 3 seconds for dxdiag to complete
            });
        });
    }

    // Linux GPU detection
    async detectLinuxGPUs() {
        const gpus = [];
        
        // Try lspci
        return new Promise((resolve) => {
            exec('lspci | grep -i vga', (error, stdout) => {
                if (error) {
                    resolve([]);
                    return;
                }
                
                // Parse lspci output
                const lines = stdout.trim().split('\n');
                lines.forEach((line, index) => {
                    const match = line.match(/VGA.*:\s*(.+)/);
                    if (match) {
                        const name = match[1];
                        gpus.push({
                            id: `gpu-${index}`,
                            name: name,
                            memory: 8, // Default 8GB
                            compute: 10,
                            type: this.detectGPUType(name),
                            available: true
                        });
                    }
                });
                
                resolve(gpus);
            });
        });
    }

    // macOS GPU detection
    async detectMacGPUs() {
        return new Promise((resolve) => {
            exec('system_profiler SPDisplaysDataType', (error, stdout) => {
                if (error) {
                    resolve([]);
                    return;
                }
                
                const gpus = [];
                // Parse macOS system profiler output
                // Implementation here...
                
                resolve(gpus);
            });
        });
    }

    // Detect GPU type from name
    detectGPUType(name) {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('nvidia') || lowerName.includes('geforce') || lowerName.includes('rtx') || lowerName.includes('gtx')) {
            return 'NVIDIA';
        } else if (lowerName.includes('amd') || lowerName.includes('radeon')) {
            return 'AMD';
        } else if (lowerName.includes('intel')) {
            return 'Intel';
        }
        return 'Unknown';
    }

    // Estimate compute power based on GPU name and memory
    estimateComputePower(name, memoryMB) {
        const lowerName = name.toLowerCase();
        
        // NVIDIA RTX 40 series
        if (lowerName.includes('rtx 4090')) return 82.6;
        if (lowerName.includes('rtx 4080')) return 48.7;
        if (lowerName.includes('rtx 4070')) return 29.2;
        if (lowerName.includes('rtx 4060')) return 15.1;
        
        // NVIDIA RTX 30 series
        if (lowerName.includes('rtx 3090')) return 35.6;
        if (lowerName.includes('rtx 3080')) return 29.8;
        if (lowerName.includes('rtx 3070')) return 20.3;
        if (lowerName.includes('rtx 3060')) return 12.7;
        
        // NVIDIA GTX series
        if (lowerName.includes('gtx 1080')) return 8.9;
        if (lowerName.includes('gtx 1070')) return 6.5;
        if (lowerName.includes('gtx 1060')) return 4.4;
        
        // AMD RX 7000 series
        if (lowerName.includes('rx 7900')) return 61.4;
        if (lowerName.includes('rx 7800')) return 37.3;
        if (lowerName.includes('rx 7700')) return 28.6;
        
        // AMD RX 6000 series
        if (lowerName.includes('rx 6900')) return 26.8;
        if (lowerName.includes('rx 6800')) return 20.7;
        if (lowerName.includes('rx 6700')) return 13.8;
        
        // Intel Arc series
        if (lowerName.includes('arc a770')) return 19.6;
        if (lowerName.includes('arc a750')) return 17.2;
        if (lowerName.includes('arc a580')) return 12.4;
        
        // Intel integrated graphics
        if (lowerName.includes('intel') && lowerName.includes('iris')) return 2.1;
        if (lowerName.includes('intel') && lowerName.includes('uhd')) return 1.5;
        if (lowerName.includes('intel') && lowerName.includes('hd')) return 0.8;
        
        // AMD integrated graphics
        if (lowerName.includes('vega') && lowerName.includes('integrated')) return 2.8;
        if (lowerName.includes('radeon') && lowerName.includes('graphics')) return 1.8;
        
        // Default estimation based on memory and type
        const memoryGB = Math.max(1, Math.round(memoryMB / (1024 * 1024 * 1024)));
        if (lowerName.includes('intel') || lowerName.includes('integrated')) {
            return memoryGB * 0.5; // Lower performance for integrated
        }
        return memoryGB * 2.5; // Rough estimate for discrete GPUs
    }

    // Get mock GPUs for testing
    getMockGPUs() {
        return [{
            id: 'mock-gpu-0',
            name: 'Virtual GPU (No physical GPU detected)',
            memory: 8,
            compute: 10,
            type: 'Virtual',
            available: true
        }];
    }

    // Start GPU monitoring
    startMonitoring(callback) {
        this.monitoringInterval = setInterval(async () => {
            const gpus = await this.detectGPUs();
            callback(gpus);
        }, 5000); // Check every 5 seconds
    }

    // Stop GPU monitoring
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }

    // Get GPU utilization (if available)
    async getGPUUtilization() {
        if (this.platform === 'win32') {
            return new Promise((resolve) => {
                exec('nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits', (error, stdout) => {
                    if (error) {
                        resolve([]);
                        return;
                    }
                    
                    const utilization = stdout.trim().split('\n').map(line => parseInt(line));
                    resolve(utilization);
                });
            });
        }
        
        return [];
    }
    
    // Remove duplicate GPUs based on name similarity
    removeDuplicateGPUs(gpus) {
        const uniqueGPUs = [];
        const seen = new Set();
        
        gpus.forEach(gpu => {
            // Create a normalized identifier based on GPU name
            const normalizedName = gpu.name.toLowerCase()
                .replace(/[^a-z0-9]/g, '')  // Remove special chars
                .replace(/\s+/g, '');       // Remove spaces
            
            if (!seen.has(normalizedName)) {
                seen.add(normalizedName);
                uniqueGPUs.push(gpu);
            } else {
                // If duplicate, prefer the one with more detailed info
                const existingIndex = uniqueGPUs.findIndex(existing => 
                    existing.name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\s+/g, '') === normalizedName
                );
                
                if (existingIndex !== -1) {
                    const existing = uniqueGPUs[existingIndex];
                    // Prefer GPU with driver info, higher memory, or vendor info
                    if ((gpu.driver && !existing.driver) || 
                        (gpu.memory > existing.memory) ||
                        (gpu.vendor && !existing.vendor)) {
                        uniqueGPUs[existingIndex] = gpu;
                    }
                }
            }
        });
        
        logger.info(`Removed duplicates: ${gpus.length} -> ${uniqueGPUs.length} unique GPUs`);
        return uniqueGPUs;
    }

    // Check if GPU is available for mining
    async isGPUAvailable(gpuId) {
        const gpus = await this.detectGPUs();
        const gpu = gpus.find(g => g.id === gpuId);
        return gpu ? gpu.available : false;
    }
}

module.exports = { GPUManager };