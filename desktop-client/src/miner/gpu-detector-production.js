// Production-ready GPU detection for packaged Electron apps
const si = require('systeminformation');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'gpu-detection.log' })
    ]
});

class ProductionGPUDetector {
    constructor() {
        this.detectedGPUs = [];
        this.platform = os.platform();
    }

    // Main detection method - uses multiple approaches with fallbacks
    async detectGPUs() {
        logger.info('Starting production GPU detection...');
        const gpus = [];

        try {
            // Method 1: Use systeminformation package (most reliable for packaged apps)
            const siGPUs = await this.detectViaSystemInformation();
            if (siGPUs.length > 0) {
                logger.info(`SystemInformation detected ${siGPUs.length} GPUs`);
                gpus.push(...siGPUs);
            }

            // Method 2: Try vendor-specific tools with absolute paths
            if (this.platform === 'win32') {
                const vendorGPUs = await this.detectVendorSpecificWindows();
                if (vendorGPUs.length > 0) {
                    logger.info(`Vendor tools detected ${vendorGPUs.length} additional GPUs`);
                    gpus.push(...vendorGPUs);
                }
            }

            // Remove duplicates and return
            const uniqueGPUs = this.removeDuplicates(gpus);
            logger.info(`Total unique GPUs detected: ${uniqueGPUs.length}`);
            
            return uniqueGPUs;

        } catch (error) {
            logger.error('GPU detection error:', error);
            return [];
        }
    }

    // Primary method: Use systeminformation package
    async detectViaSystemInformation() {
        try {
            const graphics = await si.graphics();
            const controllers = graphics.controllers || [];
            
            return controllers.map((gpu, index) => {
                // Skip Microsoft Basic Display Adapter
                if (gpu.vendor === 'Microsoft' && gpu.model.includes('Basic')) {
                    return null;
                }

                const vram = gpu.vram || gpu.memoryTotal || 0;
                const memoryGB = vram > 0 ? Math.round(vram / 1024) : this.estimateMemoryFromModel(gpu.model);

                return {
                    id: `gpu-${index}`,
                    name: gpu.model || gpu.name || 'Unknown GPU',
                    vendor: gpu.vendor,
                    memory: Math.max(1, memoryGB),
                    compute: this.estimateComputePower(gpu.model || gpu.name),
                    type: this.detectGPUType(gpu.vendor, gpu.model),
                    busAddress: gpu.busAddress,
                    driverVersion: gpu.driverVersion,
                    available: true,
                    method: 'systeminformation'
                };
            }).filter(gpu => gpu !== null);

        } catch (error) {
            logger.error('SystemInformation GPU detection failed:', error);
            return [];
        }
    }

    // Fallback: Try vendor-specific tools with full paths
    async detectVendorSpecificWindows() {
        const gpus = [];

        // Common paths for vendor tools
        const nvidiaPaths = [
            'C:\\Windows\\System32\\nvidia-smi.exe',
            'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe',
            'nvidia-smi' // Try PATH as last resort
        ];

        // Try NVIDIA detection
        for (const nvPath of nvidiaPaths) {
            const nvidiaGPUs = await this.tryNvidiaDetection(nvPath);
            if (nvidiaGPUs.length > 0) {
                gpus.push(...nvidiaGPUs);
                break;
            }
        }

        // Try PowerShell with specific command
        const psGPUs = await this.tryPowerShellDetection();
        gpus.push(...psGPUs);

        return gpus;
    }

    // NVIDIA detection with specific path
    async tryNvidiaDetection(nvidiaSmiPath) {
        return new Promise((resolve) => {
            exec(`"${nvidiaSmiPath}" --query-gpu=name,memory.total --format=csv,noheader,nounits`, {
                timeout: 5000,
                windowsHide: true
            }, (error, stdout, stderr) => {
                if (error || !stdout.trim()) {
                    resolve([]);
                    return;
                }

                const gpus = [];
                const lines = stdout.trim().split('\n');

                lines.forEach((line, index) => {
                    const [name, memory] = line.split(',').map(s => s.trim());
                    if (name && memory) {
                        gpus.push({
                            id: `nvidia-${index}`,
                            name: name,
                            vendor: 'NVIDIA',
                            memory: Math.round(parseInt(memory) / 1024),
                            compute: this.estimateComputePower(name),
                            type: 'NVIDIA',
                            available: true,
                            method: 'nvidia-smi'
                        });
                    }
                });

                resolve(gpus);
            });
        });
    }

    // PowerShell detection with embedded script
    async tryPowerShellDetection() {
        return new Promise((resolve) => {
            const psCommand = `
                $gpus = Get-WmiObject Win32_VideoController | Where-Object { $_.Name -notlike '*Microsoft Basic*' }
                $gpus | ForEach-Object {
                    $name = $_.Name
                    $vram = if ($_.AdapterRAM) { [math]::Round($_.AdapterRAM / 1GB, 1) } else { 0 }
                    Write-Output "$name|$vram"
                }
            `;

            const escapedCommand = psCommand.replace(/"/g, '`"').replace(/\n/g, ' ');

            exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${escapedCommand}"`, {
                timeout: 10000,
                windowsHide: true
            }, (error, stdout, stderr) => {
                if (error || !stdout.trim()) {
                    resolve([]);
                    return;
                }

                const gpus = [];
                const lines = stdout.trim().split('\n');

                lines.forEach((line, index) => {
                    const [name, vramStr] = line.split('|').map(s => s.trim());
                    if (name) {
                        const vram = parseFloat(vramStr) || 0;
                        const memoryGB = vram > 0 ? Math.round(vram) : this.estimateMemoryFromModel(name);

                        gpus.push({
                            id: `ps-${index}`,
                            name: name,
                            vendor: this.detectVendorFromName(name),
                            memory: Math.max(1, memoryGB),
                            compute: this.estimateComputePower(name),
                            type: this.detectGPUType('', name),
                            available: true,
                            method: 'powershell'
                        });
                    }
                });

                resolve(gpus);
            });
        });
    }

    // Estimate memory from GPU model name
    estimateMemoryFromModel(model) {
        const lowerModel = model.toLowerCase();
        
        // NVIDIA RTX 40 series
        if (lowerModel.includes('rtx 4090')) return 24;
        if (lowerModel.includes('rtx 4080')) return 16;
        if (lowerModel.includes('rtx 4070 ti')) return 12;
        if (lowerModel.includes('rtx 4070')) return 12;
        if (lowerModel.includes('rtx 4060 ti')) return 8;
        if (lowerModel.includes('rtx 4060')) return 8;
        
        // NVIDIA RTX 50 series
        if (lowerModel.includes('rtx 5090')) return 32;
        if (lowerModel.includes('rtx 5080')) return 16;
        if (lowerModel.includes('rtx 5070 ti')) return 16;
        if (lowerModel.includes('rtx 5070')) return 12;
        
        // Default based on series
        if (lowerModel.includes('rtx 30')) return 8;
        if (lowerModel.includes('gtx')) return 4;
        if (lowerModel.includes('radeon')) return 8;
        if (lowerModel.includes('intel')) return 2;
        
        return 4; // Default fallback
    }

    // Detect vendor from GPU name
    detectVendorFromName(name) {
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

    // Detect GPU type
    detectGPUType(vendor, model) {
        if (vendor.toLowerCase().includes('nvidia')) return 'NVIDIA';
        if (vendor.toLowerCase().includes('amd')) return 'AMD';
        if (vendor.toLowerCase().includes('intel')) return 'Intel';
        
        return this.detectVendorFromName(model);
    }

    // Estimate compute power
    estimateComputePower(name) {
        const lowerName = name.toLowerCase();
        
        // NVIDIA RTX 50 series
        if (lowerName.includes('rtx 5090')) return 100.0;
        if (lowerName.includes('rtx 5080')) return 70.0;
        if (lowerName.includes('rtx 5070 ti')) return 50.0;
        if (lowerName.includes('rtx 5070')) return 45.0;
        
        // NVIDIA RTX 40 series
        if (lowerName.includes('rtx 4090')) return 82.6;
        if (lowerName.includes('rtx 4080')) return 48.7;
        if (lowerName.includes('rtx 4070 ti')) return 35.5;
        if (lowerName.includes('rtx 4070')) return 29.2;
        if (lowerName.includes('rtx 4060')) return 15.1;
        
        // NVIDIA RTX 30 series
        if (lowerName.includes('rtx 3090')) return 35.6;
        if (lowerName.includes('rtx 3080')) return 29.8;
        if (lowerName.includes('rtx 3070')) return 20.3;
        if (lowerName.includes('rtx 3060')) return 12.7;
        
        // AMD RX 7000 series
        if (lowerName.includes('rx 7900')) return 61.4;
        if (lowerName.includes('rx 7800')) return 37.3;
        if (lowerName.includes('rx 7700')) return 28.6;
        
        // Intel Arc
        if (lowerName.includes('arc a770')) return 19.6;
        if (lowerName.includes('arc a750')) return 17.2;
        
        // Default
        return 10.0;
    }

    // Remove duplicate GPUs
    removeDuplicates(gpus) {
        const seen = new Map();
        const unique = [];

        gpus.forEach(gpu => {
            const key = gpu.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(gpu);
            } else {
                // If duplicate, prefer the one with more information
                const existing = unique.find(g => g.name.toLowerCase().replace(/[^a-z0-9]/g, '') === key);
                if (existing && gpu.vendor && !existing.vendor) {
                    Object.assign(existing, { vendor: gpu.vendor });
                }
                if (existing && gpu.driverVersion && !existing.driverVersion) {
                    Object.assign(existing, { driverVersion: gpu.driverVersion });
                }
            }
        });

        return unique;
    }
}

module.exports = { ProductionGPUDetector };