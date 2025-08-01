// Storage Economics Service - Transparent pricing for data storage
// Users see exactly what they're paying for

class StorageEconomics {
    constructor() {
        // Pricing tiers (in VFT tokens)
        this.pricing = {
            compute: {
                base: 1.0,  // Base VFT per GPU hour
                multipliers: {
                    'RTX 4090': 2.5,
                    'RTX 4080': 2.0,
                    'RTX 3090': 1.5,
                    'A100': 3.0,
                    'H100': 5.0,
                    'any': 1.0
                }
            },
            storage: {
                free_days: 7,  // Free storage period
                ipfs_per_gb_per_month: 0.1,  // VFT per GB per month
                filecoin_per_gb_per_month: 0.01,  // Cheaper for long-term
                retrieval_per_gb: 0.05  // One-time retrieval fee after free period
            },
            network: {
                p2p_transfer: 0,  // Always free
                cdn_acceleration: 0.02  // Optional fast download
            }
        };
        
        // Free tier allocations
        this.freeTier = {
            storageGB: 10,  // 10GB free per user per month
            computeHours: 1,  // 1 free GPU hour for new users
            used: new Map()  // Track usage per wallet
        };
    }

    calculateJobCost(jobParams) {
        const breakdown = {
            compute: this.calculateComputeCost(jobParams),
            storage: this.calculateStorageCost(jobParams),
            network: this.calculateNetworkCost(jobParams),
            total: 0,
            savings: 0,
            details: []
        };
        
        // Apply free tier
        const freeTierSavings = this.applyFreeTier(breakdown, jobParams.walletAddress);
        breakdown.savings = freeTierSavings;
        
        // Calculate total
        breakdown.total = Math.max(0, 
            breakdown.compute.total + 
            breakdown.storage.total + 
            breakdown.network.total - 
            breakdown.savings
        );
        
        return breakdown;
    }

    calculateComputeCost(params) {
        const gpuType = params.gpuType || 'any';
        const gpuCount = params.gpuCount || 1;
        const hours = params.estimatedHours || 0;
        const minutes = params.estimatedMinutes || 0;
        
        const totalHours = hours + (minutes / 60);
        const multiplier = this.pricing.compute.multipliers[gpuType] || 1.0;
        
        const cost = {
            baseRate: this.pricing.compute.base,
            gpuMultiplier: multiplier,
            gpuCount: gpuCount,
            hours: totalHours,
            total: this.pricing.compute.base * multiplier * gpuCount * totalHours,
            breakdown: `${gpuCount} × ${gpuType} × ${totalHours.toFixed(2)} hours`
        };
        
        return cost;
    }

    calculateStorageCost(params) {
        const dataSizeGB = this.convertToGB(params.dataSize, params.dataSizeUnit);
        const autoDelete = params.autoDeleteAfterDownload !== false;  // Default true
        const extendedStorage = params.extendedStorageDays || 0;
        
        const cost = {
            dataSizeGB: dataSizeGB,
            freeDays: this.pricing.storage.free_days,
            freeStorageCost: 0,  // Always free for initial period
            extendedDays: extendedStorage,
            extendedCost: 0,
            monthlyRate: this.pricing.storage.ipfs_per_gb_per_month,
            total: 0,
            autoDelete: autoDelete,
            breakdown: []
        };
        
        // Free for first 7 days
        cost.breakdown.push(`First ${this.pricing.storage.free_days} days: FREE`);
        
        if (!autoDelete && extendedStorage > 0) {
            // Calculate extended storage cost
            const months = extendedStorage / 30;
            cost.extendedCost = dataSizeGB * this.pricing.storage.ipfs_per_gb_per_month * months;
            cost.total = cost.extendedCost;
            
            cost.breakdown.push(
                `Extended storage (${extendedStorage} days): ${cost.extendedCost.toFixed(2)} VFT`,
                `Rate: ${this.pricing.storage.ipfs_per_gb_per_month} VFT/GB/month`
            );
        } else if (autoDelete) {
            cost.breakdown.push('Auto-delete after download: No storage costs');
        }
        
        return cost;
    }

    calculateNetworkCost(params) {
        const dataSizeGB = this.convertToGB(params.dataSize, params.dataSizeUnit);
        const useCDN = params.enableCDNAcceleration || false;
        
        const cost = {
            p2pTransfer: 0,  // Always free
            cdnAcceleration: useCDN ? dataSizeGB * this.pricing.network.cdn_acceleration : 0,
            total: useCDN ? dataSizeGB * this.pricing.network.cdn_acceleration : 0,
            breakdown: []
        };
        
        cost.breakdown.push('P2P Transfer: FREE (always)');
        
        if (useCDN) {
            cost.breakdown.push(
                `CDN Acceleration: ${cost.cdnAcceleration.toFixed(2)} VFT`,
                `(Optional - for faster downloads)`
            );
        }
        
        return cost;
    }

    applyFreeTier(breakdown, walletAddress) {
        if (!walletAddress) return 0;
        
        const usage = this.freeTier.used.get(walletAddress) || {
            storageGB: 0,
            computeHours: 0,
            month: new Date().getMonth()
        };
        
        // Reset monthly
        if (usage.month !== new Date().getMonth()) {
            usage.storageGB = 0;
            usage.computeHours = 0;
            usage.month = new Date().getMonth();
        }
        
        let savings = 0;
        
        // Apply compute free tier
        if (usage.computeHours < this.freeTier.computeHours) {
            const freeHours = Math.min(
                this.freeTier.computeHours - usage.computeHours,
                breakdown.compute.hours
            );
            const computeSavings = freeHours * breakdown.compute.baseRate * breakdown.compute.gpuMultiplier;
            savings += computeSavings;
            usage.computeHours += freeHours;
            
            breakdown.details.push(
                `Free tier: ${freeHours.toFixed(2)} GPU hours (-${computeSavings.toFixed(2)} VFT)`
            );
        }
        
        // Apply storage free tier
        if (usage.storageGB < this.freeTier.storageGB) {
            const freeGB = Math.min(
                this.freeTier.storageGB - usage.storageGB,
                breakdown.storage.dataSizeGB
            );
            const storageSavings = freeGB * breakdown.storage.monthlyRate;
            savings += Math.min(storageSavings, breakdown.storage.total);
            usage.storageGB += freeGB;
            
            if (storageSavings > 0) {
                breakdown.details.push(
                    `Free tier: ${freeGB.toFixed(2)} GB storage (-${storageSavings.toFixed(2)} VFT)`
                );
            }
        }
        
        // Update usage
        this.freeTier.used.set(walletAddress, usage);
        
        return savings;
    }

    generateCostBreakdownUI(jobParams) {
        const breakdown = this.calculateJobCost(jobParams);
        
        return `
        <div class="cost-breakdown">
            <h3>Job Cost Breakdown</h3>
            
            <div class="cost-section">
                <div class="cost-line">
                    <span class="cost-label">Compute:</span>
                    <span class="cost-value">${breakdown.compute.total.toFixed(2)} VFT</span>
                </div>
                <div class="cost-detail">${breakdown.compute.breakdown}</div>
            </div>
            
            <div class="cost-section">
                <div class="cost-line">
                    <span class="cost-label">Storage (${breakdown.storage.freeDays} days):</span>
                    <span class="cost-value free">FREE</span>
                </div>
                ${breakdown.storage.extendedCost > 0 ? `
                <div class="cost-line">
                    <span class="cost-label">Extended Storage:</span>
                    <span class="cost-value">${breakdown.storage.extendedCost.toFixed(2)} VFT/month</span>
                </div>
                ` : ''}
                <div class="cost-option">
                    <label>
                        <input type="checkbox" id="autoDeleteAfterDownload" checked>
                        Auto-delete after download
                    </label>
                </div>
            </div>
            
            <div class="cost-section">
                <div class="cost-line">
                    <span class="cost-label">P2P Transfer:</span>
                    <span class="cost-value free">FREE</span>
                </div>
                ${breakdown.network.cdnAcceleration > 0 ? `
                <div class="cost-line optional">
                    <span class="cost-label">CDN Acceleration:</span>
                    <span class="cost-value">+${breakdown.network.cdnAcceleration.toFixed(2)} VFT</span>
                </div>
                ` : ''}
            </div>
            
            ${breakdown.savings > 0 ? `
            <div class="cost-section savings">
                <div class="cost-line">
                    <span class="cost-label">Free Tier Savings:</span>
                    <span class="cost-value">-${breakdown.savings.toFixed(2)} VFT</span>
                </div>
            </div>
            ` : ''}
            
            <div class="cost-total">
                <span class="cost-label">Total Cost:</span>
                <span class="cost-value">${breakdown.total.toFixed(2)} VFT</span>
            </div>
            
            <div class="cost-comparison">
                <small>AWS equivalent: ~$${(breakdown.total * 50).toFixed(2)} USD</small>
                <small>You save: ${((1 - breakdown.total / (breakdown.total * 50)) * 100).toFixed(0)}%</small>
            </div>
        </div>
        `;
    }

    convertToGB(size, unit) {
        const conversions = {
            'MB': 0.001,
            'GB': 1,
            'TB': 1000,
            'PB': 1000000
        };
        return size * (conversions[unit] || 1);
    }

    // Real-time cost preview as user adjusts parameters
    attachCostPreview(formElement) {
        const updateCost = () => {
            const params = this.extractJobParams(formElement);
            const breakdown = this.calculateJobCost(params);
            
            // Update UI elements
            document.getElementById('computeCost').textContent = breakdown.compute.total.toFixed(2);
            document.getElementById('storageCost').textContent = breakdown.storage.total.toFixed(2);
            document.getElementById('totalCost').textContent = breakdown.total.toFixed(2);
            
            // Update detailed breakdown
            document.getElementById('costBreakdown').innerHTML = this.generateCostBreakdownUI(params);
        };
        
        // Attach listeners to all relevant inputs
        const inputs = formElement.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('change', updateCost);
            input.addEventListener('input', updateCost);
        });
        
        // Initial calculation
        updateCost();
    }

    extractJobParams(formElement) {
        // Extract all job parameters from form
        return {
            gpuType: formElement.querySelector('#gpuType')?.value,
            gpuCount: parseInt(formElement.querySelector('#gpuCount')?.value) || 1,
            estimatedHours: parseInt(formElement.querySelector('#estimatedHours')?.value) || 0,
            estimatedMinutes: parseInt(formElement.querySelector('#estimatedMinutes')?.value) || 0,
            dataSize: parseFloat(formElement.querySelector('#dataSize')?.value) || 0,
            dataSizeUnit: formElement.querySelector('#dataSizeUnit')?.value || 'GB',
            autoDeleteAfterDownload: formElement.querySelector('#autoDeleteAfterDownload')?.checked,
            extendedStorageDays: parseInt(formElement.querySelector('#extendedStorageDays')?.value) || 0,
            enableCDNAcceleration: formElement.querySelector('#enableCDNAcceleration')?.checked,
            walletAddress: localStorage.getItem('wallet_address')
        };
    }
}

module.exports = StorageEconomics;