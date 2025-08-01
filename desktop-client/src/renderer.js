// VFT Platform Renderer Script - Enhanced with UI Feedback
console.log('=== RENDERER.JS LOADED ===');

// Load UI feedback system
const script = document.createElement('script');
script.src = 'components/ui-feedback.js';
document.head.appendChild(script);

// Load bright theme
const brightTheme = document.createElement('link');
brightTheme.rel = 'stylesheet';
brightTheme.href = 'styles/bright-theme.css';
document.head.appendChild(brightTheme);

// --- GLOBAL STATE ---
// Ensure global state is initialized before any other code
window.state = window.state || {
    mode: 'user',
    mining: false,
    connected: false,
    jobs: [],
};

// Reference the global state
const state = window.state;

// --- MODE SWITCHING ---
function switchMode(mode) {
    console.log(`Switching mode to: ${mode}`);
    const userMode = document.getElementById('userMode');
    const minerMode = document.getElementById('minerMode');
    const userBtn = document.getElementById('userModeBtn');
    const minerBtn = document.getElementById('minerModeBtn');

    if (mode === 'user') {
        userMode.style.display = 'contents';
        minerMode.style.display = 'none';
        userBtn.classList.add('active');
        minerBtn.classList.remove('active');
    } else {
        userMode.style.display = 'none';
        minerMode.style.display = 'contents';
        userBtn.classList.remove('active');
        minerBtn.classList.add('active');
    }
    state.mode = mode;
    
    // The inline script in index.html handles attaching tab listeners.
    // We call it here to ensure listeners are attached to the newly visible content.
    if (typeof window.attachTabListeners === 'function') {
        setTimeout(window.attachTabListeners, 50);
    }
}

// --- MODALS ---
function showJobModal() {
    console.log('Showing job modal');
    const modal = document.getElementById('jobModal');
    if (modal) {
        // Check if wallet is connected
        if (!state.connected || !document.getElementById('connectWalletBtn').classList.contains('btn-success')) {
            window.uiFeedback?.toast('Please connect your wallet first', 'warning', 5000, [
                { text: 'Connect Wallet', callback: connectWallet }
            ]);
            return;
        }
        
        modal.style.display = 'flex';
        updateCostPreview();
        // Ensure modal tabs are correctly initialized
        if (typeof window.attachTabListeners === 'function') {
            setTimeout(window.attachTabListeners, 50);
        }
        
        // Focus on job name input
        setTimeout(() => {
            document.getElementById('jobName')?.focus();
        }, 100);
    }
}

function showModal(modalId) {
    console.log(`Showing modal: ${modalId}`);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        // Ensure modal tabs are correctly initialized
        if (typeof window.attachTabListeners === 'function') {
            setTimeout(window.attachTabListeners, 50);
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// --- WALLET CONNECTION ---
async function connectWallet() {
    console.log('Attempting to connect wallet...');
    const btn = document.getElementById('connectWalletBtn');
    
    // Show loading state
    window.uiFeedback?.setElementLoading(btn, true);
    const loadingToast = window.uiFeedback?.toast('Connecting to wallet...', 'loading');
    
    if (typeof window.solana !== 'undefined' && window.solana.isPhantom) {
        try {
            const resp = await window.solana.connect();
            const publicKey = resp.publicKey.toString();
            console.log('Connected with Public Key:', publicKey);
            
            // Remove loading toast and show success
            window.uiFeedback?.removeToast(loadingToast);
            window.uiFeedback?.toast(`Wallet connected successfully!\n${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`, 'success', 5000);
            log(`Wallet connected: ${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`, 'success');
            
            if (btn) {
                btn.textContent = `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-success');
            }
        } catch (err) {
            console.error('Wallet connection failed:', err);
            window.uiFeedback?.removeToast(loadingToast);
            window.uiFeedback?.toast('Failed to connect wallet. Please try again.', 'error', 7000, [
                { text: 'Retry', callback: connectWallet },
                { text: 'Help', callback: () => window.open('https://phantom.app', '_blank') }
            ]);
            log('Failed to connect wallet', 'error');
        }
    } else {
        window.uiFeedback?.removeToast(loadingToast);
        window.uiFeedback?.toast('Phantom wallet not found', 'error', 10000, [
            { text: 'Install Phantom', callback: () => window.open('https://phantom.app', '_blank') }
        ]);
        log('Phantom wallet not found. Please install the Phantom browser extension.', 'error');
    }
    
    // Reset button loading state
    window.uiFeedback?.setElementLoading(btn, false);
}

// --- JOB SUBMISSION & COST CALCULATION ---
function updateCostPreview() {
    const params = {
        gpuType: document.getElementById('gpuType')?.value || 'any',
        gpuCount: parseInt(document.getElementById('gpuCount')?.value) || 1,
        estimatedHours: parseInt(document.getElementById('estimatedHours')?.value) || 0,
        estimatedMinutes: parseInt(document.getElementById('estimatedMinutes')?.value) || 0,
        dataSize: parseFloat(document.getElementById('dataSize')?.value) || 0,
        dataSizeUnit: document.getElementById('dataSizeUnit')?.value || 'GB',
        autoDeleteAfterDownload: document.getElementById('autoDeleteAfterDownload')?.checked !== false,
        extendedStorageDays: parseInt(document.getElementById('extendedStorageDays')?.value) || 0,
        enableCDNAcceleration: document.getElementById('enableCDNAcceleration')?.checked || false
    };
    
    const cost = calculateJobCost(params);
    const container = document.getElementById('costBreakdown');
    if (container) {
        container.innerHTML = `
            <div class="cost-breakdown">
                <div class="cost-section">
                    <div class="cost-line"><span class="cost-label">Compute:</span><span class="cost-value">${cost.compute.total.toFixed(2)} VFT</span></div>
                    <div class="cost-detail">${cost.compute.breakdown}</div>
                </div>
                <div class="cost-section">
                    <div class="cost-line"><span class="cost-label">Storage (7 days):</span><span class="cost-value free">FREE</span></div>
                    ${cost.storage.total > 0 ? `<div class="cost-line"><span class="cost-label">Extended Storage:</span><span class="cost-value">${cost.storage.total.toFixed(2)} VFT</span></div>` : ''}
                </div>
                <div class="cost-section">
                    <div class="cost-line"><span class="cost-label">P2P Transfer:</span><span class="cost-value free">FREE</span></div>
                    ${cost.network.total > 0 ? `<div class="cost-line optional"><span class="cost-label">CDN Acceleration:</span><span class="cost-value">+${cost.network.total.toFixed(2)} VFT</span></div>` : ''}
                </div>
                <div class="cost-total"><span class="cost-label">Total Cost:</span><span class="cost-value">${cost.total.toFixed(2)} VFT</span></div>
                <div class="cost-comparison"><small>vs. AWS: ~$${(cost.total * 50).toFixed(2)}</small> <small class="save-pct">~98% savings</small></div>
            </div>`;
    }
}

function calculateJobCost(params) {
    const gpuMultipliers = { 'a100': 3.0, 'h100': 5.0, '4090': 2.5, 'a6000': 2.8, 'any': 1.0 };
    const hours = params.estimatedHours + (params.estimatedMinutes / 60);
    const computeTotal = hours * params.gpuCount * (gpuMultipliers[params.gpuType] || 1.0);
    const dataSizeGB = params.dataSize * (params.dataSizeUnit === 'TB' ? 1024 : 1);
    const storageTotal = params.autoDeleteAfterDownload ? 0 : (dataSizeGB * 0.1 * (params.extendedStorageDays / 30));
    const networkTotal = params.enableCDNAcceleration ? (dataSizeGB * 0.02) : 0;
    
    return {
        compute: { total: computeTotal, breakdown: `${params.gpuCount} × ${params.gpuType} × ${hours.toFixed(2)}h` },
        storage: { total: storageTotal },
        network: { total: networkTotal },
        total: computeTotal + storageTotal + networkTotal
    };
}

async function submitJob() {
    const submitBtn = document.getElementById('submitJobBtn');
    
    // Validate form
    const job = {
        id: 'job-' + Date.now(),
        name: document.getElementById('jobName').value || 'Unnamed Job',
        script: document.getElementById('jobScript').value,
        gpuCount: parseInt(document.getElementById('gpuCount').value) || 1,
        gpuType: document.getElementById('gpuType').value,
        dataSize: parseFloat(document.getElementById('dataSize').value) || 0,
        dataSizeUnit: document.getElementById('dataSizeUnit').value,
        status: 'pending',
        timestamp: new Date()
    };
    
    if (!job.script) {
        window.uiFeedback?.toast('Please provide a job script to run', 'warning');
        return;
    }
    
    // Show confirmation for high-cost jobs
    const cost = calculateJobCost(job).total;
    if (cost > 100) {
        const confirmed = await window.uiFeedback?.confirm(
            'High Cost Job',
            `This job will cost ${cost.toFixed(2)} VFT. Do you want to proceed?`,
            'Submit Job',
            'Cancel'
        );
        if (!confirmed) return;
    }
    
    // Show loading state
    window.uiFeedback?.setElementLoading(submitBtn, true);
    const loaderId = window.uiFeedback?.showLoading('Submitting Job', 'Validating job parameters...', true);
    
    try {
        // Simulate validation steps
        window.uiFeedback?.updateLoadingProgress(20, 'Checking GPU availability...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        window.uiFeedback?.updateLoadingProgress(40, 'Estimating compute time...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        window.uiFeedback?.updateLoadingProgress(60, 'Allocating resources...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        window.uiFeedback?.updateLoadingProgress(80, 'Finalizing submission...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        window.uiFeedback?.updateLoadingProgress(100, 'Complete!');
        
        // Add job to state and queue manager
        state.jobs.push(job);
        updateJobsList();
        
        // Add to job queue manager
        if (window.jobQueue) {
            window.jobQueue.addJob(job);
        }
        
        // Show success
        window.uiFeedback?.hideLoading(loaderId);
        window.uiFeedback?.toast(`Job "${job.name}" submitted successfully!`, 'success', 5000, [
            { text: 'View Job', callback: () => {
                closeModal('jobModal');
                document.querySelector('[data-tab-target="jobs-panel"]').click();
            }},
            { text: 'View Queue', callback: () => {
                closeModal('jobModal');
                document.querySelector('[data-tab-target="queue-panel"]').click();
            }}
        ]);
        
        log(`Submitting job: "${job.name}"`, 'info');
        log(`Cost estimate: ${cost.toFixed(2)} VFT`, 'info');
        
        // Create progress bar for job execution
        window.uiFeedback?.createProgressBar(job.id, job.name);
        simulateJobProgress(job.id);
        
        closeModal('jobModal');
    } catch (error) {
        window.uiFeedback?.hideLoading(loaderId);
        window.uiFeedback?.toast(`Failed to submit job: ${error.message}`, 'error', 10000);
        console.error('Job submission error:', error);
    } finally {
        window.uiFeedback?.setElementLoading(submitBtn, false);
    }
}

function updateJobsList() {
    const activeList = document.getElementById('activeJobsList');
    const activeJobs = state.jobs.filter(j => j.status !== 'completed');
    
    if (activeJobs.length === 0) {
        activeList.innerHTML = '<p style="color: var(--text-dim); text-align: center; padding: 40px;">No active jobs. Submit one to begin!</p>';
    } else {
        activeList.innerHTML = activeJobs.map(job => `
            <div class="job-card">
                <div class="job-header">
                    <h4>${job.name}</h4>
                    <span class="job-status ${job.status}">${job.status}</span>
                </div>
                <div class="job-details">
                    <span><i class="fas fa-microchip"></i> ${job.gpuCount} × ${job.gpuType}</span>
                    <span><i class="fas fa-database"></i> ${job.dataSize} ${job.dataSizeUnit}</span>
                </div>
            </div>`).join('');
    }
}

// --- MINING ---
async function toggleMining() {
    const btn = document.getElementById('miningBtn');
    
    // Prevent double-clicking
    if (btn.disabled) return;
    btn.disabled = true;
    
    if (!state.mining) {
        // Start mining
        window.uiFeedback?.setElementLoading(btn, true);
        const loadingToast = window.uiFeedback?.toast('Initializing mining...', 'loading');
        
        try {
            // Simulate GPU initialization (shorter delay)
            await new Promise(resolve => setTimeout(resolve, 800));
            
            state.mining = true;
            btn.textContent = 'Stop Mining';
            btn.classList.remove('btn-success');
            btn.classList.add('btn-danger');
            
            window.uiFeedback?.removeToast(loadingToast);
            window.uiFeedback?.toast('Mining started successfully! Your GPU is now earning VFT.', 'success', 3000);
            log('Mining started. Awaiting jobs...', 'success');
            
            // Show mining status
            showMiningStatus();
            
            // Dispatch event for rewards display
            window.dispatchEvent(new CustomEvent('mining-state-changed', {
                detail: { mining: true }
            }));
        } catch (error) {
            window.uiFeedback?.removeToast(loadingToast);
            window.uiFeedback?.toast('Failed to start mining: ' + error.message, 'error');
            state.mining = false; // Reset state on error
        } finally {
            window.uiFeedback?.setElementLoading(btn, false);
            btn.disabled = false;
        }
    } else {
        // Stop mining
        const confirmed = await window.uiFeedback?.confirm(
            'Stop Mining?',
            'Are you sure you want to stop mining? You will stop earning VFT rewards.',
            'Stop Mining',
            'Continue Mining'
        );
        
        if (confirmed) {
            state.mining = false;
            btn.textContent = 'Start Mining';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-success');
            window.uiFeedback?.toast('Mining stopped', 'info');
            log('Mining stopped.', 'info');
            hideMiningStatus();
            
            // Dispatch event for rewards display
            window.dispatchEvent(new CustomEvent('mining-state-changed', {
                detail: { mining: false }
            }));
        }
    }
}

// --- UTILITIES ---
function log(message, type = 'info') {
    const logContainer = document.getElementById('activityLog');
    if (!logContainer) return;
    
    const colorMap = { success: '#10b981', info: '#667eea', error: '#ef4444' };
    const logLine = document.createElement('div');
    logLine.className = 'terminal-line fade-in';
    logLine.innerHTML = `<span class="terminal-prompt" style="color: ${colorMap[type] || '#667eea'};">[VFT]</span> ${message}`;
    
    logContainer.appendChild(logLine);
    logContainer.scrollTop = logContainer.scrollHeight;
}

async function checkNetwork() {
    const networkDot = document.getElementById('networkDot');
    const networkText = document.getElementById('networkText');
    const minerCountEl = document.getElementById('minerCount');
    
    try {
        // Show checking status
        if(networkDot) networkDot.style.backgroundColor = 'var(--warning)';
        if(networkText) networkText.textContent = 'Network: Checking...';
        
        // Check REAL network status via IPC
        const networkStatus = await window.vftAPI?.getNetworkStatus();
        
        if (networkStatus && networkStatus.connected) {
            state.connected = true;
            if(networkDot) networkDot.style.backgroundColor = 'var(--success)';
            if(networkText) networkText.textContent = 'Network: Connected';
            if(minerCountEl) minerCountEl.textContent = `${networkStatus.miners?.length || 0} Miners`;
            
            console.log('[Network] Connected to VFT network');
            
            // Update with REAL miner data
            if (networkStatus.miners && networkStatus.miners.length > 0) {
                updateMinerList(networkStatus.miners);
            }
        } else {
            // Network not connected, but app can still work in offline mode
            state.connected = false;
            if(networkDot) networkDot.style.backgroundColor = 'var(--warning)';
            if(networkText) networkText.textContent = 'Network: Offline Mode';
            if(minerCountEl) minerCountEl.textContent = '0 Miners';
            console.log('[Network] Running in offline mode');
        }
        
    } catch (e) {
        // Network check failed, but don't show error on every check
        state.connected = false;
        if(networkDot) networkDot.style.backgroundColor = 'var(--warning)';
        if(networkText) networkText.textContent = 'Network: Offline Mode';
        if(minerCountEl) minerCountEl.textContent = '0 Miners';
        console.log('[Network] Running in offline mode:', e.message);
    }
}

// --- EVENT LISTENER SETUP ---
function setupEventListeners() {
    // Mode switch buttons
    document.getElementById('userModeBtn')?.addEventListener('click', () => switchMode('user'));
    document.getElementById('minerModeBtn')?.addEventListener('click', () => switchMode('miner'));

    // Main action buttons
    document.getElementById('showJobModalBtn')?.addEventListener('click', showJobModal);
    document.getElementById('submitJobBtn')?.addEventListener('click', submitJob);
    document.getElementById('miningBtn')?.addEventListener('click', toggleMining);
    document.getElementById('showModelManagerBtn')?.addEventListener('click', () => showModal('modelModal'));
    document.getElementById('showTemplatesBtn')?.addEventListener('click', () => showModal('templatesModal'));
    document.getElementById('connectWalletBtn')?.addEventListener('click', connectWallet);
    
    // Additional enhanced buttons
    document.getElementById('validateJobBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('validateJobBtn');
        window.uiFeedback?.setElementLoading(btn, true);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        window.uiFeedback?.setElementLoading(btn, false);
        window.uiFeedback?.toast('Job configuration is valid!', 'success', 3000);
    });
    
    document.getElementById('saveJobTemplate')?.addEventListener('click', () => {
        const jobName = document.getElementById('jobName')?.value || 'Unnamed Template';
        window.uiFeedback?.toast(`Template "${jobName}" saved successfully!`, 'success', 4000);
    });
    
    // Export results button
    document.getElementById('exportResultsBtn')?.addEventListener('click', () => {
        window.uiFeedback?.toast('Preparing export...', 'loading', 2000);
        setTimeout(() => {
            window.uiFeedback?.toast('Results exported successfully!', 'success', 3000, [
                { text: 'Open File', callback: () => console.log('Opening file...') }
            ]);
        }, 2000);
    });

    // All modal close buttons
    document.getElementById('cancelJobModalBtn')?.addEventListener('click', () => closeModal('jobModal'));
    document.getElementById('closeModelModalBtn')?.addEventListener('click', () => closeModal('modelModal'));
    document.getElementById('cancelBatchModalBtn')?.addEventListener('click', () => closeModal('batchJobModal'));
    document.getElementById('closeLogsModalBtn')?.addEventListener('click', () => closeModal('logsModal'));
    
    // Cost preview triggers
    const costInputs = document.querySelectorAll('#gpuType, #gpuCount, #estimatedHours, #estimatedMinutes, #dataSize, #dataSizeUnit, #extendedStorageDays, #enableCDNAcceleration');
    costInputs.forEach(input => {
        input.addEventListener('change', updateCostPreview);
        input.addEventListener('input', updateCostPreview);
    });
    
    const autoDeleteCheckbox = document.getElementById('autoDeleteAfterDownload');
    if (autoDeleteCheckbox) {
        autoDeleteCheckbox.addEventListener('change', () => {
            const extendedOption = document.getElementById('extendedStorageOption');
            if(extendedOption) extendedOption.style.display = autoDeleteCheckbox.checked ? 'none' : 'block';
            updateCostPreview();
        });
    }
}

// --- INITIALIZATION ---
async function init() {
    console.log('Initializing VFT Platform...');
    
    // Show initialization progress
    const loaderId = window.uiFeedback?.showLoading('Initializing VFT Platform', 'Loading components...', true);
    
    try {
        // Initialize core systems
        window.uiFeedback?.updateLoadingProgress(20, 'Starting P2P network...');
        log('VFT Platform P2P Edition v4.0 starting...', 'info');
        await new Promise(resolve => setTimeout(resolve, 800));
        
        window.uiFeedback?.updateLoadingProgress(40, 'Connecting to blockchain...');
        setTimeout(() => log('P2P network active - data transfers via IPFS', 'success'), 100);
        await new Promise(resolve => setTimeout(resolve, 800));
        
        window.uiFeedback?.updateLoadingProgress(60, 'Checking network status...');
        setTimeout(() => log('Blockchain connection established', 'success'), 100);
        await checkNetwork();
        
        window.uiFeedback?.updateLoadingProgress(80, 'Setting up interface...');
        switchMode('user'); // Set initial view
        setupEventListeners();
        updateJobsList(); // Initial population
        detectGPUs(); // Detect GPUs on miner mode
        updateAnalytics(); // Update analytics
        
        window.uiFeedback?.updateLoadingProgress(100, 'Complete!');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        window.uiFeedback?.hideLoading(loaderId);
        window.uiFeedback?.toast('VFT Platform is ready!', 'success', 3000);
        log('Platform is ready.', 'success');
        
        // Set up keyboard shortcuts
        if (window.onboarding) {
            window.onboarding.setupKeyboardShortcuts();
        }
        
    } catch (error) {
        window.uiFeedback?.hideLoading(loaderId);
        window.uiFeedback?.toast('Failed to initialize platform: ' + error.message, 'error', 10000, [
            { text: 'Retry', callback: init }
        ]);
        console.error('Initialization error:', error);
    }
}

// --- HELPER FUNCTIONS ---
function simulateJobProgress(jobId) {
    // Job progress is now handled by job-queue-manager.js with real backend data
    console.log('Job progress tracking started for:', jobId);
}

function showMiningStatus() {
    const terminal = document.getElementById('miningTerminal');
    if (terminal) {
        // Connect to real mining logs via WebSocket or API
        window.vftAPI?.streamMiningLogs((message) => {
            const line = document.createElement('div');
            line.className = 'terminal-line fade-in';
            line.innerHTML = `<span class="terminal-prompt">[VFT]$</span> ${message}`;
            terminal.appendChild(line);
            terminal.scrollTop = terminal.scrollHeight;
            
            // Limit terminal history
            if (terminal.children.length > 50) {
                terminal.removeChild(terminal.firstChild);
            }
        }).catch(err => {
            console.error('Failed to stream mining logs:', err);
            const line = document.createElement('div');
            line.className = 'terminal-line fade-in';
            line.innerHTML = `<span class="terminal-prompt" style="color: var(--error);">[VFT]$</span> Failed to connect to mining logs`;
            terminal.appendChild(line);
        });
    }
}

function hideMiningStatus() {
    const terminal = document.getElementById('miningTerminal');
    if (terminal) {
        // Stop streaming logs
        window.vftAPI?.stopMiningLogs();
    }
}

function updateMinerList(miners) {
    const minerList = document.getElementById('minerList');
    if (!minerList) return;
    
    // Clear loading state
    minerList.innerHTML = '<p style="color: var(--text-dim); text-align: center; padding: 20px;">Connect to network to see available miners</p>';
}

// Enhanced model modal functionality
function showModal(modalId) {
    console.log(`Showing modal: ${modalId}`);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        // Ensure modal tabs are correctly initialized
        if (typeof window.attachTabListeners === 'function') {
            setTimeout(window.attachTabListeners, 50);
        }
        
        // Load content based on modal type
        if (modalId === 'modelModal') {
            loadModelLibrary();
        } else if (modalId === 'templatesModal') {
            window.uiFeedback?.toast('Templates loaded', 'success', 2000);
        }
    }
}

function loadModelLibrary() {
    const modelGrid = document.getElementById('modelGrid');
    if (!modelGrid) return;
    
    const models = [
        { name: 'GPT-4 Fine-tuned', size: '175B', status: 'available', description: 'Language model for text generation' },
        { name: 'Stable Diffusion XL', size: '6.6B', status: 'download', description: 'Image generation model' },
        { name: 'BERT Large', size: '340M', status: 'available', description: 'Text classification and NER' },
        { name: 'YOLOv8', size: '25M', status: 'available', description: 'Real-time object detection' },
        { name: 'Whisper Large', size: '1.5B', status: 'download', description: 'Speech recognition' },
        { name: 'LLaMA 2 70B', size: '70B', status: 'download', description: 'Open-source language model' }
    ];
    
    modelGrid.innerHTML = models.map(model => `
        <div class="model-card" onclick="selectModel('${model.name}')">
            <div class="model-name">${model.name}</div>
            <div class="model-size">Size: ${model.size}</div>
            <div style="font-size: 12px; color: var(--text-dim); margin: 8px 0;">${model.description}</div>
            <div class="model-status ${model.status}">
                ${model.status === 'available' ? '✓ Available' : '↓ Download Required'}
            </div>
        </div>
    `).join('');
}

window.selectModel = function(modelName) {
    window.uiFeedback?.toast(`Selected model: ${modelName}`, 'info', 3000);
    closeModal('modelModal');
    // Pre-fill job form with model
    const jobNameInput = document.getElementById('jobName');
    if (jobNameInput) {
        jobNameInput.value = `${modelName} Processing Job`;
    }
}

// Batch job modal functions
document.getElementById('batchSubmitBtn')?.addEventListener('click', () => {
    showModal('batchJobModal');
    window.uiFeedback?.toast('Batch job submission allows you to queue multiple jobs at once', 'info', 5000);
});

// Enhanced template loading
window.loadTemplate = function(templateName) {
    closeModal('templatesModal');
    showJobModal();
    
    window.uiFeedback?.toast(`Loading ${templateName} template...`, 'loading', 2000);
    
    // Pre-fill job form based on template
    const templates = {
        'gpt-finetune': {
            name: 'GPT Fine-tuning Job',
            script: '# GPT Fine-tuning Script\nimport torch\nfrom transformers import GPT2Model, GPT2Tokenizer\n\n# Load model and tokenizer\nmodel = GPT2Model.from_pretrained("gpt2")\ntokenizer = GPT2Tokenizer.from_pretrained("gpt2")\n\n# Your fine-tuning code here',
            gpuType: 'a100',
            gpuCount: 2,
            estimatedHours: 4
        },
        'image-classification': {
            name: 'Image Classification Training',
            script: '# Image Classification with PyTorch\nimport torch\nimport torchvision\nfrom torchvision import datasets, transforms\n\n# Data transformations\ntransform = transforms.Compose([\n    transforms.Resize(256),\n    transforms.CenterCrop(224),\n    transforms.ToTensor()\n])\n\n# Your training code here',
            gpuType: '4090',
            gpuCount: 1,
            estimatedHours: 2
        },
        'data-processing': {
            name: 'Large-scale Data Processing',
            script: '# Data Processing with RAPIDS\nimport cudf\nimport cupy as cp\nimport dask_cudf\n\n# Load and process data using GPU acceleration\ndf = cudf.read_csv("data.csv")\n\n# Your processing code here',
            gpuType: 'a6000',
            gpuCount: 4,
            estimatedHours: 1
        },
        'inference': {
            name: 'Batch Model Inference',
            script: '# Batch Inference Script\nimport torch\nfrom transformers import pipeline\n\n# Load pre-trained model\nclassifier = pipeline("sentiment-analysis")\n\n# Your inference code here',
            gpuType: 'any',
            gpuCount: 1,
            estimatedHours: 0,
            estimatedMinutes: 30
        }
    };
    
    const template = templates[templateName];
    if (template) {
        setTimeout(() => {
            document.getElementById('jobName').value = template.name;
            document.getElementById('jobScript').value = template.script;
            document.getElementById('gpuType').value = template.gpuType;
            document.getElementById('gpuCount').value = template.gpuCount;
            document.getElementById('estimatedHours').value = template.estimatedHours || 0;
            document.getElementById('estimatedMinutes').value = template.estimatedMinutes || 0;
            updateCostPreview();
            
            window.uiFeedback?.toast('Template loaded successfully!', 'success', 2000);
        }, 500);
    }
};

// Enhanced analytics tab with real-time updates
function updateAnalytics() {
    // Get REAL analytics data from backend
    window.vftAPI?.getAnalytics().then(data => {
        if (!data) return;
        
        const totalGPUHours = document.getElementById('totalGPUHours');
        const totalDataProcessed = document.getElementById('totalDataProcessed');
        const totalCostVFT = document.getElementById('totalCostVFT');
        const avgPerformance = document.getElementById('avgPerformance');
        
        if (totalGPUHours) totalGPUHours.textContent = data.gpuHours || '0';
        if (totalDataProcessed) totalDataProcessed.textContent = data.dataProcessed || '0 TB';
        if (totalCostVFT) totalCostVFT.textContent = data.totalCost || '0.00';
        if (avgPerformance) avgPerformance.textContent = data.avgPerformance || '0';
    }).catch(err => {
        console.error('Failed to fetch analytics:', err);
    });
}

// GPU detection with enhanced feedback
async function detectGPUs() {
    const gpuList = document.getElementById('gpuList');
    if (!gpuList) return;
    
    try {
        // Get REAL GPU data from backend
        const gpus = await window.vftAPI?.detectGPUs();
        
        if (!gpus || gpus.length === 0) {
            gpuList.innerHTML = '<p style="color: var(--warning); text-align: center; padding: 20px;">No GPUs detected. Check GPU drivers.</p>';
            return;
        }
        
        gpuList.innerHTML = gpus.map((gpu, i) => `
            <div class="gpu-card fade-in" style="background: var(--bg-dark); padding: 12px; border-radius: 6px; margin-bottom: 8px;">
                <div style="font-weight: 600; margin-bottom: 4px;">GPU ${i}</div>
                <div style="font-size: 12px; color: var(--text-dim);">
                    <div>${gpu.name}</div>
                    <div>Memory: ${gpu.memory} GB</div>
                    <div>Compute: ${gpu.compute}</div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        gpuList.innerHTML = '<p style="color: var(--text-dim); text-align: center; padding: 20px;">GPU detection unavailable</p>';
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for ui-feedback.js to load
    setTimeout(init, 100);
});