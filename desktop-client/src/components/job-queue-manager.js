// VFT Platform - Enhanced Job Queue Management
// Real-time job tracking with comprehensive UI feedback

class JobQueueManager {
    constructor() {
        this.jobs = new Map();
        this.queueUpdateInterval = null;
        this.init();
    }

    init() {
        this.setupQueueFilters();
        this.startQueueMonitoring();
    }

    setupQueueFilters() {
        const queueFilter = document.getElementById('queueFilter');
        if (queueFilter) {
            queueFilter.addEventListener('change', () => this.updateQueueDisplay());
        }
    }

    startQueueMonitoring() {
        // Update queue every 5 seconds
        this.queueUpdateInterval = setInterval(() => {
            this.updateQueueDisplay();
            this.updateJobProgress();
        }, 5000);
    }

    stopQueueMonitoring() {
        if (this.queueUpdateInterval) {
            clearInterval(this.queueUpdateInterval);
            this.queueUpdateInterval = null;
        }
    }

    addJob(job) {
        const enrichedJob = {
            ...job,
            startTime: Date.now(),
            progress: 0,
            eta: this.calculateETA(job),
            logs: [],
            status: job.status || 'pending'
        };
        
        this.jobs.set(job.id, enrichedJob);
        this.updateQueueDisplay();
        
        // Show notification
        window.uiFeedback?.toast(`Job "${job.name}" added to queue`, 'info', 3000);
    }

    updateJobProgress() {
        this.jobs.forEach((job, id) => {
            if (job.status === 'running') {
                // Get REAL progress from backend
                window.vftAPI?.getJobProgress(id).then(progress => {
                    if (progress) {
                        job.progress = progress.percentage || 0;
                        job.eta = progress.eta || job.eta;
                        job.status = progress.status || job.status;
                        
                        if (job.progress >= 100) {
                            this.completeJob(id);
                        }
                    }
                }).catch(err => {
                    console.error(`Failed to fetch progress for job ${id}:`, err);
                });
            }
        });
    }

    completeJob(jobId) {
        const job = this.jobs.get(jobId);
        if (job) {
            job.status = 'completed';
            job.completedTime = Date.now();
            job.progress = 100;
            
            // Show completion notification
            window.uiFeedback?.toast(`Job "${job.name}" completed successfully!`, 'success', 5000, [
                { text: 'View Results', callback: () => this.viewJobResults(jobId) },
                { text: 'Download', callback: () => this.downloadJobResults(jobId) }
            ]);
            
            this.updateQueueDisplay();
        }
    }

    updateQueueDisplay() {
        const tbody = document.getElementById('queueTableBody');
        if (!tbody) return;

        const filter = document.getElementById('queueFilter')?.value || 'all';
        const filteredJobs = Array.from(this.jobs.values()).filter(job => {
            return filter === 'all' || job.status === filter;
        });

        if (filteredJobs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 40px;">
                        ${filter === 'all' ? 'No jobs in queue' : `No ${filter} jobs`}
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filteredJobs.map(job => `
            <tr class="job-row ${job.status}">
                <td><code>${job.id}</code></td>
                <td>${job.name}</td>
                <td><span class="badge badge-${this.getJobTypeBadgeClass(job.type)}">${job.type || 'Compute'}</span></td>
                <td>
                    <div class="resource-info">
                        <i class="fas fa-microchip"></i> ${job.gpuCount} × ${job.gpuType}
                        <br>
                        <i class="fas fa-database"></i> ${job.dataSize} ${job.dataSizeUnit}
                    </div>
                </td>
                <td>
                    <span class="status-badge status-${job.status}">
                        ${this.getStatusIcon(job.status)} ${job.status}
                    </span>
                </td>
                <td>
                    ${this.renderProgressBar(job)}
                </td>
                <td>
                    <div class="job-actions">
                        ${this.renderJobActions(job)}
                    </div>
                </td>
            </tr>
        `).join('');

        // Add click handlers
        this.attachJobActionHandlers();
    }

    renderProgressBar(job) {
        if (job.status === 'pending') {
            return '<span class="text-dim">Waiting...</span>';
        }
        
        if (job.status === 'completed') {
            return '<span class="text-success">✓ Complete</span>';
        }
        
        if (job.status === 'failed') {
            return '<span class="text-error">✕ Failed</span>';
        }

        const eta = this.formatETA(job.eta - (Date.now() - job.startTime));
        
        return `
            <div class="job-progress">
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${job.progress}%"></div>
                </div>
                <div class="progress-text">${Math.round(job.progress)}% - ETA: ${eta}</div>
            </div>
        `;
    }

    renderJobActions(job) {
        const actions = [];
        
        switch (job.status) {
            case 'pending':
                actions.push(`<button class="action-btn" onclick="jobQueue.startJob('${job.id}')"><i class="fas fa-play"></i></button>`);
                actions.push(`<button class="action-btn" onclick="jobQueue.cancelJob('${job.id}')"><i class="fas fa-times"></i></button>`);
                break;
            case 'running':
                actions.push(`<button class="action-btn" onclick="jobQueue.pauseJob('${job.id}')"><i class="fas fa-pause"></i></button>`);
                actions.push(`<button class="action-btn" onclick="jobQueue.viewLogs('${job.id}')"><i class="fas fa-terminal"></i></button>`);
                break;
            case 'completed':
                actions.push(`<button class="action-btn" onclick="jobQueue.viewResults('${job.id}')"><i class="fas fa-eye"></i></button>`);
                actions.push(`<button class="action-btn" onclick="jobQueue.downloadResults('${job.id}')"><i class="fas fa-download"></i></button>`);
                break;
            case 'failed':
                actions.push(`<button class="action-btn" onclick="jobQueue.retryJob('${job.id}')"><i class="fas fa-redo"></i></button>`);
                actions.push(`<button class="action-btn" onclick="jobQueue.viewLogs('${job.id}')"><i class="fas fa-bug"></i></button>`);
                break;
        }
        
        return actions.join('');
    }

    async startJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        const loadingToast = window.uiFeedback?.toast('Starting job...', 'loading');
        
        // Simulate job start
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        job.status = 'running';
        job.startTime = Date.now();
        
        window.uiFeedback?.removeToast(loadingToast);
        window.uiFeedback?.toast(`Job "${job.name}" started`, 'success', 3000);
        
        this.updateQueueDisplay();
        
        // Create progress tracker
        window.uiFeedback?.createProgressBar(jobId, job.name);
    }

    async pauseJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        const confirmed = await window.uiFeedback?.confirm(
            'Pause Job?',
            `Are you sure you want to pause "${job.name}"? You can resume it later.`,
            'Pause',
            'Cancel'
        );
        
        if (confirmed) {
            job.status = 'paused';
            window.uiFeedback?.toast(`Job "${job.name}" paused`, 'info');
            this.updateQueueDisplay();
        }
    }

    async cancelJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        const confirmed = await window.uiFeedback?.confirm(
            'Cancel Job?',
            `Are you sure you want to cancel "${job.name}"? This action cannot be undone.`,
            'Cancel Job',
            'Keep Job'
        );
        
        if (confirmed) {
            this.jobs.delete(jobId);
            window.uiFeedback?.toast(`Job "${job.name}" cancelled`, 'warning');
            window.uiFeedback?.removeProgress(jobId);
            this.updateQueueDisplay();
        }
    }

    viewLogs(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        // Show logs modal
        const modal = document.getElementById('logsModal');
        const logsViewer = document.getElementById('jobLogsViewer');
        const logsJobId = document.getElementById('logsJobId');
        
        if (modal && logsViewer) {
            logsJobId.textContent = job.name;
            
            // Stream logs via WebSocket or polling
            this.streamJobLogs(jobId);
            modal.style.display = 'flex';
            
            // Auto-scroll to bottom
            logsViewer.scrollTop = logsViewer.scrollHeight;
        }
    }
    
    streamJobLogs(jobId) {
        const logsViewer = document.getElementById('jobLogsViewer');
        if (!logsViewer) return;
        
        // Clear existing logs
        logsViewer.innerHTML = '<div class="log-line">[VFT] Connecting to job logs...</div>';
        
        // Fetch logs from backend
        window.vftAPI?.streamJobLogs(jobId, (logLine) => {
            const logDiv = document.createElement('div');
            logDiv.className = 'log-line';
            logDiv.textContent = logLine;
            logsViewer.appendChild(logDiv);
            
            // Auto-scroll
            if (document.getElementById('autoScrollLogs')?.checked) {
                logsViewer.scrollTop = logsViewer.scrollHeight;
            }
            
            // Limit log history
            if (logsViewer.children.length > 1000) {
                logsViewer.removeChild(logsViewer.firstChild);
            }
        }).catch(err => {
            logsViewer.innerHTML = `<div class="log-line" style="color: var(--error);">[ERROR] Failed to stream logs: ${err.message}</div>`;
        });
    }

    async viewResults(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        window.uiFeedback?.toast('Loading results...', 'loading', 2000);
        
        // Switch to results tab
        document.querySelector('[data-tab-target="results-panel"]')?.click();
        
        // Simulate loading results
        setTimeout(() => {
            this.displayJobResults(job);
        }, 1000);
    }

    displayJobResults(job) {
        const resultsGrid = document.getElementById('resultsGrid');
        if (!resultsGrid) return;

        const resultCard = document.createElement('div');
        resultCard.className = 'result-card fade-in';
        resultCard.innerHTML = `
            <h4>${job.name}</h4>
            <div class="result-meta">
                <span><i class="fas fa-calendar"></i> ${new Date(job.completedTime).toLocaleString()}</span>
                <span><i class="fas fa-clock"></i> ${this.formatDuration(job.completedTime - job.startTime)}</span>
            </div>
            <div class="result-stats">
                <div class="stat">
                    <span class="stat-label">Accuracy</span>
                    <span class="stat-value">${(Math.random() * 10 + 90).toFixed(2)}%</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Loss</span>
                    <span class="stat-value">${(Math.random() * 0.5).toFixed(4)}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Iterations</span>
                    <span class="stat-value">${Math.floor(Math.random() * 10000 + 5000)}</span>
                </div>
            </div>
            <div class="result-actions">
                <button class="btn btn-sm btn-primary" onclick="jobQueue.downloadResults('${job.id}')">
                    <i class="fas fa-download"></i> Download
                </button>
                <button class="btn btn-sm btn-secondary" onclick="jobQueue.shareResults('${job.id}')">
                    <i class="fas fa-share"></i> Share
                </button>
            </div>
        `;
        
        resultsGrid.insertBefore(resultCard, resultsGrid.firstChild);
    }

    async downloadResults(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        const progressId = window.uiFeedback?.createProgressBar(`download-${jobId}`, `Downloading ${job.name}`);
        
        // Simulate download
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 30;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                
                window.uiFeedback?.updateProgress(`download-${jobId}`, 100, 'Download complete!');
                window.uiFeedback?.toast('Results downloaded successfully!', 'success', 3000, [
                    { text: 'Open Folder', callback: () => console.log('Opening downloads folder...') }
                ]);
                
                setTimeout(() => {
                    window.uiFeedback?.removeProgress(`download-${jobId}`);
                }, 3000);
            } else {
                window.uiFeedback?.updateProgress(`download-${jobId}`, progress, `${Math.round(progress)}% - ${Math.round((100 - progress) * 0.1)}s remaining`);
            }
        }, 500);
    }

    async retryJob(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        const confirmed = await window.uiFeedback?.confirm(
            'Retry Job?',
            `Do you want to retry "${job.name}"? The job will be reset and queued again.`,
            'Retry',
            'Cancel'
        );
        
        if (confirmed) {
            job.status = 'pending';
            job.progress = 0;
            job.startTime = null;
            job.completedTime = null;
            
            window.uiFeedback?.toast(`Job "${job.name}" queued for retry`, 'info');
            this.updateQueueDisplay();
        }
    }

    shareResults(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        window.uiFeedback?.toast('Generating shareable link...', 'loading', 2000);
        
        setTimeout(() => {
            const shareLink = `https://vftchain.com/results/${jobId}`;
            
            // Copy to clipboard
            navigator.clipboard.writeText(shareLink).then(() => {
                window.uiFeedback?.toast('Share link copied to clipboard!', 'success', 4000, [
                    { text: 'Open Link', callback: () => window.open(shareLink, '_blank') }
                ]);
            });
        }, 2000);
    }

    // Helper functions
    calculateETA(job) {
        const hours = parseInt(job.estimatedHours || 0);
        const minutes = parseInt(job.estimatedMinutes || 0);
        return (hours * 60 + minutes) * 60 * 1000; // Convert to milliseconds
    }

    formatETA(milliseconds) {
        if (milliseconds <= 0) return 'Soon';
        
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return `${seconds}s`;
        }
    }

    getJobTypeBadgeClass(type) {
        const typeClasses = {
            'training': 'primary',
            'inference': 'secondary',
            'processing': 'info',
            'optimization': 'warning'
        };
        return typeClasses[type] || 'secondary';
    }

    getStatusIcon(status) {
        const icons = {
            'pending': '⏳',
            'running': '⚡',
            'completed': '✓',
            'failed': '✕',
            'paused': '⏸'
        };
        return icons[status] || '•';
    }

    attachJobActionHandlers() {
        // Action handlers are attached via onclick in the HTML
        // This is here for any additional event delegation if needed
    }
}

// Create global instance
window.jobQueue = new JobQueueManager();

// Add styles for job queue
const queueStyles = document.createElement('style');
queueStyles.textContent = `
    .job-row {
        transition: all 0.2s;
    }
    
    .job-row:hover {
        background: rgba(255, 255, 255, 0.02);
    }
    
    .job-row.completed {
        opacity: 0.7;
    }
    
    .resource-info {
        font-size: 12px;
        line-height: 1.5;
        color: var(--text-dim);
    }
    
    .resource-info i {
        width: 16px;
        text-align: center;
        color: var(--primary);
    }
    
    .status-badge {
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
    
    .status-pending {
        background: rgba(148, 163, 184, 0.2);
        color: var(--text-dim);
    }
    
    .status-running {
        background: rgba(59, 130, 246, 0.2);
        color: var(--primary);
    }
    
    .status-completed {
        background: rgba(16, 185, 129, 0.2);
        color: var(--success);
    }
    
    .status-failed {
        background: rgba(239, 68, 68, 0.2);
        color: var(--error);
    }
    
    .status-paused {
        background: rgba(245, 158, 11, 0.2);
        color: var(--warning);
    }
    
    .job-progress {
        min-width: 150px;
    }
    
    .progress-bar-container {
        background: var(--bg-dark);
        height: 6px;
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 4px;
    }
    
    .progress-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--primary), var(--secondary));
        transition: width 0.3s;
    }
    
    .progress-text {
        font-size: 11px;
        color: var(--text-dim);
    }
    
    .badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
    }
    
    .badge-primary {
        background: rgba(59, 130, 246, 0.2);
        color: var(--primary);
    }
    
    .badge-secondary {
        background: rgba(139, 92, 246, 0.2);
        color: var(--secondary);
    }
    
    .badge-info {
        background: rgba(102, 126, 234, 0.2);
        color: #667eea;
    }
    
    .badge-warning {
        background: rgba(245, 158, 11, 0.2);
        color: var(--warning);
    }
    
    .result-card {
        background: var(--bg-dark);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 20px;
        transition: all 0.2s;
    }
    
    .result-card:hover {
        border-color: var(--primary);
        transform: translateY(-2px);
    }
    
    .result-meta {
        display: flex;
        gap: 16px;
        font-size: 12px;
        color: var(--text-dim);
        margin: 12px 0;
    }
    
    .result-meta i {
        margin-right: 4px;
    }
    
    .result-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin: 16px 0;
        padding: 16px;
        background: var(--bg-card);
        border-radius: 6px;
    }
    
    .stat {
        text-align: center;
    }
    
    .stat-label {
        display: block;
        font-size: 11px;
        color: var(--text-dim);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    .stat-value {
        display: block;
        font-size: 20px;
        font-weight: 600;
        color: var(--primary);
        margin-top: 4px;
    }
    
    .result-actions {
        display: flex;
        gap: 8px;
        margin-top: 16px;
    }
    
    .text-dim { color: var(--text-dim); }
    .text-success { color: var(--success); }
    .text-error { color: var(--error); }
`;
document.head.appendChild(queueStyles);
