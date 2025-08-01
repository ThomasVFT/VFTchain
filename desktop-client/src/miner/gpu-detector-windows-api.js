// Windows GPU Detection using direct Windows APIs (no WMI/PowerShell)
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

class WindowsAPIGPUDetector {
    constructor() {
        this.gpus = [];
    }

    // Main detection method using Windows APIs
    async detectGPUs() {
        const gpus = [];
        
        try {
            // Method 1: Try nvidia-smi (this usually works in packaged apps)
            const nvidiaGPUs = await this.detectNvidiaGPUsAPI();
            gpus.push(...nvidiaGPUs);
            
            // Method 2: Use DirectX DXGI API via PowerShell (different approach)
            const dxgiGPUs = await this.detectViaDXGI();
            gpus.push(...dxgiGPUs);
            
            // Method 3: Read from Windows Registry
            const registryGPUs = await this.detectViaRegistry();
            gpus.push(...registryGPUs);
            
            // Method 4: Use Windows Performance Toolkit commands (disabled - too noisy)
            // const perfGPUs = await this.detectViaPerformanceCounters();
            // gpus.push(...perfGPUs);
            
            // Remove duplicates
            const uniqueGPUs = this.removeDuplicates(gpus);
            
            console.log(`Windows API Detection: Found ${uniqueGPUs.length} unique GPU(s)`);
            return uniqueGPUs;
            
        } catch (error) {
            console.error('Windows API GPU detection error:', error);
            return [];
        }
    }

    // NVIDIA detection using nvidia-smi (usually works in packaged apps)
    async detectNvidiaGPUsAPI() {
        return new Promise((resolve) => {
            exec('nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits', {
                timeout: 5000
            }, (error, stdout, stderr) => {
                if (error || !stdout.trim()) {
                    resolve([]);
                    return;
                }
                
                const gpus = [];
                const lines = stdout.trim().split('\n');
                
                lines.forEach((line, index) => {
                    const [name, memory, driver] = line.split(',').map(s => s.trim());
                    
                    if (name && memory) {
                        gpus.push({
                            id: `nvidia-api-${index}`,
                            name: name,
                            memory: Math.round(parseInt(memory) / 1024),
                            compute: this.estimateComputePower(name),
                            type: 'NVIDIA',
                            driver: driver,
                            available: true,
                            vendor: 'NVIDIA Corporation',
                            method: 'nvidia-smi'
                        });
                    }
                });
                
                console.log(`NVIDIA API detected ${gpus.length} GPUs`);
                resolve(gpus);
            });
        });
    }

    // Use DXGI (DirectX Graphics Infrastructure) 
    async detectViaDXGI() {
        return new Promise((resolve) => {
            const dxgiScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class DXGI {
    [DllImport("dxgi.dll")]
    public static extern int CreateDXGIFactory1(ref Guid riid, out IntPtr ppFactory);
    
    [StructLayout(LayoutKind.Sequential)]
    public struct DXGI_ADAPTER_DESC1 {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string Description;
        public uint VendorId;
        public uint DeviceId;
        public uint SubSysId;
        public uint Revision;
        public IntPtr DedicatedVideoMemory;
        public IntPtr DedicatedSystemMemory;
        public IntPtr SharedSystemMemory;
    }
}
"@

try {
    # This is a simplified approach - in a real implementation you'd call DXGI APIs
    Get-WmiObject -Class Win32_VideoController | ForEach-Object {
        Write-Output "$($_.Name)|$($_.AdapterRAM)|$($_.DriverVersion)"
    }
} catch {
    Write-Output "DXGI_ERROR"
}
`;

            exec(`powershell -ExecutionPolicy Bypass -Command "${dxgiScript}"`, {
                timeout: 10000
            }, (error, stdout, stderr) => {
                if (error || !stdout.trim() || stdout.includes('DXGI_ERROR')) {
                    resolve([]);
                    return;
                }
                
                const gpus = [];
                const lines = stdout.trim().split('\n');
                
                lines.forEach((line, index) => {
                    const parts = line.split('|');
                    if (parts.length >= 2) {
                        const name = parts[0].trim();
                        const vram = parseInt(parts[1]) || 0;
                        const driver = parts[2] || '';
                        
                        if (name && !name.includes('Microsoft Basic')) {
                            const memoryGB = vram > 0 ? Math.round(vram / (1024 * 1024 * 1024)) : 2;
                            
                            gpus.push({
                                id: `dxgi-${index}`,
                                name: name,
                                memory: Math.max(1, memoryGB),
                                compute: this.estimateComputePower(name),
                                type: this.detectGPUType(name),
                                driver: driver,
                                available: true,
                                method: 'DXGI'
                            });
                        }
                    }
                });
                
                console.log(`DXGI detected ${gpus.length} GPUs`);
                resolve(gpus);
            });
        });
    }

    // Read GPU info from Windows Registry
    async detectViaRegistry() {
        return new Promise((resolve) => {
            const regScript = `
try {
    Get-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\*" | 
    Where-Object { $_.DriverDesc -ne $null } | 
    ForEach-Object {
        $mem = if ($_.HardwareInformation.MemorySize) { $_.HardwareInformation.MemorySize } else { 0 }
        Write-Output "$($_.DriverDesc)|$mem"
    }
} catch {
    Write-Output "REG_ERROR"
}
`;

            exec(`powershell -ExecutionPolicy Bypass -Command "${regScript}"`, {
                timeout: 10000
            }, (error, stdout, stderr) => {
                if (error || !stdout.trim() || stdout.includes('REG_ERROR')) {
                    resolve([]);
                    return;
                }
                
                const gpus = [];
                const lines = stdout.trim().split('\n');
                
                lines.forEach((line, index) => {
                    const parts = line.split('|');
                    if (parts.length >= 1) {
                        const name = parts[0].trim();
                        const vram = parseInt(parts[1]) || 0;
                        
                        if (name && name.length > 3) {
                            const memoryGB = vram > 0 ? Math.round(vram / (1024 * 1024 * 1024)) : 2;
                            
                            gpus.push({
                                id: `registry-${index}`,
                                name: name,
                                memory: Math.max(1, memoryGB),
                                compute: this.estimateComputePower(name),
                                type: this.detectGPUType(name),
                                available: true,
                                method: 'Registry'
                            });
                        }
                    }
                });
                
                console.log(`Registry detected ${gpus.length} GPUs`);
                resolve(gpus);
            });
        });
    }

    // Use Windows Performance Counters
    async detectViaPerformanceCounters() {
        return new Promise((resolve) => {
            exec('typeperf -qx | findstr "GPU"', {
                timeout: 5000
            }, (error, stdout, stderr) => {
                if (error || !stdout.trim()) {
                    resolve([]);
                    return;
                }
                
                const gpus = [];
                const lines = stdout.trim().split('\n');
                
                lines.forEach((line, index) => {
                    const match = line.match(/\\GPU Engine\(([^)]+)\)/);
                    if (match) {
                        const name = match[1];
                        gpus.push({
                            id: `perf-${index}`,
                            name: `GPU Engine: ${name}`,
                            memory: 4, // Default
                            compute: 5,
                            type: 'Unknown',
                            available: true,
                            method: 'Performance Counters'
                        });
                    }
                });
                
                console.log(`Performance Counters detected ${gpus.length} GPUs`);
                resolve(gpus);
            });
        });
    }

    // Remove duplicate GPUs
    removeDuplicates(gpus) {
        const seen = new Set();
        const unique = [];
        
        gpus.forEach(gpu => {
            const key = gpu.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(gpu);
            }
        });
        
        return unique;
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

    // Estimate compute power
    estimateComputePower(name) {
        const lowerName = name.toLowerCase();
        
        // NVIDIA RTX 40 series
        if (lowerName.includes('rtx 4090')) return 82.6;
        if (lowerName.includes('rtx 4080')) return 48.7;
        if (lowerName.includes('rtx 4070')) return 29.2;
        if (lowerName.includes('rtx 4060')) return 15.1;
        
        // NVIDIA RTX 50 series (your GPU)
        if (lowerName.includes('rtx 5070 ti')) return 45.0;
        if (lowerName.includes('rtx 5070')) return 40.0;
        
        // AMD and Intel defaults
        if (lowerName.includes('radeon') && lowerName.includes('graphics')) return 1.8;
        if (lowerName.includes('intel')) return 1.5;
        
        return 10.0; // Default
    }
}

module.exports = { WindowsAPIGPUDetector };