// VFT Platform - Error Recovery & Resilience System
// Comprehensive error handling and automatic recovery mechanisms

class ErrorRecoverySystem {
    constructor() {
        this.errorHistory = [];
        this.retryQueues = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.backoffMultiplier = 1.5;
        this.currentBackoff = 1000; // Start with 1 second
        this.healthCheckInterval = null;
        this.offlineQueue = [];
        this.isOnline = true;
        this.init();
    }

    init() {
        this.setupGlobalErrorHandlers();
        this.setupNetworkMonitoring();
        this.startHealthChecks();
        this.createStatusIndicator();
    }

    setupNetworkMonitoring() {
        // Monitor network connectivity - disabled to prevent console spam
        // Network status is handled by the main checkNetwork function
    }

    setupGlobalErrorHandlers() {
        // Global error handler
        window.addEventListener('error', (event) => {
            this.handleError({
                type: 'javascript-error',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error
            });
        });

        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError({
                type: 'unhandled-promise',
                message: event.reason?.message || event.reason,
                promise: event.promise
            });
        });

        // Network error handler
        window.addEventListener('online', () => this.handleNetworkRestore());
        window.addEventListener('offline', () => this.handleNetworkLoss());

        // Override fetch to add retry logic
        this.interceptFetch();
    }

    handleError(error) {
        // Log error
        console.error('[ErrorRecovery]', error);
        
        // Add to history
        this.errorHistory.push({
            ...error,
            timestamp: Date.now(),
            recovered: false
        });

        // Classify and handle error
        const errorClass = this.classifyError(error);
        
        switch (errorClass) {
            case 'network':
                this.handleNetworkError(error);
                break;
            case 'gpu':
                this.handleGPUError(error);
                break;
            case 'job':
                this.handleJobError(error);
                break;
            case 'wallet':
                this.handleWalletError(error);
                break;
            default:
                this.handleGenericError(error);
        }

        // Clean old errors (keep last 100)
        if (this.errorHistory.length > 100) {
            this.errorHistory = this.errorHistory.slice(-100);
        }
    }

    classifyError(error) {
        const message = error.message?.toLowerCase() || '';
        
        if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
            return 'network';
        } else if (message.includes('gpu') || message.includes('cuda') || message.includes('memory')) {
            return 'gpu';
        } else if (message.includes('job') || message.includes('task') || message.includes('processing')) {
            return 'job';
        } else if (message.includes('wallet') || message.includes('phantom') || message.includes('transaction')) {
            return 'wallet';
        }
        
        return 'generic';
    }

    async handleNetworkError(error) {
        // Show user-friendly notification
        window.uiFeedback?.toast('Network connection issue detected. Retrying...', 'warning', 5000);
        
        // Queue operations for retry
        if (error.operation) {
            this.queueForRetry('network', error.operation);
        }
        
        // Start reconnection attempts
        this.attemptReconnection();
    }

    async handleGPUError(error) {
        // Don't show error toast for routine GPU health checks - too noisy
        console.warn('GPU health check warning:', error.message);
        
        // Only show user notification for actual GPU failures, not routine checks
        if (error.message && !error.message.includes('health check') && !error.message.includes('unavailable')) {
            window.uiFeedback?.toast('GPU issue detected. Check hardware if mining fails.', 'warning', 5000);
        }
        
        // DO NOT automatically stop mining - let user decide
        // Mining may continue to work even with GPU health check warnings
        
        // Only attempt GPU reset for critical errors, not routine checks
        if (error.message && error.message.includes('critical')) {
            setTimeout(async () => {
                try {
                    await this.resetGPU();
                    window.uiFeedback?.toast('GPU reset completed', 'info');
                } catch (e) {
                    console.error('GPU reset failed:', e);
                }
            }, 5000);
        }
    }

    async handleJobError(error) {
        const jobId = error.jobId || 'unknown';
        
        window.uiFeedback?.toast(`Job error: ${error.message}`, 'error', 7000, [
            { text: 'Retry', callback: () => this.retryJob(jobId) },
            { text: 'Cancel', callback: () => this.cancelJob(jobId) }
        ]);
        
        // Mark job as failed in queue
        if (window.jobQueue) {
            const job = window.jobQueue.jobs.get(jobId);
            if (job) {
                job.status = 'failed';
                job.error = error.message;
                window.jobQueue.updateQueueDisplay();
            }
        }
    }

    async handleWalletError(error) {
        window.uiFeedback?.toast('Wallet connection error', 'error', 7000, [
            { text: 'Reconnect', callback: () => window.connectWallet?.() },
            { text: 'Help', callback: () => window.open('https://phantom.app/help', '_blank') }
        ]);
        
        // Update wallet button state
        const walletBtn = document.getElementById('connectWalletBtn');
        if (walletBtn && walletBtn.classList.contains('btn-success')) {
            walletBtn.classList.remove('btn-success');
            walletBtn.classList.add('btn-primary');
            walletBtn.textContent = 'Reconnect Wallet';
        }
    }

    handleGenericError(error) {
        // Log to console with full details
        console.error('Unhandled error:', error);
        
        // Show generic error message
        window.uiFeedback?.toast('An error occurred. The system will attempt to recover.', 'error', 5000);
        
        // Attempt generic recovery
        this.attemptGenericRecovery();
    }

    async attemptGenericRecovery() {
        // Generic recovery steps
        try {
            // 1. Clear any stuck states
            if (window.state && window.state.mining) {
                // Check if mining is actually running
                const miningBtn = document.getElementById('miningBtn');
                if (miningBtn && miningBtn.textContent === 'Start Mining') {
                    window.state.mining = false;
                }
            }
            
            // 2. Refresh critical components
            if (window.performanceMonitor) {
                window.performanceMonitor.cleanup();
                window.performanceMonitor = new PerformanceMonitor();
            }
            
            // 3. Re-check network status
            if (window.checkNetwork) {
                await window.checkNetwork();
            }
            
            // 4. Clear any error states in UI
            const errorElements = document.querySelectorAll('.error, .has-error');
            errorElements.forEach(el => {
                el.classList.remove('error', 'has-error');
            });
            
            console.log('Generic recovery completed');
        } catch (recoveryError) {
            console.error('Recovery failed:', recoveryError);
        }
    }

    async attemptReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            window.uiFeedback?.toast('Unable to reconnect. Please check your internet connection.', 'error', 10000);
            this.updateStatusIndicator('offline');
            return;
        }
        
        this.reconnectAttempts++;
        this.updateStatusIndicator('reconnecting');
        
        const progressId = window.uiFeedback?.createProgressBar('reconnect', `Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        try {
            // Test connection
            const response = await fetch('/api/health', { 
                method: 'GET',
                timeout: 5000 
            }).catch(() => null);
            
            if (response && response.ok) {
                // Connection restored
                this.reconnectAttempts = 0;
                this.currentBackoff = 1000;
                window.uiFeedback?.removeProgress(progressId);
                window.uiFeedback?.toast('Connection restored!', 'success');
                this.updateStatusIndicator('online');
                
                // Process offline queue
                this.processOfflineQueue();
            } else {
                throw new Error('Connection test failed');
            }
        } catch (error) {
            // Exponential backoff
            window.uiFeedback?.removeProgress(progressId);
            
            const nextAttemptIn = Math.round(this.currentBackoff / 1000);
            window.uiFeedback?.toast(`Reconnection failed. Retrying in ${nextAttemptIn} seconds...`, 'warning');
            
            setTimeout(() => {
                this.attemptReconnection();
            }, this.currentBackoff);
            
            this.currentBackoff *= this.backoffMultiplier;
        }
    }

    interceptFetch() {
        const originalFetch = window.fetch;
        
        window.fetch = async (...args) => {
            const [url, options = {}] = args;
            
            // Skip retry for certain endpoints
            const skipRetry = ['/api/health', '/api/status'].some(endpoint => url.includes(endpoint));
            
            if (skipRetry || !this.isOnline) {
                return originalFetch(...args);
            }
            
            // Add timeout
            const timeout = options.timeout || 30000;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            try {
                const response = await originalFetch(url, {
                    ...options,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                // Check for server errors
                if (response.status >= 500) {
                    throw new Error(`Server error: ${response.status}`);
                }
                
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                
                // Handle network errors with retry
                if (error.name === 'AbortError' || error.message.includes('network')) {
                    return this.retryFetch(url, options, 3);
                }
                
                throw error;
            }
        };
    }

    async retryFetch(url, options, maxRetries) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Wait before retry (exponential backoff)
                if (attempt > 1) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
                }
                
                const response = await fetch(url, { ...options, timeout: undefined });
                
                // Success - clear any error notifications
                return response;
            } catch (error) {
                lastError = error;
                
                if (attempt === maxRetries) {
                    // Final attempt failed
                    this.handleError({
                        type: 'network-error',
                        message: `Failed to fetch ${url} after ${maxRetries} attempts`,
                        error: error,
                        operation: { type: 'fetch', url, options }
                    });
                }
            }
        }
        
        throw lastError;
    }

    queueForRetry(type, operation) {
        if (!this.retryQueues.has(type)) {
            this.retryQueues.set(type, []);
        }
        
        this.retryQueues.get(type).push({
            operation,
            timestamp: Date.now(),
            attempts: 0
        });
        
        // If offline, add to offline queue
        if (!this.isOnline) {
            this.offlineQueue.push(operation);
        }
    }

    async processOfflineQueue() {
        if (this.offlineQueue.length === 0) return;
        
        window.uiFeedback?.toast(`Processing ${this.offlineQueue.length} queued operations...`, 'info');
        
        const queue = [...this.offlineQueue];
        this.offlineQueue = [];
        
        for (const operation of queue) {
            try {
                await this.executeOperation(operation);
            } catch (error) {
                console.error('Failed to process queued operation:', error);
                // Re-queue if still important
                if (this.isOperationCritical(operation)) {
                    this.offlineQueue.push(operation);
                }
            }
        }
        
        if (this.offlineQueue.length === 0) {
            window.uiFeedback?.toast('All queued operations processed successfully!', 'success');
        } else {
            window.uiFeedback?.toast(`${this.offlineQueue.length} operations still pending`, 'warning');
        }
    }

    async executeOperation(operation) {
        switch (operation.type) {
            case 'fetch':
                return fetch(operation.url, operation.options);
            case 'job-submit':
                return window.submitJob?.(operation.data);
            case 'wallet-connect':
                return window.connectWallet?.();
            default:
                console.warn('Unknown operation type:', operation.type);
        }
    }

    isOperationCritical(operation) {
        // Determine if operation should be retried
        const criticalTypes = ['job-submit', 'wallet-transaction', 'earnings-claim'];
        return criticalTypes.includes(operation.type);
    }

    async resetGPU() {
        // Simulate GPU reset
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Re-detect GPUs
        if (window.detectGPUs) {
            await window.detectGPUs();
        }
        
        return true;
    }

    async retryJob(jobId) {
        const job = window.jobQueue?.jobs.get(jobId);
        if (!job) return;
        
        // Reset job status
        job.status = 'pending';
        job.error = null;
        job.attempts = (job.attempts || 0) + 1;
        
        window.uiFeedback?.toast(`Retrying job "${job.name}"...`, 'info');
        
        // Re-submit job
        if (window.jobQueue) {
            await window.jobQueue.startJob(jobId);
        }
    }

    cancelJob(jobId) {
        if (window.jobQueue) {
            window.jobQueue.cancelJob(jobId);
        }
    }

    handleNetworkLoss() {
        this.isOnline = false;
        this.updateStatusIndicator('offline');
        
        window.uiFeedback?.toast('Network connection lost. Working in offline mode.', 'warning', 0);
        
        // Save current state
        this.saveOfflineState();
    }

    handleNetworkRestore() {
        this.isOnline = true;
        
        window.uiFeedback?.toast('Network connection restored!', 'success');
        
        // Process offline queue
        setTimeout(() => {
            this.processOfflineQueue();
            this.restoreOnlineState();
        }, 1000);
    }

    saveOfflineState() {
        try {
            // Check if window.state exists before accessing it
            const currentState = window.state || { mining: false };
            
            const offlineData = {
                jobs: Array.from(window.jobQueue?.jobs.entries() || []),
                earnings: window.rewardsDisplay?.totalEarnings || 0,
                miningActive: currentState.mining || false,
                timestamp: Date.now()
            };
            
            localStorage.setItem('vft-offline-state', JSON.stringify(offlineData));
        } catch (error) {
            console.error('Failed to save offline state:', error);
        }
    }

    restoreOnlineState() {
        try {
            const savedState = localStorage.getItem('vft-offline-state');
            if (!savedState) return;
            
            const offlineState = JSON.parse(savedState);
            
            // Restore jobs
            if (offlineState.jobs && window.jobQueue) {
                offlineState.jobs.forEach(([id, job]) => {
                    if (!window.jobQueue.jobs.has(id)) {
                        window.jobQueue.jobs.set(id, job);
                    }
                });
                window.jobQueue.updateQueueDisplay();
            }
            
            // Clear saved state
            localStorage.removeItem('vft-offline-state');
            
            window.uiFeedback?.toast('Offline state restored', 'info');
        } catch (error) {
            console.error('Failed to restore offline state:', error);
        }
    }

    startHealthChecks() {
        // Periodic health checks
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, 30000); // Every 30 seconds
    }

    async performHealthCheck() {
        const health = {
            memory: this.checkMemoryHealth(),
            gpu: await this.checkGPUHealth(),
            network: await this.checkNetworkHealth(),
            storage: this.checkStorageHealth()
        };
        
        // Take action on critical issues only
        if (health.memory.status === 'critical') {
            this.handleMemoryPressure();
        }
        
        // Only handle GPU errors that are actually critical, not warnings
        if (health.gpu.status === 'error' && health.gpu.message && health.gpu.message.includes('critical')) {
            this.handleGPUError({ message: health.gpu.message });
        }
        
        // Update UI indicator
        this.updateHealthIndicator(health);
    }

    checkMemoryHealth() {
        if (!performance.memory) {
            return { status: 'unknown', message: 'Memory API not available' };
        }
        
        const used = performance.memory.usedJSHeapSize;
        const total = performance.memory.jsHeapSizeLimit;
        const percentage = (used / total) * 100;
        
        if (percentage > 90) {
            return { status: 'critical', percentage, message: 'Memory usage critical' };
        } else if (percentage > 70) {
            return { status: 'warning', percentage, message: 'Memory usage high' };
        }
        
        return { status: 'ok', percentage, message: 'Memory usage normal' };
    }

    async checkGPUHealth() {
        try {
            // Get REAL GPU health from backend
            const health = await window.vftAPI?.getGPUHealth();
            
            if (!health) {
                // Don't report as error - just unavailable
                return { status: 'ok', message: 'GPU health check unavailable' };
            }
            
            if (health.status === 'error') {
                // Only report critical GPU errors, not routine issues
                return { status: 'warning', message: health.message || 'GPU health check warning' };
            }
            
            return { status: health.status || 'ok', message: health.message || 'GPU functioning normally' };
        } catch (error) {
            // Don't report health check failures as GPU errors
            return { status: 'ok', message: 'GPU health check unavailable' };
        }
    }

    async checkNetworkHealth() {
        try {
            // Skip network health check if running in file:// protocol or offline mode
            if (window.location.protocol === 'file:' || !this.isOnline) {
                return { status: 'ok', message: 'Offline mode' };
            }
            
            // Don't spam network checks
            return { status: 'ok', message: 'Network monitoring disabled' };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }

    checkStorageHealth() {
        try {
            // Check localStorage usage
            const used = new Blob(Object.values(localStorage)).size;
            const estimatedMax = 10 * 1024 * 1024; // 10MB estimate
            const percentage = (used / estimatedMax) * 100;
            
            if (percentage > 80) {
                return { status: 'warning', percentage, message: 'Storage nearly full' };
            }
            
            return { status: 'ok', percentage, message: 'Storage healthy' };
        } catch (error) {
            return { status: 'unknown', message: 'Storage check failed' };
        }
    }

    handleMemoryPressure() {
        // Clear caches
        this.errorHistory = this.errorHistory.slice(-50);
        
        // Clear old data
        if (window.jobQueue) {
            const oldJobs = Array.from(window.jobQueue.jobs.entries())
                .filter(([id, job]) => job.status === 'completed' && Date.now() - job.completedTime > 3600000);
            
            oldJobs.forEach(([id]) => window.jobQueue.jobs.delete(id));
        }
        
        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
        
        window.uiFeedback?.toast('Memory optimization completed', 'info');
    }

    createStatusIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'system-health-indicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--success);
            box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
            z-index: 9999;
            cursor: pointer;
            transition: all 0.3s;
        `;
        
        indicator.title = 'System healthy';
        indicator.onclick = () => this.showHealthReport();
        
        document.body.appendChild(indicator);
    }

    updateStatusIndicator(status) {
        const indicator = document.getElementById('system-health-indicator');
        if (!indicator) return;
        
        const statusConfig = {
            online: { color: 'var(--success)', title: 'System healthy' },
            offline: { color: 'var(--error)', title: 'Offline mode' },
            reconnecting: { color: 'var(--warning)', title: 'Reconnecting...' },
            warning: { color: 'var(--warning)', title: 'System warning' },
            error: { color: 'var(--error)', title: 'System error' }
        };
        
        const config = statusConfig[status] || statusConfig.online;
        indicator.style.background = config.color;
        indicator.title = config.title;
        
        // Add pulsing animation for warnings/errors
        if (status === 'warning' || status === 'error' || status === 'reconnecting') {
            indicator.style.animation = 'pulse 2s infinite';
        } else {
            indicator.style.animation = 'none';
        }
    }

    updateHealthIndicator(health) {
        // Determine overall system health
        const statuses = Object.values(health).map(h => h.status);
        
        if (statuses.includes('error') || statuses.includes('critical')) {
            this.updateStatusIndicator('error');
        } else if (statuses.includes('warning')) {
            this.updateStatusIndicator('warning');
        } else {
            this.updateStatusIndicator('online');
        }
    }

    showHealthReport() {
        const report = this.generateHealthReport();
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <i class="fas fa-heartbeat"></i> System Health Report
                    <button class="modal-close-btn" onclick="this.parentElement.parentElement.parentElement.remove()" style="float:right; background:none; border:none; font-size:22px; cursor:pointer; color:#fff;">×</button>
                </div>
                
                ${report}
                
                <div class="btn-group" style="margin-top: 24px;">
                    <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    generateHealthReport() {
        const errorCount = this.errorHistory.filter(e => Date.now() - e.timestamp < 3600000).length;
        const uptime = Date.now() - (window.appStartTime || Date.now());
        const uptimeHours = Math.floor(uptime / 3600000);
        const uptimeMinutes = Math.floor((uptime % 3600000) / 60000);
        
        return `
            <div class="health-report">
                <div class="health-section">
                    <h5>System Status</h5>
                    <div class="health-item">
                        <span>Network:</span>
                        <span class="${this.isOnline ? 'text-success' : 'text-error'}">${this.isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                    <div class="health-item">
                        <span>Uptime:</span>
                        <span>${uptimeHours}h ${uptimeMinutes}m</span>
                    </div>
                    <div class="health-item">
                        <span>Errors (last hour):</span>
                        <span class="${errorCount > 10 ? 'text-error' : 'text-success'}">${errorCount}</span>
                    </div>
                </div>
                
                <div class="health-section">
                    <h5>Contact Support</h5>
                    <p>For technical support or issues, contact:<br>
                    <a href="mailto:thomas@vftchain.com" style="color: var(--primary);">thomas@vftchain.com</a></p>
                </div>
            </div>
        `;
    }

    getRecentIssues() {
        const recentErrors = this.errorHistory.slice(-5).reverse();
        
        if (recentErrors.length === 0) {
            return '<p style="color: var(--text-dim);">No recent issues</p>';
        }
        
        return recentErrors.map(error => `
            <div style="margin-bottom: 8px; padding: 8px; background: var(--bg-dark); border-radius: 4px;">
                <div style="font-size: 12px; color: var(--text-dim);">${new Date(error.timestamp).toLocaleTimeString()}</div>
                <div style="font-size: 13px;">${error.message}</div>
            </div>
        `).join('');
    }

    clearErrorHistory() {
        this.errorHistory = [];
        window.uiFeedback?.toast('Error history cleared', 'success');
        document.querySelector('.modal')?.remove();
    }

    resetAllSystems() {
        window.uiFeedback?.toast('Resetting all systems...', 'loading', 3000);
        
        setTimeout(() => {
            // Clear all intervals
            if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
            if (window.performanceMonitor) window.performanceMonitor.cleanup();
            if (window.rewardsDisplay) window.rewardsDisplay.cleanup();
            if (window.jobQueue) window.jobQueue.stopQueueMonitoring();
            
            // Reload page
            window.location.reload();
        }, 3000);
    }

    exportDiagnostics() {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            systemInfo: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                memory: performance.memory,
                connection: navigator.connection
            },
            errorHistory: this.errorHistory,
            health: {
                isOnline: this.isOnline,
                reconnectAttempts: this.reconnectAttempts,
                offlineQueueSize: this.offlineQueue.length
            }
        };
        
        const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vft-diagnostics-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        window.uiFeedback?.toast('Diagnostics exported', 'success');
    }

    cleanup() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
    }
}

// Create global instance
window.errorRecovery = new ErrorRecoverySystem();

// Track app start time
window.appStartTime = Date.now();

// Add styles
const errorStyles = document.createElement('style');
errorStyles.textContent = `
    @keyframes pulse {
        0% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(1.2); }
        100% { opacity: 1; transform: scale(1); }
    }
    
    .health-report {
        max-height: 400px;
        overflow-y: auto;
    }
    
    .health-section {
        margin-bottom: 20px;
        padding-bottom: 20px;
        border-bottom: 1px solid var(--border);
    }
    
    .health-section:last-child {
        border-bottom: none;
    }
    
    .health-section h5 {
        margin-bottom: 12px;
        color: var(--primary);
    }
    
    .health-item {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        font-size: 14px;
    }
    
    .text-success { color: var(--success); }
    .text-error { color: var(--error); }
    .text-warning { color: var(--warning); }
`;
document.head.appendChild(errorStyles);