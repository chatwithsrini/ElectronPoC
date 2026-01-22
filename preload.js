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
});

