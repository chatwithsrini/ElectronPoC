const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Check if running on Windows
 */
function isWindows() {
  return process.platform === 'win32';
}

/**
 * Get all Windows services
 * @returns {Promise<Array>} Array of service objects
 */
async function getWindowsServices() {
  if (!isWindows()) {
    throw new Error('Windows services are only available on Windows OS');
  }

  try {
    // Use PowerShell to get services with detailed information
    const command = `powershell -Command "Get-Service | Select-Object Name, DisplayName, Status, StartType | ConvertTo-Json -Depth 2"`;
    const { stdout, stderr } = await execAsync(command, { encoding: 'utf8' });

    if (stderr && !stdout) {
      throw new Error(`Failed to get services: ${stderr}`);
    }

    // Parse the JSON output
    const services = JSON.parse(stdout);
    
    // Handle both single object and array cases
    const servicesArray = Array.isArray(services) ? services : [services];
    
    // Map to a consistent format
    return servicesArray.map(service => ({
      name: service.Name || '',
      displayName: service.DisplayName || service.Name || '',
      status: service.Status || 'Unknown',
      startType: service.StartType || 'Unknown',
    }));
  } catch (error) {
    console.error('Error getting Windows services:', error);
    throw new Error(`Failed to retrieve Windows services: ${error.message}`);
  }
}

/**
 * Get service status
 * @param {string} serviceName - Name of the service
 * @returns {Promise<Object>} Service status information
 */
async function getServiceStatus(serviceName) {
  if (!isWindows()) {
    throw new Error('Windows services are only available on Windows OS');
  }

  try {
    const command = `powershell -Command "Get-Service -Name '${serviceName}' | Select-Object Name, DisplayName, Status, StartType | ConvertTo-Json"`;
    const { stdout, stderr } = await execAsync(command, { encoding: 'utf8' });

    if (stderr && !stdout) {
      throw new Error(`Failed to get service status: ${stderr}`);
    }

    const service = JSON.parse(stdout);
    return {
      name: service.Name || serviceName,
      displayName: service.DisplayName || serviceName,
      status: service.Status || 'Unknown',
      startType: service.StartType || 'Unknown',
    };
  } catch (error) {
    console.error(`Error getting status for service ${serviceName}:`, error);
    throw new Error(`Failed to get service status: ${error.message}`);
  }
}

/**
 * Start a Windows service
 * @param {string} serviceName - Name of the service
 * @returns {Promise<Object>} Result object
 */
async function startService(serviceName) {
  if (!isWindows()) {
    throw new Error('Windows services are only available on Windows OS');
  }

  try {
    const command = `powershell -Command "Start-Service -Name '${serviceName}' -ErrorAction Stop"`;
    await execAsync(command, { encoding: 'utf8' });
    
    // Get updated status
    const status = await getServiceStatus(serviceName);
    
    return {
      success: true,
      message: `Service '${serviceName}' started successfully`,
      service: status,
    };
  } catch (error) {
    console.error(`Error starting service ${serviceName}:`, error);
    return {
      success: false,
      error: error.message || `Failed to start service '${serviceName}'`,
    };
  }
}

/**
 * Stop a Windows service
 * @param {string} serviceName - Name of the service
 * @returns {Promise<Object>} Result object
 */
async function stopService(serviceName) {
  if (!isWindows()) {
    throw new Error('Windows services are only available on Windows OS');
  }

  try {
    const command = `powershell -Command "Stop-Service -Name '${serviceName}' -ErrorAction Stop"`;
    await execAsync(command, { encoding: 'utf8' });
    
    // Get updated status
    const status = await getServiceStatus(serviceName);
    
    return {
      success: true,
      message: `Service '${serviceName}' stopped successfully`,
      service: status,
    };
  } catch (error) {
    console.error(`Error stopping service ${serviceName}:`, error);
    return {
      success: false,
      error: error.message || `Failed to stop service '${serviceName}'`,
    };
  }
}

/**
 * Restart a Windows service
 * @param {string} serviceName - Name of the service
 * @returns {Promise<Object>} Result object
 */
async function restartService(serviceName) {
  if (!isWindows()) {
    throw new Error('Windows services are only available on Windows OS');
  }

  try {
    const command = `powershell -Command "Restart-Service -Name '${serviceName}' -ErrorAction Stop"`;
    await execAsync(command, { encoding: 'utf8' });
    
    // Get updated status
    const status = await getServiceStatus(serviceName);
    
    return {
      success: true,
      message: `Service '${serviceName}' restarted successfully`,
      service: status,
    };
  } catch (error) {
    console.error(`Error restarting service ${serviceName}:`, error);
    return {
      success: false,
      error: error.message || `Failed to restart service '${serviceName}'`,
    };
  }
}

module.exports = {
  getWindowsServices,
  getServiceStatus,
  startService,
  stopService,
  restartService,
  isWindows,
};
