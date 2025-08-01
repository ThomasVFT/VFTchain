// VFT Platform - Enhanced Rewards Display Component
// Real-time earnings tracking with comprehensive UI feedback

class RewardsDisplay {
    constructor() {
        this.updateInterval = null;
        this.totalEarnings = 0;
        this.currentRate = 0;
        this.miningStartTime = null;
        this.init();
    }

    init() {
        this.createRewardsWidget();
        this.startRewardsTracking();
        this.setupEventListeners();
    }

    createRewardsWidget() {
        // Create floating rewards widget
        const widget = document.createElement('div');
        widget.id = 'rewards-widget';
        widget.className = 'rewards-widget';
        widget.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            min-width: 250px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            transition: all 0.3s;
            display: none;
        `;
        
        widget.innerHTML = `
            <div class="rewards-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h4 style="margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                    <span style="color: var(--success);">💎</span> VFT Earnings
                </h4>
                <button id="minimize-rewards" style="background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 18px;">−</button>
            </div>
            
            <div class="rewards-content">
                <div class="earning-rate" style="text-align: center; margin-bottom: 16px;">
                    <div style="font-size: 12px; color: var(--text-dim);">Current Rate</div>
                    <div id="current-rate" style="font-size: 28px; font-weight: 700; color: var(--primary);">0.00</div>
                    <div style="font-size: 12px; color: var(--text-dim);">VFT/hour</div>
                </div>
                
                <div class="earnings-stats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-dim);">Session</div>
                        <div id="session-earnings" style="font-size: 16px; font-weight: 600; color: var(--success);">0.00</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 11px; color: var(--text-dim);">Total</div>
                        <div id="total-earnings" style="font-size: 16px; font-weight: 600; color: var(--success);">0.00</div>
                    </div>
                </div>
                
                <div class="mining-time" style="text-align: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
                    <div style="font-size: 11px; color: var(--text-dim);">Mining Time</div>
                    <div id="mining-duration" style="font-size: 14px; color: var(--text);">00:00:00</div>
                </div>
                
                <div class="rewards-actions" style="display: flex; gap: 8px; margin-top: 16px;">
                    <button class="btn btn-sm btn-primary" style="flex: 1;" onclick="rewardsDisplay.viewDetails()">
                        <i class="fas fa-chart-line"></i> Details
                    </button>
                    <button class="btn btn-sm btn-secondary" style="flex: 1;" onclick="rewardsDisplay.withdraw()">
                        <i class="fas fa-wallet"></i> Withdraw
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(widget);
        
        // Create minimized badge
        const badge = document.createElement('div');
        badge.id = 'rewards-badge';
        badge.className = 'rewards-badge';
        badge.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--primary);
            color: white;
            border-radius: 20px;
            padding: 8px 16px;
            cursor: pointer;
            display: none;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 10px rgba(59, 130, 246, 0.3);
            transition: all 0.2s;
            z-index: 1000;
        `;
        
        badge.innerHTML = `
            <span>💎</span>
            <span id="badge-earnings">0.00 VFT</span>
        `;
        
        badge.onclick = () => this.showWidget();
        document.body.appendChild(badge);
    }

    startRewardsTracking() {
        // Update every second when mining
        this.updateInterval = setInterval(() => {
            if (state && state.mining) {
                this.updateRewardsDisplay();
            }
        }, 1000);
    }

    updateRewardsDisplay() {
        if (!this.miningStartTime) {
            this.miningStartTime = Date.now();
        }
        
        // Calculate mining duration
        const duration = Date.now() - this.miningStartTime;
        const hours = Math.floor(duration / 3600000);
        const minutes = Math.floor((duration % 3600000) / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        
        // Update duration display
        const durationEl = document.getElementById('mining-duration');
        if (durationEl) {
            durationEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        
        // Get REAL earnings from backend
        window.vftAPI?.getRewardsStatus().then(rewards => {
            if (!rewards || !rewards.success) return;
            
            const data = rewards.data;
            this.currentRate = data.currentRate || 0;
            const sessionEarnings = data.sessionEarnings || 0;
            
            // Update displays
            const currentRateEl = document.getElementById('current-rate');
            const sessionEarningsEl = document.getElementById('session-earnings');
            const totalEarningsEl = document.getElementById('total-earnings');
            const badgeEarningsEl = document.getElementById('badge-earnings');
            
            if (currentRateEl) currentRateEl.textContent = this.currentRate.toFixed(2);
            if (sessionEarningsEl) sessionEarningsEl.textContent = sessionEarnings.toFixed(4);
            if (totalEarningsEl) totalEarningsEl.textContent = (data.totalEarnings || 0).toFixed(4);
            if (badgeEarningsEl) badgeEarningsEl.textContent = `${sessionEarnings.toFixed(2)} VFT`;
            
            // Check for new rewards
            if (data.newReward) {
                this.showRewardNotification(data.newReward);
            }
        }).catch(err => {
            console.error('Failed to fetch rewards:', err);
        });
    }

    showRewardNotification(reward) {
        if (!reward) return;
        
        // Create floating reward animation
        const notification = document.createElement('div');
        notification.className = 'reward-notification';
        notification.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 600;
            box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
            animation: rewardFloat 3s ease-out forwards;
            z-index: 10000;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">💎</span>
                <div>
                    <div style="font-size: 18px;">+${reward.amount} VFT</div>
                    <div style="font-size: 12px; opacity: 0.9;">${reward.reason}</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Update total
        this.totalEarnings += reward.amount;
        
        // Play sound effect (optional)
        this.playRewardSound();
        
        // Remove after animation
        setTimeout(() => notification.remove(), 3000);
        
        // Show toast as well
        window.uiFeedback?.toast(`Earned ${reward.amount} VFT! ${reward.reason}`, 'success', 4000);
    }

    playRewardSound() {
        try {
            // Create a simple beep sound
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (e) {
            // Silently fail if audio context is not available
        }
    }

    showWidget() {
        const widget = document.getElementById('rewards-widget');
        const badge = document.getElementById('rewards-badge');
        
        if (widget) {
            widget.style.display = 'block';
            // Animate in
            widget.style.transform = 'translateY(100px)';
            widget.style.opacity = '0';
            setTimeout(() => {
                widget.style.transform = 'translateY(0)';
                widget.style.opacity = '1';
            }, 10);
        }
        
        if (badge) {
            badge.style.display = 'none';
        }
    }

    hideWidget() {
        const widget = document.getElementById('rewards-widget');
        const badge = document.getElementById('rewards-badge');
        
        if (widget) {
            widget.style.transform = 'translateY(100px)';
            widget.style.opacity = '0';
            
            setTimeout(() => {
                widget.style.display = 'none';
                if (state && state.mining && badge) {
                    badge.style.display = 'flex';
                }
            }, 300);
        }
    }

    async viewDetails() {
        const loaderId = window.uiFeedback?.showLoading('Loading Rewards Details', 'Fetching your earnings history...', true);
        
        try {
            // Get REAL rewards history from backend
            const rewardsData = await window.vftAPI?.getRewardsStatus();
            
            window.uiFeedback?.hideLoading(loaderId);
            
            if (!rewardsData || !rewardsData.success) {
                window.uiFeedback?.toast('No rewards data available. Start mining to earn VFT!', 'warning');
                return;
            }
            
            // Show detailed stats modal with REAL data
            this.showDetailsModal(rewardsData.data);
            
        } catch (error) {
            window.uiFeedback?.hideLoading(loaderId);
            window.uiFeedback?.toast('Failed to load rewards details: ' + error.message, 'error');
        }
    }

    showDetailsModal(rewardsData) {
        // Create a detailed rewards modal with REAL data
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <i class="fas fa-chart-line"></i> Rewards Dashboard
                    <button class="modal-close-btn" onclick="this.parentElement.parentElement.parentElement.remove()" style="float:right; background:none; border:none; font-size:22px; cursor:pointer; color:#fff;">×</button>
                </div>
                
                <div class="rewards-summary" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
                    <div class="stat-card">
                        <div class="stat-value" style="color: var(--success);">${(rewardsData?.total_earned_estimate || 0).toFixed(4)}</div>
                        <div class="stat-label">Total Earned</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" style="color: var(--primary);">${(rewardsData?.current_rate || 0).toFixed(2)}</div>
                        <div class="stat-label">VFT/hour</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" style="color: var(--warning);">${rewardsData?.pending_activities || 0}</div>
                        <div class="stat-label">Pending</div>
                    </div>
                </div>
                
                <h4>Earnings Status</h4>
                <div class="earnings-history" style="max-height: 300px; overflow-y: auto;">
                    ${this.generateRealEarningsHistory(rewardsData)}
                </div>
                
                <div class="btn-group" style="margin-top: 24px;">
                    <button class="btn btn-primary" onclick="rewardsDisplay.exportHistory()">
                        <i class="fas fa-download"></i> Export History
                    </button>
                    <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    generateRealEarningsHistory(rewardsData) {
        if (!rewardsData) {
            return '<p style="text-align: center; color: var(--text-dim); padding: 40px;">No rewards data available yet. Start mining to earn VFT!</p>';
        }
        
        const history = [];
        
        // Show wallet info
        if (rewardsData.wallet_address) {
            history.push(`
                <div style="padding: 12px; background: var(--bg-dark); border-radius: 6px; margin-bottom: 12px;">
                    <div style="font-weight: 500;">Wallet Address</div>
                    <div style="font-family: monospace; font-size: 12px; color: var(--text-dim);">${rewardsData.wallet_address}</div>
                </div>
            `);
        }
        
        // Show sync status
        const lastSync = rewardsData.last_sync ? new Date(rewardsData.last_sync).toLocaleString() : 'Never';
        const syncStatus = rewardsData.offline_mode ? 'Offline Mode' : 'Online';
        
        history.push(`
            <div style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid var(--border);">
                <div>
                    <div style="font-weight: 500;">Sync Status</div>
                    <div style="font-size: 12px; color: var(--text-dim);">Last sync: ${lastSync}</div>
                </div>
                <div style="color: ${rewardsData.offline_mode ? 'var(--warning)' : 'var(--success)'}; font-weight: 600;">${syncStatus}</div>
            </div>
        `);
        
        // Show pending activities
        if (rewardsData.pending_activities > 0) {
            history.push(`
                <div style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid var(--border);">
                    <div>
                        <div style="font-weight: 500;">Pending Activities</div>
                        <div style="font-size: 12px; color: var(--text-dim);">Awaiting submission to blockchain</div>
                    </div>
                    <div style="color: var(--warning); font-weight: 600;">${rewardsData.pending_activities}</div>
                </div>
            `);
        }
        
        // Show failed submissions
        if (rewardsData.failed_submissions > 0) {
            history.push(`
                <div style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid var(--border);">
                    <div>
                        <div style="font-weight: 500;">Failed Submissions</div>
                        <div style="font-size: 12px; color: var(--text-dim);">Will retry automatically</div>
                    </div>
                    <div style="color: var(--error); font-weight: 600;">${rewardsData.failed_submissions}</div>
                </div>
            `);
        }
        
        // Show total earned
        history.push(`
            <div style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid var(--border);">
                <div>
                    <div style="font-weight: 500;">Total Earned (Estimate)</div>
                    <div style="font-size: 12px; color: var(--text-dim);">Based on tracked activities</div>
                </div>
                <div style="color: var(--success); font-weight: 600; font-size: 18px;">${(rewardsData.total_earned_estimate || 0).toFixed(4)} VFT</div>
            </div>
        `);
        
        if (history.length === 1) { // Only wallet address shown
            history.push('<p style="text-align: center; color: var(--text-dim); padding: 20px;">No earning activities yet. Start mining to begin earning VFT!</p>');
        }
        
        return history.join('');
    }

    async withdraw() {
        try {
            // Get real rewards data first
            const rewardsData = await window.vftAPI?.getRewardsStatus();
            
            if (!rewardsData || !rewardsData.success) {
                window.uiFeedback?.toast('Unable to get rewards balance. Try again later.', 'error');
                return;
            }
            
            const availableBalance = rewardsData.data?.total_earned_estimate || 0;
            
            const confirmed = await window.uiFeedback?.confirm(
                'Withdraw VFT Tokens',
                `You have ${availableBalance.toFixed(4)} VFT available to withdraw. Minimum withdrawal is 10 VFT.\n\nNote: Withdrawals are processed manually by the VFT team.`,
                'Request Withdrawal',
                'Cancel'
            );
            
            if (confirmed) {
                if (availableBalance < 10) {
                    window.uiFeedback?.toast('Minimum withdrawal amount is 10 VFT. Continue mining to reach minimum.', 'warning');
                    return;
                }
                
                // Create withdrawal request
                const walletAddress = rewardsData.data?.wallet_address;
                if (!walletAddress) {
                    window.uiFeedback?.toast('No wallet address found. Please reconnect your wallet.', 'error');
                    return;
                }
                
                const loadingToast = window.uiFeedback?.toast('Submitting withdrawal request...', 'loading');
                
                // Submit withdrawal request to backend
                try {
                    const withdrawResult = await window.vftAPI?.requestWithdrawal({
                        walletAddress,
                        amount: availableBalance,
                        timestamp: Date.now()
                    });
                    
                    window.uiFeedback?.removeToast(loadingToast);
                    
                    if (withdrawResult?.success) {
                        window.uiFeedback?.toast('Withdrawal request submitted! You will be contacted within 24 hours.', 'success', 10000);
                    } else {
                        throw new Error(withdrawResult?.error || 'Withdrawal request failed');
                    }
                    
                } catch (error) {
                    window.uiFeedback?.removeToast(loadingToast);
                    window.uiFeedback?.toast('Withdrawal request failed: ' + error.message, 'error', 7000);
                }
            }
            
        } catch (error) {
            window.uiFeedback?.toast('Withdrawal error: ' + error.message, 'error');
        }
    }

    async exportHistory() {
        const loadingToast = window.uiFeedback?.toast('Exporting earnings history...', 'loading');
        
        try {
            // Get real rewards data
            const rewardsData = await window.vftAPI?.getRewardsStatus();
            
            if (!rewardsData || !rewardsData.success) {
                window.uiFeedback?.removeToast(loadingToast);
                window.uiFeedback?.toast('No data available to export', 'warning');
                return;
            }
            
            const data = rewardsData.data;
            
            // Create CSV content with real data
            const csvContent = [
                'Field,Value',
                `Wallet Address,${data.wallet_address || 'N/A'}`,
                `Total Earned (Estimate),${(data.total_earned_estimate || 0).toFixed(4)} VFT`,
                `Pending Activities,${data.pending_activities || 0}`,
                `Failed Submissions,${data.failed_submissions || 0}`,
                `Last Sync,${data.last_sync ? new Date(data.last_sync).toISOString() : 'Never'}`,
                `Offline Mode,${data.offline_mode ? 'Yes' : 'No'}`,
                `Export Date,${new Date().toISOString()}`
            ].join('\n');
            
            // Create and download file
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vft-rewards-${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            
            window.uiFeedback?.removeToast(loadingToast);
            window.uiFeedback?.toast('Rewards data exported successfully!', 'success', 3000);
            
        } catch (error) {
            window.uiFeedback?.removeToast(loadingToast);
            window.uiFeedback?.toast('Export failed: ' + error.message, 'error');
        }
    }

    setupEventListeners() {
        // Minimize button
        document.getElementById('minimize-rewards')?.addEventListener('click', () => {
            this.hideWidget();
        });
        
        // Listen for mining state changes
        window.addEventListener('mining-state-changed', (event) => {
            if (event.detail.mining) {
                this.onMiningStarted();
            } else {
                this.onMiningStopped();
            }
        });
    }

    onMiningStarted() {
        this.miningStartTime = Date.now();
        this.showWidget();
        window.uiFeedback?.toast('Earning VFT tokens! Check the rewards widget for real-time updates.', 'success', 5000);
    }

    onMiningStopped() {
        // Save session earnings
        const sessionEarnings = parseFloat(document.getElementById('session-earnings')?.textContent || 0);
        this.totalEarnings += sessionEarnings;
        
        // Hide widgets
        this.hideWidget();
        const badge = document.getElementById('rewards-badge');
        if (badge) badge.style.display = 'none';
        
        // Reset session
        this.miningStartTime = null;
        
        // Show summary
        if (sessionEarnings > 0) {
            window.uiFeedback?.toast(`Mining session ended. You earned ${sessionEarnings.toFixed(4)} VFT!`, 'info', 5000);
        }
    }

    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}

// Create global instance
window.rewardsDisplay = new RewardsDisplay();

// Add animation styles
const rewardStyles = document.createElement('style');
rewardStyles.textContent = `
    @keyframes rewardFloat {
        0% {
            transform: translateY(0) scale(0.8);
            opacity: 0;
        }
        20% {
            transform: translateY(-20px) scale(1);
            opacity: 1;
        }
        100% {
            transform: translateY(-100px) scale(0.9);
            opacity: 0;
        }
    }
    
    .rewards-widget:hover {
        transform: scale(1.02);
        box-shadow: 0 6px 30px rgba(0, 0, 0, 0.4);
    }
    
    .rewards-badge:hover {
        transform: scale(1.1);
        box-shadow: 0 4px 20px rgba(59, 130, 246, 0.5);
    }
    
    .reward-notification {
        pointer-events: none;
    }
`;
document.head.appendChild(rewardStyles);