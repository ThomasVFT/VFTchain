// Auto-Update Service for VFT Desktop Client
const { autoUpdater } = require('electron-updater');
const { app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const { AWS_CONFIG } = require('../config/aws-config');
const awsService = require('./aws-service');
const winston = require('winston');

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

class AutoUpdateService {
    constructor() {
        this.initialized = false;
        this.updateWindow = null;
        this.mainWindow = null;
    }

    initialize(mainWindow) {
        this.mainWindow = mainWindow;

        // Configure auto-updater
        autoUpdater.logger = logger;
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = true;

        // Set update feed URL based on region
        const updateFeedUrl = `https://updates.vftchain.com/download/latest/${process.platform}/${process.arch}`;
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: updateFeedUrl,
            headers: {
                'X-Client-Version': app.getVersion(),
                'X-Client-Region': awsService.currentRegion || 'us-east-1'
            }
        });

        // Setup event handlers
        this.setupEventHandlers();

        // Check for updates on interval
        if (AWS_CONFIG.autoUpdate.enabled) {
            this.checkForUpdates();
            setInterval(() => {
                this.checkForUpdates();
            }, AWS_CONFIG.autoUpdate.checkInterval);
        }

        this.initialized = true;
        logger.info('Auto-updater initialized', {
            version: app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            updateUrl: updateFeedUrl
        });
    }

    setupEventHandlers() {
        autoUpdater.on('checking-for-update', () => {
            logger.info('Checking for updates...');
            this.sendStatusToWindow('checking-for-update');
        });

        autoUpdater.on('update-available', (info) => {
            logger.info('Update available', info);
            this.sendStatusToWindow('update-available', info);
            
            // Show update dialog
            this.showUpdateDialog(info);
        });

        autoUpdater.on('update-not-available', (info) => {
            logger.info('Update not available', info);
            this.sendStatusToWindow('update-not-available', info);
        });

        autoUpdater.on('error', (err) => {
            logger.error('Update error', err);
            this.sendStatusToWindow('update-error', err.message);
            
            // Send error telemetry
            awsService.sendTelemetry('update_error', {
                error: err.message,
                version: app.getVersion()
            });
        });

        autoUpdater.on('download-progress', (progressObj) => {
            let logMessage = `Download speed: ${this.formatBytes(progressObj.bytesPerSecond)}/s`;
            logMessage += ` - Downloaded ${progressObj.percent.toFixed(2)}%`;
            logMessage += ` (${this.formatBytes(progressObj.transferred)}/${this.formatBytes(progressObj.total)})`;
            
            logger.info(logMessage);
            this.sendStatusToWindow('download-progress', progressObj);
            
            // Update progress window if exists
            if (this.updateWindow && !this.updateWindow.isDestroyed()) {
                this.updateWindow.webContents.send('download-progress', progressObj);
            }
        });

        autoUpdater.on('update-downloaded', (info) => {
            logger.info('Update downloaded', info);
            this.sendStatusToWindow('update-downloaded', info);
            
            // Send success telemetry
            awsService.sendTelemetry('update_downloaded', {
                version: info.version,
                previousVersion: app.getVersion()
            });
            
            // Show restart dialog
            this.showRestartDialog(info);
        });
    }

    async checkForUpdates() {
        try {
            // Check if connected to AWS
            if (!awsService.initialized) {
                logger.warn('AWS service not initialized, skipping update check');
                return;
            }

            // Check update channel
            const channel = AWS_CONFIG.autoUpdate.channel;
            if (channel !== 'stable' && !AWS_CONFIG.autoUpdate.allowPrerelease) {
                logger.info(`Skipping update check for channel: ${channel}`);
                return;
            }

            logger.info('Manually checking for updates...');
            const result = await autoUpdater.checkForUpdates();
            
            // Log telemetry
            awsService.sendTelemetry('update_check', {
                currentVersion: app.getVersion(),
                updateAvailable: result.updateInfo ? true : false
            });
            
            return result;
        } catch (error) {
            logger.error('Failed to check for updates:', error);
            throw error;
        }
    }

    showUpdateDialog(info) {
        const dialogOpts = {
            type: 'info',
            buttons: ['Download', 'Later'],
            title: 'Application Update',
            message: `Version ${info.version} is available`,
            detail: `A new version of VFT Desktop Client is available!\n\nCurrent version: ${app.getVersion()}\nNew version: ${info.version}\n\nWould you like to download it now?`
        };

        dialog.showMessageBox(this.mainWindow, dialogOpts).then((returnValue) => {
            if (returnValue.response === 0) {
                this.downloadUpdate();
            } else {
                logger.info('User chose to update later');
            }
        });
    }

    async downloadUpdate() {
        try {
            // Create progress window
            this.createProgressWindow();
            
            logger.info('Starting update download...');
            await autoUpdater.downloadUpdate();
        } catch (error) {
            logger.error('Failed to download update:', error);
            
            if (this.updateWindow && !this.updateWindow.isDestroyed()) {
                this.updateWindow.close();
            }
            
            dialog.showErrorBox('Update Error', `Failed to download update: ${error.message}`);
        }
    }

    createProgressWindow() {
        this.updateWindow = new BrowserWindow({
            width: 400,
            height: 200,
            parent: this.mainWindow,
            modal: true,
            show: false,
            frame: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        this.updateWindow.loadFile(path.join(__dirname, '..', 'update-progress.html'));
        
        this.updateWindow.once('ready-to-show', () => {
            this.updateWindow.show();
        });
    }

    showRestartDialog(info) {
        const dialogOpts = {
            type: 'info',
            buttons: ['Restart', 'Later'],
            title: 'Update Ready',
            message: 'Update Downloaded',
            detail: `Version ${info.version} has been downloaded. The application will update after restart.\n\nRestart now?`
        };

        dialog.showMessageBox(this.mainWindow, dialogOpts).then((returnValue) => {
            if (returnValue.response === 0) {
                autoUpdater.quitAndInstall();
            } else {
                logger.info('User chose to restart later');
            }
        });
    }

    sendStatusToWindow(status, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('update-status', { status, data });
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Force update check (for menu or button)
    async forceUpdateCheck() {
        try {
            const result = await this.checkForUpdates();
            if (!result || !result.updateInfo) {
                dialog.showMessageBox(this.mainWindow, {
                    type: 'info',
                    title: 'No Updates',
                    message: 'You are running the latest version!',
                    detail: `Version ${app.getVersion()} is up to date.`
                });
            }
        } catch (error) {
            dialog.showErrorBox('Update Check Failed', error.message);
        }
    }
}

module.exports = new AutoUpdateService();