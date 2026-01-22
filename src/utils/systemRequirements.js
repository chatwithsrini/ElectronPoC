const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * System Requirements Configuration
 * Adjust these values based on your application's needs
 */
const REQUIREMENTS = {
  MIN_OS_VERSION: {
    major: 10,
    build: 0, // Windows 10 (build 10240) or later
  },
  REQUIRED_ARCH: 'x64', // 64-bit only
  MIN_RAM_GB: 4, // Minimum 4GB RAM
  MIN_DISK_SPACE_GB: 2, // Minimum 2GB free disk space
  /**
   * REQUIRED_SERVICES
   * 
   * NOTE:
   * - This is intentionally empty by default so the app doesn't fail to start
   *   on machines that don't have SQL Server or other optional services
   * - If you want to enforce specific Windows services (e.g. MSSQLSERVER),
   *   add them to this array and the validation will fail when they are
   *   not running.
   *
   *   example:
   *   REQUIRED_SERVICES: ['MSSQLSERVER']
   */
  REQUIRED_SERVICES: [],
  SQL_SERVER_TIMEOUT_MS: 5000, // 5 seconds timeout for SQL connectivity check
};

/**
 * Check if running on Windows
 */
function isWindows() {
  return process.platform === 'win32';
}

/**
 * Get Windows version information
 * @returns {Promise<Object>} Windows version info
 */
async function getWindowsVersion() {
  if (!isWindows()) {
    throw new Error('Windows version check is only available on Windows OS');
  }

  try {
    // Use WMIC to get Windows version (more reliable than os.release())
    const { stdout } = await execAsync('wmic os get version /value');
    const lines = stdout.trim().split('\n');
    const versionInfo = {};
    
    lines.forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        versionInfo[key.trim()] = value.trim();
      }
    });

    // Parse version string (e.g., "10.0.19045")
    const versionString = versionInfo.Version || '';
    const parts = versionString.split('.').map(Number);
    
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      build: parts[2] || 0,
      fullVersion: versionString,
    };
  } catch (error) {
    console.error('Error getting Windows version:', error);
    // Fallback to os.release() if WMIC fails
    const release = os.release();
    const parts = release.split('.').map(Number);
    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      build: parts[2] || 0,
      fullVersion: release,
    };
  }
}

/**
 * Check if Windows version meets minimum requirements
 * @returns {Promise<Object>} Validation result
 */
async function validateWindowsVersion() {
  if (!isWindows()) {
    return {
      passed: false,
      error: 'This application requires Windows OS',
      details: `Current platform: ${process.platform}`,
    };
  }

  try {
    const version = await getWindowsVersion();
    const minVersion = REQUIREMENTS.MIN_OS_VERSION;

    if (version.major < minVersion.major) {
      return {
        passed: false,
        error: `Windows ${minVersion.major} or later is required`,
        details: `Current version: Windows ${version.major}.${version.minor} (Build ${version.build})`,
        currentVersion: version,
        requiredVersion: minVersion,
      };
    }

    if (version.major === minVersion.major && version.build < minVersion.build) {
      return {
        passed: false,
        error: `Windows ${minVersion.major} Build ${minVersion.build} or later is required`,
        details: `Current build: ${version.build}`,
        currentVersion: version,
        requiredVersion: minVersion,
      };
    }

    return {
      passed: true,
      version,
    };
  } catch (error) {
    return {
      passed: false,
      error: 'Failed to validate Windows version',
      details: error.message,
    };
  }
}

/**
 * Check system architecture
 * @returns {Object} Validation result
 */
function validateArchitecture() {
  const arch = os.arch();
  const requiredArch = REQUIREMENTS.REQUIRED_ARCH;

  if (arch !== requiredArch && arch !== 'x64') {
    return {
      passed: false,
      error: `${requiredArch}-bit architecture is required`,
      details: `Current architecture: ${arch}`,
      currentArch: arch,
      requiredArch,
    };
  }

  return {
    passed: true,
    architecture: arch,
  };
}

/**
 * Get total system RAM in GB
 * @returns {number} RAM in GB
 */
function getTotalRAM() {
  const totalBytes = os.totalmem();
  return totalBytes / (1024 * 1024 * 1024); // Convert to GB
}

/**
 * Check if system has minimum required RAM
 * @returns {Object} Validation result
 */
function validateRAM() {
  const totalRAM = getTotalRAM();
  const minRAM = REQUIREMENTS.MIN_RAM_GB;

  if (totalRAM < minRAM) {
    return {
      passed: false,
      error: `Minimum ${minRAM}GB RAM is required`,
      details: `Current RAM: ${totalRAM.toFixed(2)}GB`,
      currentRAM: totalRAM,
      requiredRAM: minRAM,
    };
  }

  return {
    passed: true,
    totalRAM,
    requiredRAM: minRAM,
  };
}

/**
 * Get free disk space for a given path
 * @param {string} path - Path to check (default: system drive)
 * @returns {Promise<number>} Free space in GB
 */
async function getFreeDiskSpace(path = 'C:\\') {
  if (!isWindows()) {
    throw new Error('Disk space check is only available on Windows OS');
  }

  try {
    // Use WMIC to get free disk space
    const { stdout } = await execAsync(`wmic logicaldisk where "DeviceID='${path.charAt(0)}:'" get FreeSpace /value`);
    const lines = stdout.trim().split('\n');
    
    for (const line of lines) {
      const [key, value] = line.split('=');
      if (key && key.trim() === 'FreeSpace' && value) {
        const freeBytes = parseInt(value.trim(), 10);
        return freeBytes / (1024 * 1024 * 1024); // Convert to GB
      }
    }
    
    throw new Error('Could not parse disk space information');
  } catch (error) {
    console.error('Error getting disk space:', error);
    // Fallback: try using fs.statfs if available (Node.js 18.6.0+)
    try {
      const fs = require('fs').promises;
      const stats = await fs.statfs(path);
      const freeBytes = stats.bavail * stats.bsize;
      return freeBytes / (1024 * 1024 * 1024);
    } catch (fallbackError) {
      throw new Error(`Failed to get disk space: ${error.message}`);
    }
  }
}

/**
 * Check if system has minimum required disk space
 * @param {string} path - Path to check (default: system drive)
 * @returns {Promise<Object>} Validation result
 */
async function validateDiskSpace(path = 'C:\\') {
  if (!isWindows()) {
    return {
      passed: false,
      error: 'Disk space validation is only available on Windows OS',
    };
  }

  try {
    const freeSpace = await getFreeDiskSpace(path);
    const minSpace = REQUIREMENTS.MIN_DISK_SPACE_GB;

    if (freeSpace < minSpace) {
      return {
        passed: false,
        error: `Minimum ${minSpace}GB free disk space is required`,
        details: `Available space: ${freeSpace.toFixed(2)}GB`,
        currentSpace: freeSpace,
        requiredSpace: minSpace,
        path,
      };
    }

    return {
      passed: true,
      freeSpace,
      requiredSpace: minSpace,
      path,
    };
  } catch (error) {
    return {
      passed: false,
      error: 'Failed to validate disk space',
      details: error.message,
    };
  }
}

/**
 * Check if running with administrator privileges
 * @returns {Promise<Object>} Validation result
 */
async function validateAdminPrivileges() {
  if (!isWindows()) {
    return {
      passed: false,
      error: 'Administrator check is only available on Windows OS',
    };
  }

  try {
    // Use net session to check for admin privileges
    // This command will fail if not running as admin
    await execAsync('net session');
    return {
      passed: true,
      isAdmin: true,
    };
  } catch (error) {
    // If net session fails, we're not running as admin
    return {
      passed: false,
      error: 'Administrator privileges are required',
      details: 'Please run this application as Administrator',
      isAdmin: false,
    };
  }
}

/**
 * Check if a Windows service is running
 * @param {string} serviceName - Name of the service to check
 * @returns {Promise<Object>} Service status
 */
async function checkWindowsService(serviceName) {
  if (!isWindows()) {
    throw new Error('Service check is only available on Windows OS');
  }

  try {
    const { stdout } = await execAsync(`sc query "${serviceName}"`);
    const isRunning = stdout.includes('RUNNING');
    
    return {
      name: serviceName,
      running: isRunning,
      status: isRunning ? 'running' : 'stopped',
    };
  } catch (error) {
    return {
      name: serviceName,
      running: false,
      status: 'not_found',
      error: error.message,
    };
  }
}

/**
 * Validate required Windows services
 * @returns {Promise<Object>} Validation result
 */
async function validateWindowsServices() {
  if (!isWindows()) {
    return {
      passed: false,
      error: 'Service validation is only available on Windows OS',
    };
  }

  const requiredServices = REQUIREMENTS.REQUIRED_SERVICES;
  const serviceChecks = await Promise.all(
    requiredServices.map(service => checkWindowsService(service))
  );

  const failedServices = serviceChecks.filter(check => !check.running);
  
  if (failedServices.length > 0) {
    return {
      passed: false,
      error: 'One or more required Windows services are not running',
      details: `Failed services: ${failedServices.map(s => s.name).join(', ')}`,
      services: serviceChecks,
      failedServices,
    };
  }

  return {
    passed: true,
    services: serviceChecks,
  };
}

/**
 * Check network connectivity to SQL Server
 * @param {string} server - SQL Server address (optional, will use registry if not provided)
 * @param {number} port - SQL Server port (default: 1433)
 * @returns {Promise<Object>} Connectivity result
 */
async function checkSqlServerConnectivity(server = null, port = 1433) {
  if (!isWindows()) {
    return {
      passed: false,
      error: 'SQL Server connectivity check is only available on Windows OS',
    };
  }

  try {
    // If server is not provided, try to get it from registry
    let sqlServer = server;
    if (!sqlServer) {
      try {
        const { getSqlCredentialsFromRegistry } = require('./sqlConnection');
        const config = await getSqlCredentialsFromRegistry();
        if (config && config.server) {
          // Extract server name (handle instance names like "server\instance")
          sqlServer = config.server.split('\\')[0].split(',')[0];
        }
      } catch (error) {
        // If registry read fails, we'll use a default check
        console.warn('Could not read SQL Server from registry:', error.message);
      }
    }

    if (!sqlServer) {
      return {
        passed: false,
        error: 'SQL Server address not configured',
        details: 'Please configure SQL Server connection in registry',
      };
    }

    // Use Test-NetConnection (PowerShell) or ping to check connectivity
    try {
      // Try PowerShell Test-NetConnection first (more reliable)
      const { stdout } = await execAsync(
        `powershell -Command "Test-NetConnection -ComputerName '${sqlServer}' -Port ${port} -InformationLevel Quiet -WarningAction SilentlyContinue"`
      );
      
      const isConnected = stdout.trim().toLowerCase() === 'true';
      
      if (isConnected) {
        return {
          passed: true,
          server: sqlServer,
          port,
          message: `Successfully connected to SQL Server at ${sqlServer}:${port}`,
        };
      } else {
        return {
          passed: false,
          error: `Cannot connect to SQL Server at ${sqlServer}:${port}`,
          details: 'Please verify SQL Server is running and network connectivity',
          server: sqlServer,
          port,
        };
      }
    } catch (error) {
      // Fallback to ping if PowerShell fails
      try {
        await execAsync(`ping -n 1 -w ${REQUIREMENTS.SQL_SERVER_TIMEOUT_MS} ${sqlServer}`);
        return {
          passed: true,
          server: sqlServer,
          port,
          message: `Network connectivity to ${sqlServer} is available (ping successful)`,
          note: 'Port-specific connectivity not verified',
        };
      } catch (pingError) {
        return {
          passed: false,
          error: `Cannot reach SQL Server at ${sqlServer}`,
          details: 'Network connectivity test failed. Please verify SQL Server is running and accessible.',
          server: sqlServer,
          port,
        };
      }
    }
  } catch (error) {
    return {
      passed: false,
      error: 'Failed to check SQL Server connectivity',
      details: error.message,
    };
  }
}

/**
 * Run all system requirements validations
 * @param {Object} options - Validation options
 * @param {boolean} options.checkServices - Whether to check Windows services (default: true)
 * @param {boolean} options.checkSqlConnectivity - Whether to check SQL Server connectivity (default: true)
 * @param {string} options.diskPath - Path to check disk space (default: 'C:\\')
 * @returns {Promise<Object>} Complete validation results
 */
async function validateAllSystemRequirements(options = {}) {
  const {
    checkServices = true,
    checkSqlConnectivity = true,
    diskPath = 'C:\\',
  } = options;

  const results = {
    passed: true,
    errors: [],
    warnings: [],
    checks: {},
  };

  // 1. Check Windows version
  const osCheck = await validateWindowsVersion();
  results.checks.osVersion = osCheck;
  if (!osCheck.passed) {
    results.passed = false;
    results.errors.push(osCheck.error);
  }

  // 2. Check architecture
  const archCheck = validateArchitecture();
  results.checks.architecture = archCheck;
  if (!archCheck.passed) {
    results.passed = false;
    results.errors.push(archCheck.error);
  }

  // 3. Check RAM
  const ramCheck = validateRAM();
  results.checks.ram = ramCheck;
  if (!ramCheck.passed) {
    results.passed = false;
    results.errors.push(ramCheck.error);
  }

  // 4. Check disk space
  const diskCheck = await validateDiskSpace(diskPath);
  results.checks.diskSpace = diskCheck;
  if (!diskCheck.passed) {
    results.passed = false;
    results.errors.push(diskCheck.error);
  }

  // 5. Check admin privileges (warning only, not blocking)
  const adminCheck = await validateAdminPrivileges();
  results.checks.adminPrivileges = adminCheck;
  if (!adminCheck.passed) {
    results.warnings.push(adminCheck.error);
  }

  // 6. Check Windows services (if enabled)
  if (checkServices) {
    const servicesCheck = await validateWindowsServices();
    results.checks.services = servicesCheck;
    if (!servicesCheck.passed) {
      results.passed = false;
      results.errors.push(servicesCheck.error);
    }
  }

  // 7. Check SQL Server connectivity (if enabled)
  if (checkSqlConnectivity) {
    const sqlCheck = await checkSqlServerConnectivity();
    results.checks.sqlConnectivity = sqlCheck;
    if (!sqlCheck.passed) {
      results.passed = false;
      results.errors.push(sqlCheck.error);
    }
  }

  return results;
}

/**
 * Get user-friendly error message for validation failures
 * @param {Object} validationResults - Results from validateAllSystemRequirements
 * @returns {string} Formatted error message
 */
function getValidationErrorMessage(validationResults) {
  if (validationResults.passed) {
    return null;
  }

  const messages = [
    'System Requirements Validation Failed',
    '',
    'The following system requirements are not met:',
    '',
  ];

  validationResults.errors.forEach((error, index) => {
    messages.push(`${index + 1}. ${error}`);
  });

  if (validationResults.warnings.length > 0) {
    messages.push('');
    messages.push('Warnings:');
    validationResults.warnings.forEach((warning, index) => {
      messages.push(`${index + 1}. ${warning}`);
    });
  }

  messages.push('');
  messages.push('Please resolve these issues and try again.');

  return messages.join('\n');
}

module.exports = {
  REQUIREMENTS,
  isWindows,
  getWindowsVersion,
  validateWindowsVersion,
  validateArchitecture,
  getTotalRAM,
  validateRAM,
  getFreeDiskSpace,
  validateDiskSpace,
  validateAdminPrivileges,
  checkWindowsService,
  validateWindowsServices,
  checkSqlServerConnectivity,
  validateAllSystemRequirements,
  getValidationErrorMessage,
};

