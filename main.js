const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const {
  getWindowsUserInfo,
  authenticateWithWindows,
  validateCredentials,
} = require('./src/utils/windowsAuth');
const {
  getSqlCredentialsFromRegistry,
  connectToSqlServer,
  testSqlConnection,
  executeQuery,
  getRegistryPathInfo,
} = require('./src/utils/sqlConnection');
const {
  validateAllSystemRequirements,
  getValidationErrorMessage,
  isWindows,
} = require('./src/utils/systemRequirements');
const {
  getWindowsServices,
  getServiceStatus,
  startService,
  stopService,
  restartService,
} = require('./src/utils/windowsServices');
const {
  getApplicationMetrics,
  analyzeMetrics,
} = require('./src/utils/monitoring');
const {
  getTestServices,
  createTestService,
  stopTestService,
  stopAllTestServices,
  getTestServicesTotalSize,
} = require('./src/utils/testServices');
const {
  getRunningApplications,
  closeApplication,
  forceCloseApplication,
  focusApplication,
  minimizeApplication,
  getApplicationDetails,
} = require('./src/utils/applicationControl');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Session storage (in production, use secure storage)
let currentSession = null;
let validationWindow = null;

/**
 * Show validation error dialog and exit application
 * @param {string} title - Dialog title
 * @param {string} message - Error message
 */
async function showValidationErrorAndExit(title, message) {
  if (validationWindow) {
    validationWindow.close();
  }

  const result = await dialog.showMessageBox(null, {
    type: 'error',
    title: title || 'System Requirements Not Met',
    message: title || 'System Requirements Not Met',
    detail: message,
    buttons: ['OK'],
    defaultId: 0,
    noLink: true,
  });

  // Exit the application
  app.quit();
  process.exit(1);
}

/**
 * Perform runtime system requirements validation
 * This runs after the app is ready but before creating the main window
 */
async function performRuntimeValidation() {
  // Only validate on Windows
  if (!isWindows()) {
    console.warn('System requirements validation is only available on Windows');
    return true;
  }

  try {
    console.log('Performing runtime system requirements validation...');
    
    // Perform validation (skip SQL connectivity check during initial validation to avoid blocking)
    const validationResults = await validateAllSystemRequirements({
      checkServices: true,
      checkSqlConnectivity: false, // Will be checked separately after app loads
      diskPath: 'C:\\',
    });

    if (!validationResults.passed) {
      const errorMessage = getValidationErrorMessage(validationResults);
      console.error('System requirements validation failed:', errorMessage);
      
      await showValidationErrorAndExit(
        'System Requirements Not Met',
        errorMessage
      );
      return false;
    }

    // Log warnings if any
    if (validationResults.warnings.length > 0) {
      console.warn('System requirements validation warnings:', validationResults.warnings);
    }

    console.log('System requirements validation passed');
    return true;
  } catch (error) {
    console.error('Error during system requirements validation:', error);
    await showValidationErrorAndExit(
      'Validation Error',
      `An error occurred during system requirements validation:\n\n${error.message}\n\nThe application will now exit.`
    );
    return false;
  }
}

function createWindow() {
  // Create the browser window
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Don't show until ready
  });

  // Maximize window on ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from built files
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
  
  return mainWindow;
}

// IPC Handlers for Authentication
ipcMain.handle('auth:get-windows-user', async () => {
  try {
    return getWindowsUserInfo();
  } catch (error) {
    console.error('Error getting Windows user:', error);
    return null;
  }
});

ipcMain.handle('auth:windows', async () => {
  try {
    const result = await authenticateWithWindows();
    if (result.success) {
      currentSession = {
        user: result.user,
        authenticatedAt: new Date().toISOString(),
      };
    }
    return result;
  } catch (error) {
    console.error('Windows authentication error:', error);
    return {
      success: false,
      error: error.message || 'Windows authentication failed',
    };
  }
});

ipcMain.handle('auth:login', async (event, credentials) => {
  try {
    const result = await validateCredentials(
      credentials.username,
      credentials.password
    );
    if (result.success) {
      currentSession = {
        user: result.user,
        authenticatedAt: new Date().toISOString(),
      };
    }
    return result;
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: error.message || 'Login failed',
    };
  }
});

ipcMain.handle('auth:logout', async () => {
  currentSession = null;
  return { success: true };
});

ipcMain.handle('auth:get-session', async () => {
  return currentSession;
});

ipcMain.handle('auth:is-authenticated', async () => {
  return currentSession !== null;
});

// IPC Handlers for SQL Server Operations
ipcMain.handle('sql:get-credentials', async (event, registryPath, hive) => {
  try {
    const credentials = await getSqlCredentialsFromRegistry(registryPath, hive);
    return {
      success: true,
      credentials,
    };
  } catch (error) {
    console.error('Error getting SQL credentials from registry:', error);
    return {
      success: false,
      error: error.message || 'Failed to read SQL credentials from registry',
    };
  }
});

ipcMain.handle('sql:test-connection', async (event, config, registryPath, hive) => {
  try {
    const result = await testSqlConnection(config, registryPath, hive);
    return result;
  } catch (error) {
    console.error('Error testing SQL connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to test SQL connection',
    };
  }
});

ipcMain.handle('sql:execute-query', async (event, query, config, registryPath, hive) => {
  try {
    const result = await executeQuery(query, config, registryPath, hive);
    return result;
  } catch (error) {
    console.error('Error executing SQL query:', error);
    return {
      success: false,
      error: error.message || 'Failed to execute SQL query',
    };
  }
});

ipcMain.handle('sql:get-registry-info', async () => {
  try {
    return {
      success: true,
      info: getRegistryPathInfo(),
    };
  } catch (error) {
    console.error('Error getting registry info:', error);
    return {
      success: false,
      error: error.message || 'Failed to get registry information',
    };
  }
});

// IPC Handler for System Requirements Validation
ipcMain.handle('system:validate-requirements', async (event, options = {}) => {
  try {
    if (!isWindows()) {
      return {
        success: false,
        error: 'System requirements validation is only available on Windows OS',
      };
    }

    const validationResults = await validateAllSystemRequirements(options);
    return {
      success: validationResults.passed,
      results: validationResults,
      errorMessage: validationResults.passed ? null : getValidationErrorMessage(validationResults),
    };
  } catch (error) {
    console.error('Error validating system requirements:', error);
    return {
      success: false,
      error: error.message || 'Failed to validate system requirements',
    };
  }
});

// IPC Handlers for Windows Services
ipcMain.handle('services:get-all', async () => {
  try {
    const services = await getWindowsServices();
    return {
      success: true,
      services,
    };
  } catch (error) {
    console.error('Error getting Windows services:', error);
    return {
      success: false,
      error: error.message || 'Failed to get Windows services',
      services: [],
    };
  }
});

ipcMain.handle('services:get-status', async (event, serviceName) => {
  try {
    const service = await getServiceStatus(serviceName);
    return {
      success: true,
      service,
    };
  } catch (error) {
    console.error(`Error getting service status for ${serviceName}:`, error);
    return {
      success: false,
      error: error.message || `Failed to get status for service '${serviceName}'`,
    };
  }
});

ipcMain.handle('services:start', async (event, serviceName) => {
  try {
    const result = await startService(serviceName);
    return result;
  } catch (error) {
    console.error(`Error starting service ${serviceName}:`, error);
    return {
      success: false,
      error: error.message || `Failed to start service '${serviceName}'`,
    };
  }
});

ipcMain.handle('services:stop', async (event, serviceName) => {
  try {
    const result = await stopService(serviceName);
    return result;
  } catch (error) {
    console.error(`Error stopping service ${serviceName}:`, error);
    return {
      success: false,
      error: error.message || `Failed to stop service '${serviceName}'`,
    };
  }
});

ipcMain.handle('services:restart', async (event, serviceName) => {
  try {
    const result = await restartService(serviceName);
    return result;
  } catch (error) {
    console.error(`Error restarting service ${serviceName}:`, error);
    return {
      success: false,
      error: error.message || `Failed to restart service '${serviceName}'`,
    };
  }
});

// IPC Handlers for Application Monitoring
ipcMain.handle('monitoring:get-metrics', async () => {
  try {
    const appPath = app.getAppPath();
    const metrics = await getApplicationMetrics(appPath);
    return {
      success: true,
      metrics,
    };
  } catch (error) {
    console.error('Error getting application metrics:', error);
    return {
      success: false,
      error: error.message || 'Failed to get application metrics',
    };
  }
});

ipcMain.handle('monitoring:analyze', async (event, currentMetrics, previousMetrics) => {
  try {
    const analysis = analyzeMetrics(currentMetrics, previousMetrics);
    return {
      success: true,
      analysis,
    };
  } catch (error) {
    console.error('Error analyzing metrics:', error);
    return {
      success: false,
      error: error.message || 'Failed to analyze metrics',
    };
  }
});

// IPC Handlers for Test Services
ipcMain.handle('test-services:get-all', async () => {
  try {
    const appPath = app.getAppPath();
    const services = await getTestServices(appPath);
    return {
      success: true,
      services,
    };
  } catch (error) {
    console.error('Error getting test services:', error);
    return {
      success: false,
      error: error.message || 'Failed to get test services',
      services: [],
    };
  }
});

ipcMain.handle('test-services:create', async (event, serviceName, sizeMB) => {
  try {
    const appPath = app.getAppPath();
    const result = await createTestService(appPath, serviceName, sizeMB);
    return result;
  } catch (error) {
    console.error(`Error creating test service ${serviceName}:`, error);
    return {
      success: false,
      error: error.message || `Failed to create test service '${serviceName}'`,
    };
  }
});

ipcMain.handle('test-services:stop', async (event, serviceName) => {
  try {
    const appPath = app.getAppPath();
    const result = await stopTestService(appPath, serviceName);
    return result;
  } catch (error) {
    console.error(`Error stopping test service ${serviceName}:`, error);
    return {
      success: false,
      error: error.message || `Failed to stop test service '${serviceName}'`,
    };
  }
});

ipcMain.handle('test-services:stop-all', async () => {
  try {
    const appPath = app.getAppPath();
    const result = await stopAllTestServices(appPath);
    return result;
  } catch (error) {
    console.error('Error stopping all test services:', error);
    return {
      success: false,
      error: error.message || 'Failed to stop all test services',
    };
  }
});

ipcMain.handle('test-services:get-total-size', async () => {
  try {
    const appPath = app.getAppPath();
    const sizeInfo = await getTestServicesTotalSize(appPath);
    return {
      success: true,
      ...sizeInfo,
    };
  } catch (error) {
    console.error('Error getting test services total size:', error);
    return {
      success: false,
      error: error.message || 'Failed to get test services total size',
    };
  }
});

// IPC Handlers for Application Control
ipcMain.handle('apps:get-all', async () => {
  try {
    const applications = await getRunningApplications();
    return {
      success: true,
      applications,
    };
  } catch (error) {
    console.error('Error getting running applications:', error);
    return {
      success: false,
      error: error.message || 'Failed to get running applications',
      applications: [],
    };
  }
});

ipcMain.handle('apps:close', async (event, processId) => {
  try {
    const result = await closeApplication(processId);
    return result;
  } catch (error) {
    console.error(`Error closing application (PID: ${processId}):`, error);
    return {
      success: false,
      error: error.message || `Failed to close application (PID: ${processId})`,
    };
  }
});

ipcMain.handle('apps:force-close', async (event, processId) => {
  try {
    const result = await forceCloseApplication(processId);
    return result;
  } catch (error) {
    console.error(`Error force closing application (PID: ${processId}):`, error);
    return {
      success: false,
      error: error.message || `Failed to force close application (PID: ${processId})`,
    };
  }
});

ipcMain.handle('apps:focus', async (event, processId) => {
  try {
    const result = await focusApplication(processId);
    return result;
  } catch (error) {
    console.error(`Error focusing application (PID: ${processId}):`, error);
    return {
      success: false,
      error: error.message || `Failed to focus application (PID: ${processId})`,
    };
  }
});

ipcMain.handle('apps:minimize', async (event, processId) => {
  try {
    const result = await minimizeApplication(processId);
    return result;
  } catch (error) {
    console.error(`Error minimizing application (PID: ${processId}):`, error);
    return {
      success: false,
      error: error.message || `Failed to minimize application (PID: ${processId})`,
    };
  }
});

ipcMain.handle('apps:get-details', async (event, processId) => {
  try {
    const result = await getApplicationDetails(processId);
    return result;
  } catch (error) {
    console.error(`Error getting application details (PID: ${processId}):`, error);
    return {
      success: false,
      error: error.message || `Failed to get application details (PID: ${processId})`,
    };
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Perform runtime validation before creating the window
  const validationPassed = await performRuntimeValidation();
  
  if (!validationPassed) {
    // Validation failed, app will exit
    return;
  }

  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

