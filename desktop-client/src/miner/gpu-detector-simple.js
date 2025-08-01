// Simple GPU detection that works in packaged Electron apps
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class SimpleGPUDetector {
    async detectGPUs() {
        const methods = [
            this.detectViaNvidiaSmi(),
            this.detectViaWmicSimple(),
            this.detectViaDeviceManager()
        ];

        const results = await Promise.allSettled(methods);
        const gpus = [];

        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value.length > 0) {
                gpus.push(...result.value);
            }
        });

        // Remove duplicates
        const uniqueGPUs = [];
        const seen = new Set();

        gpus.forEach(gpu => {
            const key = gpu.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!seen.has(key)) {
                seen.add(key);
                uniqueGPUs.push(gpu);
            }
        });

        return uniqueGPUs;
    }

    // Method 1: Try nvidia-smi in common locations
    async detectViaNvidiaSmi() {
        const possiblePaths = [
            'nvidia-smi',
            'C:\\Windows\\System32\\nvidia-smi.exe',
            'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe'
        ];

        for (const nvPath of possiblePaths) {
            try {
                const result = await this.execCommand(`"${nvPath}" --query-gpu=name,memory.total --format=csv,noheader`);
                if (result) {
                    const gpus = [];
                    const lines = result.trim().split('\n');
                    
                    lines.forEach((line, index) => {
                        const parts = line.split(',').map(s => s.trim());
                        if (parts.length >= 2) {
                            const name = parts[0];
                            const memory = parseInt(parts[1]) || 8192;
                            
                            gpus.push({
                                id: `nvidia-${index}`,
                                name: name,
                                memory: Math.round(memory / 1024),
                                compute: this.estimateCompute(name),
                                type: 'NVIDIA',
                                available: true
                            });
                        }
                    });

                    if (gpus.length > 0) return gpus;
                }
            } catch (e) {
                // Continue to next method
            }
        }
        
        return [];
    }

    // Method 2: Simple WMIC query
    async detectViaWmicSimple() {
        try {
            const result = await this.execCommand('wmic path win32_VideoController get name,AdapterRAM /format:list');
            if (!result) return [];

            const gpus = [];
            const lines = result.split('\n');
            let currentGPU = {};

            lines.forEach(line => {
                line = line.trim();
                if (line.startsWith('Name=')) {
                    currentGPU.name = line.substring(5);
                } else if (line.startsWith('AdapterRAM=')) {
                    currentGPU.ram = parseInt(line.substring(11)) || 0;
                } else if (!line && currentGPU.name) {
                    // Skip Microsoft Basic Display
                    if (!currentGPU.name.includes('Microsoft Basic')) {
                        const memoryGB = currentGPU.ram > 0 ? 
                            Math.round(currentGPU.ram / (1024 * 1024 * 1024)) : 
                            this.estimateMemory(currentGPU.name);

                        gpus.push({
                            id: `wmic-${gpus.length}`,
                            name: currentGPU.name,
                            memory: Math.max(1, memoryGB),
                            compute: this.estimateCompute(currentGPU.name),
                            type: this.detectType(currentGPU.name),
                            available: true
                        });
                    }
                    currentGPU = {};
                }
            });

            return gpus;
        } catch (e) {
            return [];
        }
    }

    // Method 3: Use device manager info
    async detectViaDeviceManager() {
        try {
            // Try to read from registry where device info is stored
            const result = await this.execCommand(
                'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}" /s /f "DriverDesc"'
            );
            
            if (!result) return [];

            const gpus = [];
            const lines = result.split('\n');
            
            lines.forEach(line => {
                if (line.includes('DriverDesc') && line.includes('REG_SZ')) {
                    const match = line.match(/REG_SZ\s+(.+)/);
                    if (match) {
                        const name = match[1].trim();
                        if (!name.includes('Microsoft Basic') && name.length > 3) {
                            gpus.push({
                                id: `reg-${gpus.length}`,
                                name: name,
                                memory: this.estimateMemory(name),
                                compute: this.estimateCompute(name),
                                type: this.detectType(name),
                                available: true
                            });
                        }
                    }
                }
            });

            return gpus;
        } catch (e) {
            return [];
        }
    }

    // Helper to execute commands with timeout
    execCommand(command) {
        return new Promise((resolve) => {
            exec(command, { 
                timeout: 5000,
                windowsHide: true,
                shell: true
            }, (error, stdout) => {
                if (error) {
                    resolve(null);
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    // Estimate memory based on GPU name
    estimateMemory(name) {
        const lower = name.toLowerCase();
        
        // RTX 50 series
        if (lower.includes('rtx 5090')) return 32;
        if (lower.includes('rtx 5080')) return 24;
        if (lower.includes('rtx 5070 ti')) return 16;
        if (lower.includes('rtx 5070')) return 12;
        
        // RTX 40 series
        if (lower.includes('rtx 4090')) return 24;
        if (lower.includes('rtx 4080')) return 16;
        if (lower.includes('rtx 4070 ti')) return 12;
        if (lower.includes('rtx 4070')) return 12;
        if (lower.includes('rtx 4060')) return 8;
        
        // RTX 30 series
        if (lower.includes('rtx 3090')) return 24;
        if (lower.includes('rtx 3080')) return 10;
        if (lower.includes('rtx 3070')) return 8;
        if (lower.includes('rtx 3060')) return 12;
        
        // AMD
        if (lower.includes('rx 7900')) return 24;
        if (lower.includes('rx 7800')) return 16;
        if (lower.includes('rx 6900')) return 16;
        if (lower.includes('rx 6800')) return 16;
        
        // Default
        return 8;
    }

    // Estimate compute power
    estimateCompute(name) {
        const lower = name.toLowerCase();
        
        // RTX 50 series
        if (lower.includes('rtx 5090')) return 100.0;
        if (lower.includes('rtx 5080')) return 80.0;
        if (lower.includes('rtx 5070 ti')) return 50.0;
        if (lower.includes('rtx 5070')) return 45.0;
        
        // RTX 40 series
        if (lower.includes('rtx 4090')) return 82.6;
        if (lower.includes('rtx 4080')) return 48.7;
        if (lower.includes('rtx 4070')) return 29.2;
        if (lower.includes('rtx 4060')) return 15.1;
        
        // RTX 30 series
        if (lower.includes('rtx 3090')) return 35.6;
        if (lower.includes('rtx 3080')) return 29.8;
        if (lower.includes('rtx 3070')) return 20.3;
        if (lower.includes('rtx 3060')) return 12.7;
        
        return 10.0;
    }

    // Detect GPU type
    detectType(name) {
        const lower = name.toLowerCase();
        if (lower.includes('nvidia') || lower.includes('geforce') || lower.includes('rtx') || lower.includes('gtx')) {
            return 'NVIDIA';
        } else if (lower.includes('amd') || lower.includes('radeon')) {
            return 'AMD';
        } else if (lower.includes('intel')) {
            return 'Intel';
        }
        return 'Unknown';
    }
}

module.exports = { SimpleGPUDetector };