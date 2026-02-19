const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Default path to the Dentrix Service executable.
 * Mirrors the .NET configuration: DentrixServicePath in appsettings.json
 */
const DEFAULT_DENTRIX_SERVICE_PATH =
  process.env.DENTRIX_SERVICE_PATH ||
  'C:\\Program Files (x86)\\DentalXChange\\Eligibility AI\\Eligibility AI Configuration\\Dxc.Sync.Client.DentrixService.exe';

/**
 * Common Dentrix installation paths (Dentrix dental software).
 * Dentrix typically installs to C:\Program Files (x86)\Dentrix
 */
const DENTRIX_APP_PATHS = [
  'C:\\Program Files (x86)\\Dentrix',
  'C:\\Program Files\\Dentrix',
];

/** .NET 8 runtimeconfig.json for framework-dependent deployment (target net8.0, x86) */
const RUNTIMECONFIG_JSON = {
  runtimeOptions: {
    tfm: 'net8.0',
    framework: {
      name: 'Microsoft.NETCore.App',
      version: '8.0.0',
    },
    rollForward: 'LatestMinor',
  },
};

/**
 * Ensure Dxc.Sync.Client.DentrixService.runtimeconfig.json exists in the Dentrix Service folder.
 * When missing, the exe assumes self-contained and fails with hostpolicy.dll error.
 * Creating this file makes the exe run as framework-dependent using system .NET runtime.
 *
 * @param {string} dentrixServicePath - Path to Dxc.Sync.Client.DentrixService.exe
 * @returns {string|null} Path to runtimeconfig.json if created/exists, null on error
 */
function ensureDentrixServiceRuntimeConfig(dentrixServicePath) {
  const serviceDir = path.dirname(dentrixServicePath);
  const baseName = path.basename(dentrixServicePath, '.exe');
  const runtimeConfigPath = path.join(serviceDir, `${baseName}.runtimeconfig.json`);

  if (fs.existsSync(runtimeConfigPath)) {
    return runtimeConfigPath;
  }

  try {
    const content = JSON.stringify(RUNTIMECONFIG_JSON, null, 2);
    fs.writeFileSync(runtimeConfigPath, content, 'utf8');
    return runtimeConfigPath;
  } catch (err) {
    console.error('Failed to create Dentrix Service runtimeconfig.json:', err);
    return null;
  }
}

/**
 * Check if Dentrix is installed on the machine.
 * Mirrors the .NET DentrixFacade flow: Dentrix Service + Dentrix.API.dll are required.
 *
 * Detection steps (aligned with DentrixFacade.cs):
 * 1. Dentrix Service executable (Dxc.Sync.Client.DentrixService.exe) - uses Dentrix.API.dll
 * 2. Dentrix.API.dll in same folder as Dentrix Service (required for connection string retrieval)
 * 3. Optional: Dentrix application folder (C:\Program Files (x86)\Dentrix)
 *
 * @param {string} [dentrixServicePath] - Path to Dxc.Sync.Client.DentrixService.exe
 * @returns {Promise<Object>} { installed, dentrixServicePath, dentrixApiDllPath, dentrixAppPath, error, hint }
 */
async function checkDentrixInstallation(dentrixServicePath = DEFAULT_DENTRIX_SERVICE_PATH) {
  if (process.platform !== 'win32') {
    return {
      installed: false,
      error: 'Not a Windows system',
      hint: ['Dentrix is only supported on Windows'],
    };
  }

  const result = {
    installed: false,
    dentrixServicePath: null,
    dentrixApiDllPath: null,
    dentrixAppPath: null,
    error: null,
    hint: [],
  };

  // 1. Check Dentrix Service executable exists
  if (!fs.existsSync(dentrixServicePath)) {
    result.error = `Dentrix Service not found at: ${dentrixServicePath}`;
    result.hint = [
      'Ensure DentalXChange Eligibility AI is installed',
      'The Dentrix Service (Dxc.Sync.Client.DentrixService.exe) must be present',
      'Check: C:\\Program Files (x86)\\DentalXChange\\Eligibility AI\\Eligibility AI Configuration\\',
    ];
    return result;
  }

  result.dentrixServicePath = dentrixServicePath;

  // 2. Check Dentrix.API.dll - in Dentrix Service folder first, then in DENTRIX_APP_PATHS
  const serviceDir = path.dirname(dentrixServicePath);
  const searchPaths = [serviceDir, ...DENTRIX_APP_PATHS];

  let dentrixApiDllPath = null;
  for (const dir of searchPaths) {
    const dllPath = path.join(dir, 'Dentrix.API.dll');
    if (fs.existsSync(dllPath)) {
      dentrixApiDllPath = dllPath;
      break;
    }
  }

  if (!dentrixApiDllPath) {
    result.error = 'Dentrix.API.dll not found';
    result.hint = [
      'Dentrix.API.dll must be in the Dentrix Service folder or in one of:',
      ...DENTRIX_APP_PATHS.map((p) => `  - ${p}`),
      'Ensure Dentrix integration is properly deployed with DentalXChange Eligibility AI',
    ];
    return result;
  }

  result.dentrixApiDllPath = dentrixApiDllPath;

  // 3. Set dentrixAppPath if Dentrix application folder exists
  for (const appPath of DENTRIX_APP_PATHS) {
    if (fs.existsSync(appPath)) {
      result.dentrixAppPath = appPath;
      break;
    }
  }

  result.installed = true;
  result.message = 'Dentrix is installed (Dentrix Service + Dentrix.API.dll found)';
  return result;
}

/**
 * Check if Dentrix is installed and, if so, get the connection string via Dentrix Service.
 * Mirrors the .NET flow: DentrixFacade.GetDentrixCoreConnectionString() via DentrixHostClient.
 *
 * Steps (from DentrixFacade.cs):
 * 1. DENTRIXAPI_RegisterUser(keyFilePath) - register with .dtxkey certificate
 * 2. DENTRIXAPI_GetConnectionString(userId, password, connectionString, size)
 *
 * @param {string} [dentrixServicePath] - Path to Dxc.Sync.Client.DentrixService.exe
 * @returns {Promise<Object>} { installed, connectionString, config, success, error, hint, ... }
 */
async function checkDentrixAndGetConnectionString(dentrixServicePath = DEFAULT_DENTRIX_SERVICE_PATH) {
  const installCheck = await checkDentrixInstallation(dentrixServicePath);

  if (!installCheck.installed) {
    return {
      installed: false,
      connectionString: null,
      config: null,
      success: false,
      error: installCheck.error,
      hint: installCheck.hint,
      ...installCheck,
    };
  }

  // Dentrix is installed - get connection string via Dentrix Service (Dentrix.API.dll)
  const connResult = await getDentrixCoreConnectionString(dentrixServicePath);

  if (!connResult.success) {
    return {
      installed: true,
      connectionString: null,
      config: null,
      success: false,
      error: connResult.error,
      hint: connResult.hint,
      dentrixServicePath: installCheck.dentrixServicePath,
      dentrixApiDllPath: installCheck.dentrixApiDllPath,
      dentrixAppPath: installCheck.dentrixAppPath,
    };
  }

  const config = parseOdbcConnectionString(connResult.connectionString);

  return {
    installed: true,
    connectionString: connResult.connectionString,
    config: config || {},
    success: true,
    source: connResult.source,
    databaseType: connResult.databaseType,
    dentrixServicePath: installCheck.dentrixServicePath,
    dentrixApiDllPath: installCheck.dentrixApiDllPath,
    dentrixAppPath: installCheck.dentrixAppPath,
  };
}

/**
 * Generic Dentrix Service operation invoker.
 * Mirrors DentrixHostClient.RunAsync<T> - spawns exe, sends JSON stdin, reads JSON stdout.
 *
 * @param {string} op - Operation name: getConnectionInfo | testinitialization | uploadfiles
 * @param {Object} payload - JSON payload (e.g. {} for getConnectionInfo, { userName, password } for testinitialization)
 * @param {string} [dentrixServicePath] - Path to Dxc.Sync.Client.DentrixService.exe
 * @param {number} [timeoutMs] - Timeout in ms (default 120000)
 * @returns {Promise<Object>} { dentrixServiceSuccess, data, errorCode, message }
 */
async function runDentrixServiceOp(op, payload = {}, dentrixServicePath = DEFAULT_DENTRIX_SERVICE_PATH, timeoutMs = 120000) {
  if (process.platform !== 'win32') {
    return {
      dentrixServiceSuccess: false,
      data: null,
      errorCode: 'NotWindows',
      message: 'Dentrix Service is only available on Windows',
    };
  }

  if (!fs.existsSync(dentrixServicePath)) {
    return {
      dentrixServiceSuccess: false,
      data: null,
      errorCode: 'FileNotFound',
      message: `Dentrix Service not found at: ${dentrixServicePath}`,
    };
  }

  const workingDir = path.dirname(dentrixServicePath);
  const baseName = path.basename(dentrixServicePath, '.exe');
  const dllPath = path.join(workingDir, `${baseName}.dll`);
  const runtimeConfigPath = path.join(workingDir, `${baseName}.runtimeconfig.json`);

  // When runtimeconfig.json is missing, the exe fails with hostpolicy.dll error.
  // Strategy: 1) Try to create runtimeconfig.json if missing  2) Prefer dotnet when DLL exists
  ensureDentrixServiceRuntimeConfig(dentrixServicePath);
  const runtimeConfigExists = fs.existsSync(runtimeConfigPath);
  const dllExists = fs.existsSync(dllPath);

  // Use dotnet when: runtimeconfig still missing (e.g. no write permission) and DLL exists
  const useDotnet = dllExists && !runtimeConfigExists;

  const args = ['run', '--op', op];
  // Dentrix Service is x86 - prefer 32-bit dotnet when using dotnet fallback
  const dotnetExe = fs.existsSync('C:\\Program Files (x86)\\dotnet\\dotnet.exe')
    ? 'C:\\Program Files (x86)\\dotnet\\dotnet.exe'
    : 'dotnet';
  const executable = useDotnet ? dotnetExe : dentrixServicePath;
  const execArgs = useDotnet ? [dllPath, ...args] : args;

  return new Promise((resolve) => {
    const payloadStr = JSON.stringify(payload);

    const proc = spawn(executable, execArgs, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    const finish = (resp) => {
      if (resolved) return;
      resolved = true;
      resolve(resp);
    };

    const timeout = setTimeout(() => {
      try {
        proc.kill('SIGTERM');
      } catch (_) {}
      finish({
        dentrixServiceSuccess: false,
        data: null,
        errorCode: 'Timeout',
        message: `Dentrix Service timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      finish({
        dentrixServiceSuccess: false,
        data: null,
        errorCode: 'SpawnError',
        message: err.message || 'Failed to start Dentrix Service',
      });
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (resolved) return;

      const lastLine = stdout
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .pop();

      if (!lastLine) {
        finish({
          dentrixServiceSuccess: false,
          data: null,
          errorCode: 'NoResponse',
          message: stderr ? stderr.trim() : 'No response from Dentrix Service',
        });
        return;
      }

      try {
        const resp = JSON.parse(lastLine);
        finish(resp);
      } catch (_) {
        finish({
          dentrixServiceSuccess: false,
          data: null,
          errorCode: 'ParseError',
          message: `Invalid JSON: ${lastLine.substring(0, 200)}`,
        });
      }
    });

    proc.stdin.write(payloadStr, (err) => {
      if (err) {
        clearTimeout(timeout);
        finish({
          dentrixServiceSuccess: false,
          data: null,
          errorCode: 'WriteError',
          message: err.message || 'Failed to write to Dentrix Service stdin',
        });
      } else {
        proc.stdin.end();
      }
    });
  });
}

/**
 * Invoke the Dentrix Service executable to get the database connection string.
 * Mirrors DentrixHostClient.RunAsync<string>(dentrixServicePath, "getConnectionInfo", new { })
 *
 * @param {string} [dentrixServicePath] - Path to Dxc.Sync.Client.DentrixService.exe
 * @returns {Promise<Object>} Result object with success status and connection string or error
 */
async function getDentrixCoreConnectionString(dentrixServicePath = DEFAULT_DENTRIX_SERVICE_PATH) {
  const resp = await runDentrixServiceOp('getConnectionInfo', {}, dentrixServicePath);

  if (!resp.dentrixServiceSuccess) {
    return {
      success: false,
      error: resp.message || resp.errorCode || 'Unknown error',
      connectionString: null,
      hint: getDentrixErrorHint(resp.message),
    };
  }

  const connStr = resp.data != null ? String(resp.data).trim() : '';
  if (!connStr) {
    return {
      success: false,
      error: 'Empty connection string returned from Dentrix',
      connectionString: null,
      hint: [
        'Dentrix API returned an empty connection string',
        'Ensure Dentrix is properly configured and the .dtxkey certificate is valid',
        'Try opening Dentrix application to verify database connectivity',
      ],
    };
  }

  return {
    success: true,
    connectionString: connStr,
    source: 'Dentrix Service (Dentrix.API.dll)',
    databaseType: 'PracticeDatabase',
  };
}

/**
 * Test Dentrix API initialization with userName/password.
 * Mirrors DentrixHostClient.RunAsync<bool>(path, "testinitialization", { userName, password })
 *
 * @param {string} userName - Dentrix user name
 * @param {string} password - Dentrix password
 * @param {string} [dentrixServicePath] - Path to Dentrix Service executable
 * @returns {Promise<Object>} { success, initialized, error }
 */
async function testDentrixInitialization(userName, password, dentrixServicePath = DEFAULT_DENTRIX_SERVICE_PATH) {
  const resp = await runDentrixServiceOp('testinitialization', { userName: userName || '', password: password || '' }, dentrixServicePath);

  if (!resp.dentrixServiceSuccess) {
    return {
      success: false,
      initialized: false,
      error: resp.message || resp.errorCode || 'Initialization failed',
    };
  }

  const initialized = resp.data === true || resp.data === 'true';
  return {
    success: true,
    initialized,
    error: initialized ? null : (resp.message || 'Dentrix API initialization failed'),
  };
}

/**
 * Upload documents to Dentrix via Dentrix Service.
 * Mirrors DentrixHostClient.RunAsync<Dictionary>(path, "uploadfiles", documentInfos)
 *
 * DocumentInfo: { filePath, id, referenceId, category, description, date, note, userName, password }
 *
 * @param {Array<Object>} documents - Array of DocumentInfo objects
 * @param {string} [dentrixServicePath] - Path to Dentrix Service executable
 * @returns {Promise<Object>} { success, results: { [referenceId]: message }, error }
 */
async function uploadDentrixDocuments(documents, dentrixServicePath = DEFAULT_DENTRIX_SERVICE_PATH) {
  if (!Array.isArray(documents) || documents.length === 0) {
    return {
      success: false,
      results: {},
      error: 'Documents array is required and must not be empty',
    };
  }

  const payload = documents.map((doc) => ({
    filePath: doc.filePath,
    id: doc.id,
    referenceId: doc.referenceId,
    category: doc.category || '',
    description: doc.description || '',
    date: doc.date || '',
    note: doc.note || '',
    userName: doc.userName || '',
    password: doc.password || '',
  }));

  const resp = await runDentrixServiceOp('uploadfiles', payload, dentrixServicePath, 300000);

  if (!resp.dentrixServiceSuccess) {
    return {
      success: false,
      results: {},
      error: resp.message || resp.errorCode || 'Upload failed',
    };
  }

  const results = resp.data && typeof resp.data === 'object' ? resp.data : {};
  return {
    success: true,
    results,
    error: null,
  };
}

/**
 * Parse an ODBC connection string into a configuration object.
 * Reuses the same logic as Eaglesoft - Dentrix uses similar format:
 * UID=pdba;PWD=...;Server=EAGLESOFT;DBN=DENTSERV;ASTART=No
 *
 * @param {string} connectionString - ODBC connection string
 * @returns {Object|null} Parsed configuration object
 */
function parseOdbcConnectionString(connectionString) {
  if (!connectionString || typeof connectionString !== 'string') {
    return null;
  }

  const config = {};
  const parts = connectionString.split(';').filter((part) => part.trim().length > 0);

  for (const part of parts) {
    const equalIndex = part.indexOf('=');
    if (equalIndex === -1) continue;

    const key = part.substring(0, equalIndex).trim();
    const value = part.substring(equalIndex + 1).trim();
    const keyLower = key.toLowerCase();

    switch (keyLower) {
      case 'driver':
        config.driver = value;
        break;
      case 'server':
      case 'data source':
        config.server = value;
        break;
      case 'dsn':
        config.server = value;
        config.DSN = value;
        break;
      case 'database':
      case 'initial catalog':
        config.database = value;
        break;
      case 'dbn':
        config.database = value;
        config.DBN = value;
        break;
      case 'uid':
      case 'user id':
      case 'username':
        config.username = value;
        break;
      case 'pwd':
      case 'password':
        config.password = value;
        break;
      case 'port':
        config.port = parseInt(value, 10);
        break;
      case 'trusted_connection':
      case 'integrated security':
        config.windowsAuth =
          value.toLowerCase() === 'yes' || value.toLowerCase() === 'true' || value.toLowerCase() === 'sspi';
        break;
      case 'encrypt':
        config.encrypt = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
        break;
      case 'trustservercertificate':
        config.trustServerCertificate = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
        break;
      default:
        config[key] = value;
        break;
    }
  }

  return config;
}

/**
 * Get the Dentrix connection configuration as a parsed object
 *
 * @param {string} [dentrixServicePath] - Path to Dentrix Service executable
 * @returns {Promise<Object>} Result object with success status and parsed configuration
 */
async function getDentrixCoreConnectionConfig(dentrixServicePath) {
  try {
    const result = await getDentrixCoreConnectionString(dentrixServicePath);

    if (!result.success) {
      return result;
    }

    const config = parseOdbcConnectionString(result.connectionString);

    if (!config) {
      return {
        success: false,
        error: 'Failed to parse connection string',
        connectionString: result.connectionString,
      };
    }

    return {
      success: true,
      connectionString: result.connectionString,
      config,
      source: result.source,
      databaseType: result.databaseType,
    };
  } catch (error) {
    console.error('Error getting Dentrix connection config:', error);
    return {
      success: false,
      error: error.message || 'Failed to get Dentrix connection configuration',
      config: null,
    };
  }
}

/**
 * Test if Dentrix is installed on the system.
 * Uses checkDentrixInstallation for detection (Dentrix Service + Dentrix.API.dll).
 *
 * @param {string} [dentrixServicePath] - Path to Dentrix Service executable
 * @returns {Promise<Object>} Result object with installation status
 */
async function isDentrixInstalled(dentrixServicePath = DEFAULT_DENTRIX_SERVICE_PATH) {
  const installCheck = await checkDentrixInstallation(dentrixServicePath);

  if (!installCheck.installed) {
    return {
      installed: false,
      error: installCheck.error,
      message: installCheck.error,
      hint: installCheck.hint,
    };
  }

  // Optionally verify we can get a connection string
  const connResult = await getDentrixCoreConnectionString(dentrixServicePath);

  if (connResult.success) {
    return {
      installed: true,
      message: 'Dentrix is installed and connection string is accessible',
      dentrixServicePath: installCheck.dentrixServicePath,
      dentrixApiDllPath: installCheck.dentrixApiDllPath,
      dentrixAppPath: installCheck.dentrixAppPath,
    };
  }

  return {
    installed: true,
    message: 'Dentrix Service found but connection retrieval failed',
    dentrixServicePath: installCheck.dentrixServicePath,
    dentrixApiDllPath: installCheck.dentrixApiDllPath,
    dentrixAppPath: installCheck.dentrixAppPath,
    warning: connResult.error,
    hint: connResult.hint,
  };
}

/**
 * Get helpful error hints based on the error message
 *
 * @param {string} errorMessage - The error message
 * @returns {Array<string>} Array of hint strings
 */
function getDentrixErrorHint(errorMessage) {
  if (!errorMessage) return [];

  const hints = [];

  if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
    hints.push('Dentrix Service executable was not found.');
    hints.push('Ensure DentalXChange Eligibility AI is installed.');
    hints.push('Check that Dxc.Sync.Client.DentrixService.exe exists in the Eligibility AI Configuration folder.');
  } else if (errorMessage.includes('Failed to register') || errorMessage.includes('register user')) {
    hints.push('Dentrix API registration failed.');
    hints.push('Ensure the .dtxkey certificate file exists in the Dentrix Service Cert folder.');
    hints.push('Verify Dentrix is properly installed and configured.');
  } else if (errorMessage.includes('Empty connection string')) {
    hints.push('Dentrix returned an empty connection string.');
    hints.push('Ensure Dentrix database is properly configured.');
    hints.push('Open Dentrix application to verify database connectivity.');
  } else if (errorMessage.includes('timeout')) {
    hints.push('Request timed out while calling Dentrix Service.');
    hints.push('The Dentrix application or service may not be responding.');
  }

  return hints;
}

/**
 * Create a database connection object for use with the databaseConnections module
 *
 * @param {string} connectionName - Name for this connection
 * @param {string} [dentrixServicePath] - Path to Dentrix Service executable
 * @returns {Promise<Object>} Result object with connection data ready to be added
 */
async function createDentrixConnection(
  connectionName = 'Dentrix Database',
  dentrixServicePath = DEFAULT_DENTRIX_SERVICE_PATH
) {
  try {
    const result = await getDentrixCoreConnectionConfig(dentrixServicePath);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        hint: result.hint,
      };
    }

    const { config, connectionString } = result;

    let dbType = 'mssql';
    if (config.driver) {
      const driverLower = config.driver.toLowerCase();
      if (driverLower.includes('mysql')) {
        dbType = 'mysql';
      } else if (driverLower.includes('oracle')) {
        dbType = 'oracle';
      } else if (driverLower.includes('sqlite')) {
        dbType = 'sqlite';
      }
    }

    const connectionData = {
      name: connectionName,
      type: dbType,
      config: {
        server: config.server || 'localhost',
        database: config.database || '',
        port: config.port,
        username: config.username,
        password: config.password,
        windowsAuth: config.windowsAuth || false,
        encrypt: config.encrypt !== false,
        trustServerCertificate: config.trustServerCertificate === true,
        driver: config.driver,
        DSN: config.DSN,
        DBN: config.DBN,
        useOdbc: true,
        odbcConnectionString: connectionString,
      },
    };

    return {
      success: true,
      connectionData,
      source: result.source,
      databaseType: result.databaseType,
    };
  } catch (error) {
    console.error('Error creating Dentrix connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to create Dentrix connection',
    };
  }
}

module.exports = {
  ensureDentrixServiceRuntimeConfig,
  runDentrixServiceOp,
  getDentrixCoreConnectionString,
  getDentrixCoreConnectionConfig,
  testDentrixInitialization,
  uploadDentrixDocuments,
  parseOdbcConnectionString,
  isDentrixInstalled,
  checkDentrixInstallation,
  checkDentrixAndGetConnectionString,
  createDentrixConnection,
  getDentrixErrorHint,
  DEFAULT_DENTRIX_SERVICE_PATH,
  DENTRIX_APP_PATHS,
};
