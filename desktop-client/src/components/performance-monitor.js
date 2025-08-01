// VFT Platform - Performance Monitoring System
// Real-time GPU and system performance tracking

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            gpu: { usage: 0, memory: 0, temperature: 0 },
            cpu: { usage: 0, cores: 0 },
            memory: { used: 0, total: 0 },
            network: { upload: 0, download: 0 }
        };
        this.charts = {};
        this.updateInterval = null;
        this.historyLength = 60; // 60 data points
        this.history = {
            gpu: [],
            cpu: [],
            memory: [],
            network: []
        };
        this.init();
    }

    init() {
        this.createPerformanceWidget();
        this.startMonitoring();
        this.setupEventListeners();
    }

    createPerformanceWidget() {
        // Create performance monitoring panel
        const panel = document.createElement('div');
        panel.id = 'performance-panel';
        panel.className = 'performance-panel';
        panel.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            width: 320px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 999;
            display: none;
            overflow: hidden;
        `;
        
        panel.innerHTML = `
            <div class="perf-header" style="padding: 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                <h4 style="margin: 0; font-size: 16px;">
                    <i class="fas fa-tachometer-alt" style="color: var(--primary);"></i> Performance Monitor
                </h4>
                <button id="close-perf-monitor" style="background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 18px;">×</button>
            </div>
            
            <div class="perf-content" style="padding: 16px;">
                <!-- GPU Metrics -->
                <div class="metric-section" style="margin-bottom: 20px;">
                    <h5 style="margin: 0 0 12px 0; font-size: 14px; color: var(--text-dim);">GPU Performance</h5>
                    <div class="metric-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                        <div class="metric-card mini">
                            <div class="metric-value" id="gpu-usage">0%</div>
                            <div class="metric-label">Usage</div>
                        </div>
                        <div class="metric-card mini">
                            <div class="metric-value" id="gpu-temp">0°C</div>
                            <div class="metric-label">Temp</div>
                        </div>
                        <div class="metric-card mini">
                            <div class="metric-value" id="gpu-memory">0%</div>
                            <div class="metric-label">VRAM</div>
                        </div>
                    </div>
                    <canvas id="gpu-chart" width="288" height="80" style="margin-top: 12px;"></canvas>
                </div>
                
                <!-- System Metrics -->
                <div class="metric-section" style="margin-bottom: 20px;">
                    <h5 style="margin: 0 0 12px 0; font-size: 14px; color: var(--text-dim);">System Resources</h5>
                    <div class="resource-bars">
                        <div class="resource-item" style="margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                                <span>CPU</span>
                                <span id="cpu-usage-text">0%</span>
                            </div>
                            <div class="progress-bar-bg" style="background: var(--bg-dark); height: 6px; border-radius: 3px; overflow: hidden;">
                                <div id="cpu-usage-bar" class="progress-bar-fill" style="width: 0%; background: var(--primary); height: 100%; transition: width 0.3s;"></div>
                            </div>
                        </div>
                        <div class="resource-item" style="margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                                <span>Memory</span>
                                <span id="memory-usage-text">0 GB / 0 GB</span>
                            </div>
                            <div class="progress-bar-bg" style="background: var(--bg-dark); height: 6px; border-radius: 3px; overflow: hidden;">
                                <div id="memory-usage-bar" class="progress-bar-fill" style="width: 0%; background: var(--secondary); height: 100%; transition: width 0.3s;"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Network Activity -->
                <div class="metric-section">
                    <h5 style="margin: 0 0 12px 0; font-size: 14px; color: var(--text-dim);">Network Activity</h5>
                    <div style="text-align: center; padding: 12px 0;">
                        <p style="color: var(--text-dim); font-size: 13px;">P2P network activity</p>
                    </div>
                </div>
                
                <!-- Alerts -->
                <div id="perf-alerts" style="margin-top: 16px; display: none;">
                    <div class="alert alert-warning" style="padding: 8px 12px; background: rgba(245, 158, 11, 0.2); border: 1px solid var(--warning); border-radius: 6px; font-size: 12px;">
                        <i class="fas fa-exclamation-triangle"></i> <span id="alert-message"></span>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // Initialize GPU usage chart
        this.initializeChart();
    }

    initializeChart() {
        const canvas = document.getElementById('gpu-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        this.charts.gpu = {
            ctx: ctx,
            width: canvas.width,
            height: canvas.height
        };
    }

    startMonitoring() {
        // Update metrics every second
        this.updateInterval = setInterval(() => {
            this.updateMetrics();
            this.checkAlerts();
        }, 1000);
        
        // Initial update
        this.updateMetrics();
    }

    updateMetrics() {
        // Get REAL metrics from backend
        window.vftAPI?.getSystemMetrics().then(metrics => {
            if (!metrics) return;
            
            // Update with real data
            this.metrics.gpu.usage = metrics.gpu?.usage || 0;
            this.metrics.gpu.temperature = metrics.gpu?.temperature || 0;
            this.metrics.gpu.memory = metrics.gpu?.memoryUsage || 0;
            this.metrics.cpu.usage = metrics.cpu?.usage || 0;
            this.metrics.memory.total = metrics.memory?.total || 16;
            this.metrics.memory.used = metrics.memory?.used || 0;
            this.metrics.network.upload = 0; // Don't show fake network data
            this.metrics.network.download = 0;
            
            // Update history
            this.updateHistory();
            
            // Update UI
            this.updateUI();
            
            // Update chart
            this.updateChart();
        }).catch(err => {
            console.error('Failed to fetch system metrics:', err);
        });
    }

    updateHistory() {
        // Add current metrics to history
        this.history.gpu.push(this.metrics.gpu.usage);
        
        // Keep only last N data points
        if (this.history.gpu.length > this.historyLength) {
            this.history.gpu.shift();
        }
    }

    updateUI() {
        // GPU metrics
        const gpuUsageEl = document.getElementById('gpu-usage');
        const gpuTempEl = document.getElementById('gpu-temp');
        const gpuMemoryEl = document.getElementById('gpu-memory');
        
        if (gpuUsageEl) gpuUsageEl.textContent = `${Math.round(this.metrics.gpu.usage)}%`;
        if (gpuTempEl) gpuTempEl.textContent = `${Math.round(this.metrics.gpu.temperature)}°C`;
        if (gpuMemoryEl) gpuMemoryEl.textContent = `${Math.round(this.metrics.gpu.memory)}%`;
        
        // Apply color coding for temperature
        if (gpuTempEl) {
            if (this.metrics.gpu.temperature > 80) {
                gpuTempEl.style.color = 'var(--error)';
            } else if (this.metrics.gpu.temperature > 70) {
                gpuTempEl.style.color = 'var(--warning)';
            } else {
                gpuTempEl.style.color = 'var(--success)';
            }
        }
        
        // CPU usage
        const cpuUsageBar = document.getElementById('cpu-usage-bar');
        const cpuUsageText = document.getElementById('cpu-usage-text');
        
        if (cpuUsageBar) cpuUsageBar.style.width = `${this.metrics.cpu.usage}%`;
        if (cpuUsageText) cpuUsageText.textContent = `${Math.round(this.metrics.cpu.usage)}%`;
        
        // Memory usage
        const memoryUsageBar = document.getElementById('memory-usage-bar');
        const memoryUsageText = document.getElementById('memory-usage-text');
        const memoryPercent = (this.metrics.memory.used / this.metrics.memory.total) * 100;
        
        if (memoryUsageBar) memoryUsageBar.style.width = `${memoryPercent}%`;
        if (memoryUsageText) memoryUsageText.textContent = `${this.metrics.memory.used.toFixed(1)} GB / ${this.metrics.memory.total} GB`;
        
        // Network activity removed - no fake data
    }

    updateChart() {
        const chart = this.charts.gpu;
        if (!chart || !chart.ctx) return;
        
        const ctx = chart.ctx;
        const width = chart.width;
        const height = chart.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw background grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        
        // Horizontal lines
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Draw usage line
        if (this.history.gpu.length > 1) {
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, 'rgba(59, 130, 246, 0.8)');
            gradient.addColorStop(1, 'rgba(59, 130, 246, 0.1)');
            
            ctx.fillStyle = gradient;
            ctx.strokeStyle = '#3B82F6';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.moveTo(0, height);
            
            for (let i = 0; i < this.history.gpu.length; i++) {
                const x = (width / (this.historyLength - 1)) * i;
                const y = height - (this.history.gpu[i] / 100) * height;
                
                if (i === 0) {
                    ctx.lineTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            // Complete the fill area
            ctx.lineTo(width, height);
            ctx.closePath();
            ctx.fill();
            
            // Draw the line
            ctx.beginPath();
            for (let i = 0; i < this.history.gpu.length; i++) {
                const x = (width / (this.historyLength - 1)) * i;
                const y = height - (this.history.gpu[i] / 100) * height;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
        
        // Draw labels
        ctx.fillStyle = 'var(--text-dim)';
        ctx.font = '10px sans-serif';
        ctx.fillText('100%', 2, 10);
        ctx.fillText('0%', 2, height - 2);
        ctx.fillText('60s ago', 2, height - 12);
        ctx.fillText('Now', width - 20, height - 12);
    }

    checkAlerts() {
        const alerts = [];
        
        // Temperature alert
        if (this.metrics.gpu.temperature > 80) {
            alerts.push('GPU temperature is high! Consider improving cooling.');
        }
        
        // Memory alert
        const memoryPercent = (this.metrics.memory.used / this.metrics.memory.total) * 100;
        if (memoryPercent > 90) {
            alerts.push('System memory usage is critical!');
        }
        
        // Show/hide alerts
        const alertsEl = document.getElementById('perf-alerts');
        const alertMessage = document.getElementById('alert-message');
        
        if (alerts.length > 0 && alertsEl && alertMessage) {
            alertsEl.style.display = 'block';
            alertMessage.textContent = alerts[0];
        } else if (alertsEl) {
            alertsEl.style.display = 'none';
        }
    }

    show() {
        const panel = document.getElementById('performance-panel');
        if (panel) {
            panel.style.display = 'block';
            // Animate in
            panel.style.transform = 'translateX(400px)';
            panel.style.opacity = '0';
            setTimeout(() => {
                panel.style.transition = 'all 0.3s ease-out';
                panel.style.transform = 'translateX(0)';
                panel.style.opacity = '1';
            }, 10);
        }
    }

    hide() {
        const panel = document.getElementById('performance-panel');
        if (panel) {
            panel.style.transform = 'translateX(400px)';
            panel.style.opacity = '0';
            setTimeout(() => {
                panel.style.display = 'none';
            }, 300);
        }
    }

    setupEventListeners() {
        // Close button
        document.getElementById('close-perf-monitor')?.addEventListener('click', () => {
            this.hide();
        });
        
        // Show performance monitor when mining starts
        window.addEventListener('mining-state-changed', (event) => {
            if (event.detail.mining) {
                setTimeout(() => this.show(), 1000);
            }
        });
    }

    exportMetrics() {
        const data = {
            timestamp: new Date().toISOString(),
            metrics: this.metrics,
            history: this.history
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vft-performance-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        window.uiFeedback?.toast('Performance metrics exported', 'success');
    }

    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}

// Create global instance
window.performanceMonitor = new PerformanceMonitor();

// Add performance monitor toggle button
function addPerformanceToggle() {
    // Button is now added directly in HTML
}

// Add toggle button when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addPerformanceToggle);
} else {
    addPerformanceToggle();
}

// Add styles for performance monitor
const perfStyles = document.createElement('style');
perfStyles.textContent = `
    .metric-card.mini {
        background: var(--bg-dark);
        padding: 8px;
        border-radius: 6px;
        text-align: center;
    }
    
    .metric-card.mini .metric-value {
        font-size: 18px;
        font-weight: 600;
        color: var(--primary);
    }
    
    .metric-card.mini .metric-label {
        font-size: 11px;
        color: var(--text-dim);
        margin-top: 2px;
    }
    
    .performance-panel {
        transition: all 0.3s ease-out;
    }
    
    #gpu-chart {
        border: 1px solid var(--border);
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.3);
    }
`;
document.head.appendChild(perfStyles);