// VFT Safe Auto-Update Service - Mining-Aware Updates
const { autoUpdater } = require('electron-updater');
const { app, dialog, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const winston = require('winston');
const Store = require('electron-store');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: path.join(app.getPath('userData'), 'updater.log') })
    ]
});

const store = new Store();

class SafeAutoUpdateService {
    constructor() {
        this.initialized = false;
        this.mainWindow = null;
        this.updatePending = false;
        this.updateInfo = null;
        
        // Safety flags
        this.isMining = false;
        this.hasActiveJobs = false;
        this.isProcessingWork = false;
        this.pendingTransactions = 0;
        
        // Update configuration
        this.config = {
            enabled: store.get('autoUpdate.enabled', true),
            checkInterval: store.get('autoUpdate.checkInterval', 4 * 60 * 60 * 1000), // 4 hours
            allowDuringMining: store.get('autoUpdate.allowDuringMining', false),
            notifyOnly: store.get('autoUpdate.notifyOnly', true),
            autoDownload: false, // Never auto-download during mining
            autoInstall: false   // Never auto-install
        };
    }

    initialize(mainWindow) {
        this.mainWindow = mainWindow;

        // Configure auto-updater
        autoUpdater.logger = logger;
        autoUpdater.autoDownload = false; // Always manual download
        autoUpdater.autoInstallOnAppQuit = true;

        // Set update feed URL - GitHub releases
        if (process.env.NODE_ENV !== 'development') {
            autoUpdater.setFeedURL({
                provider: 'github',
                owner: 'vftchain',
                repo: 'desktop-client',
                private: false
            });
        }

        // Setup event handlers
        this.setupEventHandlers();
        this.setupIpcHandlers();

        // Check for updates on interval (but don't interrupt work)
        if (this.config.enabled) {
            this.scheduleUpdateCheck();
        }

        this.initialized = true;
        logger.info('Safe Auto-updater initialized', {
            version: app.getVersion(),
            platform: process.platform,
            config: this.config
        });
    }

    setupEventHandlers() {
        autoUpdater.on('checking-for-update', () => {
            logger.info('Checking for updates...');
            this.sendStatusToWindow('checking-for-update');
        });

        autoUpdater.on('update-available', (info) => {
            logger.info('Update available', info);
            this.updateInfo = info;
            this.updatePending = true;
            
            // Check if safe to notify
            if (this.isSafeToUpdate()) {
                this.showUpdateNotification(info);
            } else {
                logger.info('Update available but system is busy, will notify later');
                store.set('pendingUpdate', info);
            }
            
            this.sendStatusToWindow('update-available', info);
        });

        autoUpdater.on('update-not-available', (info) => {
            logger.info('No updates available');
            this.sendStatusToWindow('update-not-available', info);
        });

        autoUpdater.on('error', (err) => {
            logger.error('Update error:', err);
            this.sendStatusToWindow('update-error', err.message);
        });

        autoUpdater.on('download-progress', (progressObj) => {
            this.sendStatusToWindow('download-progress', progressObj);
            
            // Update main window if visible
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.setProgressBar(progressObj.percent / 100);
            }
        });

        autoUpdater.on('update-downloaded', (info) => {
            logger.info('Update downloaded', info);
            this.sendStatusToWindow('update-downloaded', info);
            
            // Reset progress bar
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.setProgressBar(-1);
            }
            
            // Only show restart dialog if safe
            if (this.isSafeToUpdate()) {
                this.showRestartDialog(info);
            } else {
                this.showPostponedUpdateDialog(info);
            }
        });
    }

    setupIpcHandlers() {
        // Mining status updates
        ipcMain.on('mining-status', (event, status) => {
            this.isMining = status.active;
            this.hasActiveJobs = status.activeJobs > 0;
            logger.info('Mining status updated', { mining: this.isMining, jobs: status.activeJobs });
            
            // Check if we have a pending update and it's now safe
            if (this.updatePending && this.isSafeToUpdate()) {
                this.checkPendingUpdate();
            }
        });

        // Job processing status
        ipcMain.on('job-processing', (event, isProcessing) => {
            this.isProcessingWork = isProcessing;
        });

        // Transaction status
        ipcMain.on('transaction-pending', (event, count) => {
            this.pendingTransactions = count;
        });

        // Manual update check
        ipcMain.handle('check-for-updates', async () => {
            return await this.checkForUpdates();
        });

        // Get update status
        ipcMain.handle('get-update-status', () => {
            return {
                updatePending: this.updatePending,
                updateInfo: this.updateInfo,
                isSafe: this.isSafeToUpdate()
            };
        });

        // Force update (user initiated)
        ipcMain.handle('force-update', async () => {
            if (this.updatePending && this.updateInfo) {
                return await this.downloadUpdate();
            }
            return false;
        });
    }

    isSafeToUpdate() {
        // Never interrupt active mining or job processing
        if (this.isMining || this.hasActiveJobs || this.isProcessingWork) {
            return false;
        }
        
        // Don't update if there are pending transactions
        if (this.pendingTransactions > 0) {
            return false;
        }
        
        return true;
    }

    async scheduleUpdateCheck() {
        // Initial check after 1 minute
        setTimeout(() => {
            if (this.isSafeToUpdate()) {
                this.checkForUpdates();
            }
        }, 60000);

        // Regular checks
        setInterval(() => {
            if (this.isSafeToUpdate()) {
                this.checkForUpdates();
            }
        }, this.config.checkInterval);
    }

    async checkForUpdates() {
        try {
            if (!this.isSafeToUpdate() && !this.config.notifyOnly) {
                logger.info('System busy, skipping update check');
                return null;
            }

            logger.info('Checking for updates...');
            const result = await autoUpdater.checkForUpdates();
            return result;
        } catch (error) {
            logger.error('Failed to check for updates:', error);
            throw error;
        }
    }

    checkPendingUpdate() {
        const pendingUpdate = store.get('pendingUpdate');
        if (pendingUpdate) {
            this.showUpdateNotification(pendingUpdate);
            store.delete('pendingUpdate');
        }
    }

    showUpdateNotification(info) {
        const notification = {
            title: 'VFT Update Available',
            body: `Version ${info.version} is ready to install. Click to view details.`
        };

        // Send to renderer for in-app notification
        this.sendStatusToWindow('show-notification', notification);

        // Show dialog if configured
        if (!this.config.notifyOnly) {
            this.showUpdateDialog(info);
        }
    }

    showUpdateDialog(info) {
        const dialogOpts = {
            type: 'info',
            buttons: ['Download', 'Remind Me Later', 'Skip This Version'],
            defaultId: 0,
            title: 'Update Available',
            message: `VFT Desktop ${info.version} is available`,
            detail: this.formatUpdateDetails(info)
        };

        dialog.showMessageBox(this.mainWindow, dialogOpts).then((result) => {
            if (result.response === 0) {
                this.downloadUpdate();
            } else if (result.response === 2) {
                store.set('skippedVersion', info.version);
            }
        });
    }

    formatUpdateDetails(info) {
        let details = `A new version of VFT Desktop Client is available!\n\n`;
        details += `Current version: ${app.getVersion()}\n`;
        details += `New version: ${info.version}\n\n`;
        
        if (info.releaseNotes) {
            details += `What's new:\n${info.releaseNotes}\n\n`;
        }
        
        details += `The update will be installed when it's safe to do so.`;
        return details;
    }

    async downloadUpdate() {
        try {
            // Final safety check
            if (!this.isSafeToUpdate()) {
                const result = await dialog.showMessageBox(this.mainWindow, {
                    type: 'warning',
                    buttons: ['Continue Anyway', 'Cancel'],
                    defaultId: 1,
                    title: 'System Busy',
                    message: 'Mining or job processing is active',
                    detail: 'Updating now may interrupt your work and cause loss of rewards. Are you sure you want to continue?'
                });

                if (result.response !== 0) {
                    return false;
                }
            }

            logger.info('Starting update download...');
            await autoUpdater.downloadUpdate();
            return true;
        } catch (error) {
            logger.error('Failed to download update:', error);
            dialog.showErrorBox('Update Error', `Failed to download update: ${error.message}`);
            return false;
        }
    }

    showRestartDialog(info) {
        const dialogOpts = {
            type: 'info',
            buttons: ['Restart Now', 'Restart Later'],
            defaultId: 1,
            title: 'Update Ready',
            message: 'Update Downloaded',
            detail: `Version ${info.version} has been downloaded.\n\nThe application needs to restart to apply the update. Any active mining or jobs will be stopped.`
        };

        dialog.showMessageBox(this.mainWindow, dialogOpts).then((result) => {
            if (result.response === 0) {
                // Give renderer time to save state
                this.sendStatusToWindow('app-will-restart');
                setTimeout(() => {
                    autoUpdater.quitAndInstall();
                }, 2000);
            }
        });
    }

    showPostponedUpdateDialog(info) {
        dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'Update Ready',
            message: 'Update will be installed when safe',
            detail: `Version ${info.version} has been downloaded but cannot be installed while mining or processing jobs.\n\nThe update will be automatically installed the next time you restart the application.`
        });
    }

    sendStatusToWindow(status, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('update-status', { status, data });
        }
    }

    // Public methods for menu/UI
    async forceUpdateCheck() {
        try {
            const result = await this.checkForUpdates();
            if (!result || !result.updateInfo) {
                dialog.showMessageBox(this.mainWindow, {
                    type: 'info',
                    title: 'No Updates',
                    message: 'You are running the latest version!',
                    detail: `VFT Desktop ${app.getVersion()} is up to date.`
                });
            }
            return result;
        } catch (error) {
            dialog.showErrorBox('Update Check Failed', error.message);
            return null;
        }
    }

    setAutoUpdateEnabled(enabled) {
        this.config.enabled = enabled;
        store.set('autoUpdate.enabled', enabled);
    }

    setNotifyOnly(notifyOnly) {
        this.config.notifyOnly = notifyOnly;
        store.set('autoUpdate.notifyOnly', notifyOnly);
    }
}

module.exports = new SafeAutoUpdateService();