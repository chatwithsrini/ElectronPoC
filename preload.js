const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Windows Authentication
  authenticateWindows: () => ipcRenderer.invoke('auth:windows'),
  getWindowsUser: () => ipcRenderer.invoke('auth:get-windows-user'),
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  logout: () => ipcRenderer.invoke('auth:logout'),
  
  // Session management
  getSession: () => ipcRenderer.invoke('auth:get-session'),
  isAuthenticated: () => ipcRenderer.invoke('auth:is-authenticated'),
  
  // SQL Server operations
  getSqlCredentials: (registryPath, hive) => ipcRenderer.invoke('sql:get-credentials', registryPath, hive),
  testSqlConnection: (config, registryPath, hive) => ipcRenderer.invoke('sql:test-connection', config, registryPath, hive),
  executeSqlQuery: (query, config, registryPath, hive) => ipcRenderer.invoke('sql:execute-query', query, config, registryPath, hive),
  getSqlRegistryInfo: () => ipcRenderer.invoke('sql:get-registry-info'),
  
  // System requirements validation
  validateSystemRequirements: (options) => ipcRenderer.invoke('system:validate-requirements', options),
  
  // Windows Services operations
  getWindowsServices: () => ipcRenderer.invoke('services:get-all'),
  getServiceStatus: (serviceName) => ipcRenderer.invoke('services:get-status', serviceName),
  startService: (serviceName) => ipcRenderer.invoke('services:start', serviceName),
  stopService: (serviceName) => ipcRenderer.invoke('services:stop', serviceName),
  restartService: (serviceName) => ipcRenderer.invoke('services:restart', serviceName),
  
  // Application Monitoring operations
  getAppMetrics: () => ipcRenderer.invoke('monitoring:get-metrics'),
  analyzeMetrics: (currentMetrics, previousMetrics) => ipcRenderer.invoke('monitoring:analyze', currentMetrics, previousMetrics),
  
  // Test Services operations
  getTestServices: () => ipcRenderer.invoke('test-services:get-all'),
  createTestService: (serviceName, sizeMB) => ipcRenderer.invoke('test-services:create', serviceName, sizeMB),
  stopTestService: (serviceName) => ipcRenderer.invoke('test-services:stop', serviceName),
  stopAllTestServices: () => ipcRenderer.invoke('test-services:stop-all'),
  getTestServicesTotalSize: () => ipcRenderer.invoke('test-services:get-total-size'),
  
  // Application Control operations
  getRunningApplications: () => ipcRenderer.invoke('apps:get-all'),
  closeApplication: (processId) => ipcRenderer.invoke('apps:close', processId),
  forceCloseApplication: (processId) => ipcRenderer.invoke('apps:force-close', processId),
  focusApplication: (processId) => ipcRenderer.invoke('apps:focus', processId),
  minimizeApplication: (processId) => ipcRenderer.invoke('apps:minimize', processId),
  getApplicationDetails: (processId) => ipcRenderer.invoke('apps:get-details', processId),
  
  // Database Connections Management
  getAllDatabaseConnections: () => ipcRenderer.invoke('db-connections:get-all'),
  addDatabaseConnection: (connectionData) => ipcRenderer.invoke('db-connections:add', connectionData),
  removeDatabaseConnection: (connectionId) => ipcRenderer.invoke('db-connections:remove', connectionId),
  updateDatabaseConnection: (connectionId, updates) => ipcRenderer.invoke('db-connections:update', connectionId, updates),
  testDatabaseConnection: (connectionId) => ipcRenderer.invoke('db-connections:test', connectionId),
  testAllDatabaseConnections: () => ipcRenderer.invoke('db-connections:test-all'),
  getDatabaseConnectionStatuses: () => ipcRenderer.invoke('db-connections:get-statuses'),
  getSupportedDatabaseTypes: () => ipcRenderer.invoke('db-connections:get-supported-types'),
  discoverAllDatabases: () => ipcRenderer.invoke('db-connections:discover-all'),
  fetchDatabaseCredentials: (dbType, instanceName) => ipcRenderer.invoke('db-connections:fetch-credentials', dbType, instanceName),
});

