// VFT Platform - Comprehensive UI Feedback System
// Production-ready toast notifications, loading states, and progress indicators

class UIFeedback {
    constructor() {
        this.toastContainer = null;
        this.loadingOverlay = null;
        this.activeToasts = new Map();
        this.activeLoaders = new Map();
        this.progressBars = new Map();
        this.init();
    }

    init() {
        // Create toast container
        this.createToastContainer();
        // Create loading overlay
        this.createLoadingOverlay();
        // Create progress container
        this.createProgressContainer();
        // Set up global error handler
        this.setupGlobalErrorHandler();
    }

    createToastContainer() {
        this.toastContainer = document.createElement('div');
        this.toastContainer.id = 'toast-container';
        this.toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-width: 400px;
        `;
        document.body.appendChild(this.toastContainer);
    }

    createLoadingOverlay() {
        this.loadingOverlay = document.createElement('div');
        this.loadingOverlay.id = 'loading-overlay';
        this.loadingOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            backdrop-filter: blur(4px);
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: var(--bg-panel);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 32px;
            text-align: center;
            min-width: 300px;
        `;
        
        content.innerHTML = `
            <div class="loading-spinner-large" style="margin: 0 auto 16px;"></div>
            <div id="loading-title" style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Processing...</div>
            <div id="loading-message" style="color: var(--text-dim); font-size: 14px;"></div>
            <div id="loading-progress" style="margin-top: 16px; display: none;">
                <div style="background: var(--bg-dark); height: 6px; border-radius: 3px; overflow: hidden;">
                    <div id="loading-progress-bar" style="height: 100%; background: linear-gradient(90deg, var(--primary), var(--secondary)); width: 0%; transition: width 0.3s;"></div>
                </div>
                <div id="loading-progress-text" style="margin-top: 8px; font-size: 12px; color: var(--text-dim);">0%</div>
            </div>
        `;
        
        this.loadingOverlay.appendChild(content);
        document.body.appendChild(this.loadingOverlay);
    }

    createProgressContainer() {
        this.progressContainer = document.createElement('div');
        this.progressContainer.id = 'progress-container';
        this.progressContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 9998;
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-width: 400px;
        `;
        document.body.appendChild(this.progressContainer);
    }

    // Toast notifications with auto-dismiss
    toast(message, type = 'info', duration = 5000, actions = null) {
        const toastId = `toast-${Date.now()}-${Math.random()}`;
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `toast toast-${type} fade-in`;
        
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ',
            loading: '⟳'
        };
        
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6',
            loading: '#8b5cf6'
        };
        
        toast.style.cssText = `
            background: var(--bg-card);
            border: 1px solid ${colors[type]};
            border-radius: 8px;
            padding: 16px;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            animation: slideIn 0.3s ease-out;
            position: relative;
            overflow: hidden;
        `;
        
        // Progress bar for auto-dismiss
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: ${colors[type]};
            width: 100%;
            animation: shrink ${duration}ms linear;
        `;
        
        const icon = document.createElement('div');
        icon.style.cssText = `
            width: 24px;
            height: 24px;
            background: ${colors[type]};
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            flex-shrink: 0;
            ${type === 'loading' ? 'animation: spin 1s linear infinite;' : ''}
        `;
        icon.textContent = icons[type];
        
        const content = document.createElement('div');
        content.style.cssText = `flex: 1;`;
        
        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.style.cssText = `color: var(--text); font-size: 14px; line-height: 1.5;`;
        content.appendChild(messageDiv);
        
        // Add action buttons if provided
        if (actions) {
            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = `display: flex; gap: 8px; margin-top: 8px;`;
            
            actions.forEach(action => {
                const btn = document.createElement('button');
                btn.textContent = action.text;
                btn.style.cssText = `
                    padding: 4px 12px;
                    border: 1px solid ${colors[type]};
                    background: transparent;
                    color: ${colors[type]};
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                `;
                btn.onmouseover = () => {
                    btn.style.background = colors[type];
                    btn.style.color = 'white';
                };
                btn.onmouseout = () => {
                    btn.style.background = 'transparent';
                    btn.style.color = colors[type];
                };
                btn.onclick = () => {
                    action.callback();
                    this.removeToast(toastId);
                };
                actionsDiv.appendChild(btn);
            });
            
            content.appendChild(actionsDiv);
        }
        
        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--text-dim);
            cursor: pointer;
            padding: 0;
            font-size: 18px;
            line-height: 1;
        `;
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => this.removeToast(toastId);
        
        toast.appendChild(progressBar);
        toast.appendChild(icon);
        toast.appendChild(content);
        toast.appendChild(closeBtn);
        
        this.toastContainer.appendChild(toast);
        this.activeToasts.set(toastId, toast);
        
        // Auto-dismiss
        if (type !== 'loading' && duration > 0) {
            setTimeout(() => this.removeToast(toastId), duration);
        }
        
        return toastId;
    }

    removeToast(toastId) {
        const toast = this.activeToasts.get(toastId);
        if (toast) {
            toast.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                toast.remove();
                this.activeToasts.delete(toastId);
            }, 300);
        }
    }

    // Loading overlay management
    showLoading(title = 'Processing...', message = '', showProgress = false) {
        const loaderId = `loader-${Date.now()}`;
        
        document.getElementById('loading-title').textContent = title;
        document.getElementById('loading-message').textContent = message;
        document.getElementById('loading-progress').style.display = showProgress ? 'block' : 'none';
        
        this.loadingOverlay.style.display = 'flex';
        this.activeLoaders.set(loaderId, true);
        
        return loaderId;
    }

    hideLoading(loaderId) {
        this.activeLoaders.delete(loaderId);
        if (this.activeLoaders.size === 0) {
            this.loadingOverlay.style.display = 'none';
            this.updateLoadingProgress(0);
        }
    }

    updateLoadingProgress(percent, text = null) {
        document.getElementById('loading-progress-bar').style.width = `${percent}%`;
        document.getElementById('loading-progress-text').textContent = text || `${Math.round(percent)}%`;
    }

    // Inline loading states
    setElementLoading(element, loading = true) {
        if (loading) {
            element.dataset.originalContent = element.innerHTML;
            element.disabled = true;
            element.innerHTML = '<span class="spinner-small" style="display: inline-block; margin-right: 8px;"></span>Loading...';
            element.style.opacity = '0.7';
        } else {
            element.innerHTML = element.dataset.originalContent || element.innerHTML;
            element.disabled = false;
            element.style.opacity = '1';
            delete element.dataset.originalContent;
        }
    }

    // Progress bars for long operations
    createProgressBar(id, title, container = null) {
        const progressDiv = document.createElement('div');
        progressDiv.id = `progress-${id}`;
        progressDiv.className = 'progress-item fade-in';
        progressDiv.style.cssText = `
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
        `;
        
        progressDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-weight: 500;">${title}</div>
                <div class="progress-percentage" style="font-size: 12px; color: var(--primary);">0%</div>
            </div>
            <div style="background: var(--bg-dark); height: 8px; border-radius: 4px; overflow: hidden;">
                <div class="progress-bar-fill" style="height: 100%; background: linear-gradient(90deg, var(--primary), var(--secondary)); width: 0%; transition: width 0.3s;"></div>
            </div>
            <div class="progress-status" style="font-size: 12px; color: var(--text-dim); margin-top: 8px;">Initializing...</div>
        `;
        
        const targetContainer = container || this.progressContainer;
        targetContainer.appendChild(progressDiv);
        this.progressBars.set(id, progressDiv);
        
        return id;
    }

    updateProgress(id, percent, status = null) {
        const progressDiv = this.progressBars.get(id);
        if (progressDiv) {
            progressDiv.querySelector('.progress-bar-fill').style.width = `${percent}%`;
            progressDiv.querySelector('.progress-percentage').textContent = `${Math.round(percent)}%`;
            if (status) {
                progressDiv.querySelector('.progress-status').textContent = status;
            }
        }
    }

    removeProgress(id) {
        const progressDiv = this.progressBars.get(id);
        if (progressDiv) {
            progressDiv.style.animation = 'fadeOut 0.3s ease-in';
            setTimeout(() => {
                progressDiv.remove();
                this.progressBars.delete(id);
            }, 300);
        }
    }

    // Global error handler
    setupGlobalErrorHandler() {
        window.addEventListener('unhandledrejection', event => {
            console.error('Unhandled promise rejection:', event.reason);
            this.toast(`Error: ${event.reason?.message || 'An unexpected error occurred'}`, 'error', 10000);
        });
    }

    // Confirmation dialogs
    async confirm(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
        return new Promise(resolve => {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
                backdrop-filter: blur(4px);
            `;
            
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: var(--bg-panel);
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
            `;
            
            dialog.innerHTML = `
                <h3 style="margin-bottom: 12px; font-size: 18px;">${title}</h3>
                <p style="color: var(--text-dim); margin-bottom: 24px; line-height: 1.5;">${message}</p>
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button class="btn btn-secondary" id="confirm-cancel">${cancelText}</button>
                    <button class="btn btn-primary" id="confirm-ok">${confirmText}</button>
                </div>
            `;
            
            modal.appendChild(dialog);
            document.body.appendChild(modal);
            
            // Fade in
            modal.style.opacity = '0';
            setTimeout(() => modal.style.opacity = '1', 10);
            
            const cleanup = () => {
                modal.style.opacity = '0';
                setTimeout(() => modal.remove(), 200);
            };
            
            dialog.querySelector('#confirm-ok').onclick = () => {
                cleanup();
                resolve(true);
            };
            
            dialog.querySelector('#confirm-cancel').onclick = () => {
                cleanup();
                resolve(false);
            };
        });
    }
}

// Create global instance
window.uiFeedback = new UIFeedback();

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
    
    @keyframes shrink {
        from { width: 100%; }
        to { width: 0%; }
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    .loading-spinner-large {
        width: 48px;
        height: 48px;
        border: 3px solid rgba(255, 255, 255, 0.1);
        border-top-color: var(--primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    .spinner-small {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-top-color: currentColor;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
    
    .fade-in { animation: fadeIn 0.3s ease-out; }
`;
document.head.appendChild(style);
