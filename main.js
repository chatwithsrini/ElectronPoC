const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Disable GPU acceleration to avoid "GPU process isn't usable" errors when running
// in RDP, Citrix, VMs, or environments without proper GPU access (error_code=18)
// NOTE: Do NOT use disable-software-rasterizer - Chromium needs it to render when GPU is disabled
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
app.commandLine.appendSwitch('disable-gpu-process');
app.commandLine.appendSwitch('in-process-gpu');
// Disable sandbox - often required in RDP/Citrix/VDI where renderer fails to launch (error 18)
app.commandLine.appendSwitch('no-sandbox');

// Use a writable cache directory to avoid "Unable to move the cache: Access is denied"
// when running from Program Files or in restricted environments
if (process.platform === 'win32') {
  const cacheBase = process.env.LOCALAPPDATA || process.env.TEMP || os.tmpdir();
  const cacheDir = path.join(cacheBase, 'DentalXChangeConnector', 'Cache');
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    app.setPath('cache', cacheDir);
  } catch (err) {
    console.warn('Could not set custom cache path:', err.message);
  }
}
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
const {
  addConnection,
  removeConnection,
  updateConnection,
  getAllConnections,
  testConnection,
  testAllConnections,
  listTables,
  getAllConnectionStatuses,
  getSupportedDatabaseTypes,
  discoverAllDatabases,
  fetchCredentialsFromRegistry,
  isEaglesoftInstalled,
  fetchEaglesoftCredentials,
  addEaglesoftConnection,
  isDentrixInstalled,
  checkDentrixInstallation,
  checkDentrixAndGetConnectionString,
  testDentrixInitialization,
  uploadDentrixDocuments,
  fetchDentrixCredentials,
  fetchDentrixCredentialsWithPracticeInfo,
  addDentrixConnection,
  getDentrixPracticeInfo,
  getDentrixAppointments,
  getDentrixAppointmentIds,
} = require('./src/utils/databaseConnections');

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
  // Dev: use project build folder. Packaged: use extraResource (installer.ico in resources root)
  const iconPath = isDev
    ? path.join(__dirname, 'build', 'installer.ico')
    : path.join(process.resourcesPath, 'installer.ico');

  // Create the browser window - show immediately so it appears even if page load is slow/fails
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    center: true,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      // Disable sandbox for renderer - required when GPU/launch fails in RDP/Citrix/VDI
      sandbox: false,
    },
    show: true, // Show immediately - ready-to-show may never fire in restricted GPU environments
  });

  // Maximize when page is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
  });

  // Handle load failures - ensure window stays visible
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Window load failed:', errorCode, errorDescription, validatedURL);
    mainWindow.show();
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process crashed:', details.reason, details.exitCode);
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const htmlPath = path.join(__dirname, 'dist', 'index.html');
    if (!fs.existsSync(htmlPath)) {
      console.error('index.html not found at:', htmlPath);
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
        `<h1>Load Error</h1><p>index.html not found at: ${htmlPath}</p><p>__dirname: ${__dirname}</p>`
      )}`);
    } else {
      mainWindow.loadFile(htmlPath).catch((err) => {
        console.error('loadFile failed:', err);
        mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
          `<h1>Load Error</h1><p>${err.message}</p>`
        )}`);
      });
    }
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

// IPC Handlers for Database Connections Management
ipcMain.handle('db-connections:get-all', async () => {
  try {
    const result = await getAllConnections();
    return result;
  } catch (error) {
    console.error('Error getting database connections:', error);
    return {
      success: false,
      error: error.message || 'Failed to get database connections',
      connections: [],
    };
  }
});

ipcMain.handle('db-connections:add', async (event, connectionData) => {
  try {
    const result = await addConnection(connectionData);
    return result;
  } catch (error) {
    console.error('Error adding database connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to add database connection',
    };
  }
});

ipcMain.handle('db-connections:remove', async (event, connectionId) => {
  try {
    const result = await removeConnection(connectionId);
    return result;
  } catch (error) {
    console.error('Error removing database connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to remove database connection',
    };
  }
});

ipcMain.handle('db-connections:update', async (event, connectionId, updates) => {
  try {
    const result = await updateConnection(connectionId, updates);
    return result;
  } catch (error) {
    console.error('Error updating database connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to update database connection',
    };
  }
});

ipcMain.handle('db-connections:test', async (event, connectionId) => {
  try {
    const result = await testConnection(connectionId);
    return result;
  } catch (error) {
    console.error('Error testing database connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to test database connection',
    };
  }
});

ipcMain.handle('db-connections:test-all', async () => {
  try {
    const result = await testAllConnections();
    return result;
  } catch (error) {
    console.error('Error testing all database connections:', error);
    return {
      success: false,
      error: error.message || 'Failed to test all database connections',
    };
  }
});

ipcMain.handle('db-connections:list-tables', async (event, connectionId) => {
  try {
    const result = await listTables(connectionId);
    return result;
  } catch (error) {
    console.error('Error listing database tables:', error);
    return {
      success: false,
      tables: [],
      error: error.message || 'Failed to list database tables',
    };
  }
});

ipcMain.handle('db-connections:get-statuses', async () => {
  try {
    const result = await getAllConnectionStatuses();
    return result;
  } catch (error) {
    console.error('Error getting connection statuses:', error);
    return {
      success: false,
      error: error.message || 'Failed to get connection statuses',
    };
  }
});

ipcMain.handle('db-connections:get-supported-types', async () => {
  try {
    const result = getSupportedDatabaseTypes();
    return result;
  } catch (error) {
    console.error('Error getting supported database types:', error);
    return {
      success: false,
      error: error.message || 'Failed to get supported database types',
    };
  }
});

ipcMain.handle('db-connections:discover-all', async () => {
  try {
    const result = await discoverAllDatabases();
    return result;
  } catch (error) {
    console.error('Error discovering databases:', error);
    return {
      success: false,
      error: error.message || 'Failed to discover databases',
      instances: [],
    };
  }
});

ipcMain.handle('db-connections:fetch-credentials', async (event, dbType, instanceName) => {
  try {
    const result = await fetchCredentialsFromRegistry(dbType, instanceName);
    return result;
  } catch (error) {
    console.error('Error fetching credentials from registry:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch credentials',
    };
  }
});

// IPC Handlers for Eaglesoft-specific operations
ipcMain.handle('db-connections:eaglesoft:check-installed', async () => {
  try {
    const result = await isEaglesoftInstalled();
    return result;
  } catch (error) {
    console.error('Error checking Eaglesoft installation:', error);
    return {
      installed: false,
      error: error.message || 'Failed to check Eaglesoft installation',
    };
  }
});

ipcMain.handle('db-connections:eaglesoft:fetch-credentials', async (event, usePrimaryDatabase = true) => {
  try {
    const result = await fetchEaglesoftCredentials(usePrimaryDatabase);
    return result;
  } catch (error) {
    console.error('Error fetching Eaglesoft credentials:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch Eaglesoft credentials',
    };
  }
});

ipcMain.handle('db-connections:eaglesoft:add-connection', async (event, connectionName = 'Eaglesoft Database', usePrimaryDatabase = true) => {
  try {
    const result = await addEaglesoftConnection(connectionName, usePrimaryDatabase);
    return result;
  } catch (error) {
    console.error('Error adding Eaglesoft connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to add Eaglesoft connection',
    };
  }
});

// IPC Handlers for Dentrix-specific operations
ipcMain.handle('db-connections:dentrix:check-installed', async (event, dentrixServicePath) => {
  try {
    const result = await isDentrixInstalled(dentrixServicePath);
    return result;
  } catch (error) {
    console.error('Error checking Dentrix installation:', error);
    return {
      installed: false,
      error: error.message || 'Failed to check Dentrix installation',
    };
  }
});

ipcMain.handle('db-connections:dentrix:check-installation', async (event, dentrixServicePath) => {
  try {
    return await checkDentrixInstallation(dentrixServicePath);
  } catch (error) {
    console.error('Error checking Dentrix installation:', error);
    return {
      installed: false,
      error: error.message || 'Failed to check Dentrix installation',
    };
  }
});

ipcMain.handle('db-connections:dentrix:check-and-get-connection-string', async (event, dentrixServicePath) => {
  try {
    return await checkDentrixAndGetConnectionString(dentrixServicePath);
  } catch (error) {
    console.error('Error checking Dentrix and getting connection string:', error);
    return {
      installed: false,
      connectionString: null,
      config: null,
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('db-connections:dentrix:test-initialization', async (event, userName, password, dentrixServicePath) => {
  try {
    return await testDentrixInitialization(userName, password, dentrixServicePath);
  } catch (error) {
    console.error('Error testing Dentrix initialization:', error);
    return { success: false, initialized: false, error: error.message };
  }
});

ipcMain.handle('db-connections:dentrix:upload-documents', async (event, documents, dentrixServicePath) => {
  try {
    return await uploadDentrixDocuments(documents, dentrixServicePath);
  } catch (error) {
    console.error('Error uploading Dentrix documents:', error);
    return { success: false, results: {}, error: error.message };
  }
});

ipcMain.handle('db-connections:dentrix:fetch-credentials', async (event, dentrixServicePath) => {
  try {
    const result = await fetchDentrixCredentials(dentrixServicePath);
    return result;
  } catch (error) {
    console.error('Error fetching Dentrix credentials:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch Dentrix credentials',
    };
  }
});

ipcMain.handle('db-connections:dentrix:add-connection', async (event, connectionName = 'Dentrix Database', dentrixServicePath) => {
  try {
    const result = await addDentrixConnection(connectionName, dentrixServicePath);
    return result;
  } catch (error) {
    console.error('Error adding Dentrix connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to add Dentrix connection',
    };
  }
});

ipcMain.handle('db-connections:dentrix:fetch-credentials-with-practice-info', async (event, dentrixServicePath) => {
  try {
    const result = await fetchDentrixCredentialsWithPracticeInfo(dentrixServicePath);
    return result;
  } catch (error) {
    console.error('Error fetching Dentrix credentials with practice info:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-connections:dentrix:get-practice-info', async (event, connectionString) => {
  try {
    return await getDentrixPracticeInfo(connectionString);
  } catch (error) {
    console.error('Error getting Dentrix practice info:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-connections:dentrix:get-appointments', async (event, connectionString, startDate, endDate) => {
  try {
    return await getDentrixAppointments(connectionString, startDate, endDate);
  } catch (error) {
    console.error('Error getting Dentrix appointments:', error);
    return { success: false, appointments: [], error: error.message };
  }
});

ipcMain.handle('db-connections:dentrix:get-appointment-ids', async (event, connectionString, startDate, endDate) => {
  try {
    return await getDentrixAppointmentIds(connectionString, startDate, endDate);
  } catch (error) {
    console.error('Error getting Dentrix appointment IDs:', error);
    return { success: false, appointmentIds: [], error: error.message };
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

