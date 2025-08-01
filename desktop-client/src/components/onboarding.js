// VFT Platform - Help System Only
// Simple help menu without onboarding tour

class OnboardingSystem {
    constructor() {
        this.completed = true;
        this.init();
    }

    init() {
        // Skip onboarding completely, just add help button
        this.addHelpButton();
    }

    addHelpButton() {
        const header = document.querySelector('.header');
        if (!header) return;
        
        const helpBtn = document.createElement('button');
        helpBtn.id = 'help-btn';
        helpBtn.className = 'btn btn-sm';
        helpBtn.style.cssText = 'margin-right: 16px;';
        helpBtn.innerHTML = '<i class="fas fa-question-circle"></i> Help';
        
        helpBtn.onclick = () => this.showHelpMenu();
        
        // Insert before network status
        const networkStatus = header.querySelector('.network-status');
        if (networkStatus) {
            header.insertBefore(helpBtn, networkStatus);
        }
    }

    showHelpMenu() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <i class="fas fa-question-circle"></i> Help & Contact
                    <button class="modal-close-btn" onclick="this.parentElement.parentElement.parentElement.remove()" style="float:right; background:none; border:none; font-size:22px; cursor:pointer; color:#fff;">×</button>
                </div>
                
                <div class="help-content">
                    <div class="help-section">
                        <h4>Quick Actions</h4>
                        <div class="help-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 12px;">
                            <button class="help-action-btn" onclick="window.open('https://docs.vftchain.com', '_blank')">
                                <i class="fas fa-book"></i> Documentation
                            </button>
                            <button class="help-action-btn" onclick="window.open('https://discord.gg/vftchain', '_blank')">
                                <i class="fab fa-discord"></i> Join Discord
                            </button>
                        </div>
                    </div>
                    
                    <div class="help-section" style="margin-top: 24px;">
                        <h4>Frequently Asked Questions</h4>
                        <div class="faq-list">
                            ${this.getFAQs()}
                        </div>
                    </div>
                    
                    <div class="help-section" style="margin-top: 24px;">
                        <h4>Keyboard Shortcuts</h4>
                        <div class="shortcuts-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 13px;">
                            <div><kbd>Ctrl+J</kbd> Submit Job</div>
                            <div><kbd>Ctrl+M</kbd> Toggle Mining</div>
                            <div><kbd>Ctrl+W</kbd> Connect Wallet</div>
                            <div><kbd>Ctrl+S</kbd> Switch Mode</div>
                            <div><kbd>Ctrl+H</kbd> Show Help</div>
                            <div><kbd>Esc</kbd> Close Modal</div>
                        </div>
                    </div>
                    
                    <div class="help-section" style="margin-top: 24px;">
                        <h4>Contact Support</h4>
                        <p style="font-size: 14px;">For technical support or questions, contact:<br>
                        <a href="mailto:thomas@vftchain.com" style="color: var(--primary);">thomas@vftchain.com</a></p>
                    </div>
                </div>
                
                <div class="btn-group" style="margin-top: 24px;">
                    <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    getFAQs() {
        const faqs = [
            { q: 'How do I start earning VFT?', a: 'Switch to Miner Mode and click "Start Mining" to begin processing AI jobs.' },
            { q: 'What wallet do I need?', a: 'You need a Phantom wallet with SOL for gas fees. VFT tokens will be sent there.' },
            { q: 'How much can I earn?', a: 'Earnings depend on your GPU power and job availability. Typical range: 0.5-2.5 VFT/hour.' },
            { q: 'Is my GPU compatible?', a: 'Most NVIDIA GPUs (RTX 2000 series and above) and AMD GPUs are supported.' },
            { q: 'How do I withdraw earnings?', a: 'Click the rewards widget and hit "Withdraw" when you have at least 10 VFT.' }
        ];
        
        return faqs.map((faq, i) => `
            <div class="faq-item" style="margin-bottom: 16px;">
                <div class="faq-question" style="font-weight: 600; margin-bottom: 4px; cursor: pointer;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                    <i class="fas fa-chevron-right" style="width: 16px;"></i> ${faq.q}
                </div>
                <div class="faq-answer" style="margin-left: 20px; color: var(--text-dim); display: none;">
                    ${faq.a}
                </div>
            </div>
        `).join('');
    }

    // Keyboard shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'j':
                        e.preventDefault();
                        document.getElementById('showJobModalBtn')?.click();
                        break;
                    case 'm':
                        e.preventDefault();
                        document.getElementById('miningBtn')?.click();
                        break;
                    case 'w':
                        e.preventDefault();
                        document.getElementById('connectWalletBtn')?.click();
                        break;
                    case 's':
                        e.preventDefault();
                        const inactiveMode = document.querySelector('.mode-btn:not(.active)');
                        inactiveMode?.click();
                        break;
                    case 'h':
                        e.preventDefault();
                        this.showHelpMenu();
                        break;
                }
            }
        });
    }
}

// Create global instance
window.onboarding = new OnboardingSystem();

// Add onboarding styles
const onboardingStyles = document.createElement('style');
onboardingStyles.textContent = `
    .help-action-btn {
        background: var(--bg-dark);
        border: 1px solid var(--border);
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        color: var(--text);
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        justify-content: center;
    }
    
    .help-action-btn:hover {
        background: var(--bg-card);
        border-color: var(--primary);
        transform: translateY(-1px);
    }
    
    .help-action-btn i {
        font-size: 18px;
        color: var(--primary);
    }
    
    kbd {
        background: var(--bg-dark);
        border: 1px solid var(--border);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 12px;
    }
    
    .faq-item:hover .faq-question {
        color: var(--primary);
    }
`;
document.head.appendChild(onboardingStyles);
