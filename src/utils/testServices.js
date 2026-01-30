const fs = require('fs').promises;
const path = require('path');

/**
 * Get the test services directory path
 * @param {string} appPath - Application root path
 * @returns {string} Test services directory path
 */
function getTestServicesDir(appPath) {
  return path.join(appPath, 'test-services');
}

/**
 * Get test service file path
 * @param {string} appPath - Application root path
 * @param {string} serviceName - Service name
 * @returns {string} Service file path
 */
function getTestServicePath(appPath, serviceName) {
  const servicesDir = getTestServicesDir(appPath);
  return path.join(servicesDir, `${serviceName}.dat`);
}

/**
 * Create a dummy file of specified size
 * @param {string} filePath - Path to the file
 * @param {number} sizeMB - Size in megabytes
 * @returns {Promise<void>}
 */
async function createDummyFile(filePath, sizeMB) {
  const sizeBytes = sizeMB * 1024 * 1024; // Convert MB to bytes
  const chunkSize = 1024 * 1024; // 1MB chunks
  const chunk = Buffer.alloc(chunkSize, 0); // Fill with zeros
  
  const fileHandle = await fs.open(filePath, 'w');
  try {
    let written = 0;
    while (written < sizeBytes) {
      const toWrite = Math.min(chunkSize, sizeBytes - written);
      await fileHandle.write(chunk, 0, toWrite);
      written += toWrite;
    }
  } finally {
    await fileHandle.close();
  }
}

/**
 * Get all test services
 * @param {string} appPath - Application root path
 * @returns {Promise<Array>} Array of test service objects
 */
async function getTestServices(appPath) {
  try {
    const servicesDir = getTestServicesDir(appPath);
    
    // Check if directory exists
    try {
      await fs.access(servicesDir);
    } catch {
      // Directory doesn't exist, return empty array
      return [];
    }

    const files = await fs.readdir(servicesDir);
    const services = [];

    for (const file of files) {
      if (file.endsWith('.dat')) {
        const serviceName = path.basename(file, '.dat');
        const filePath = path.join(servicesDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          services.push({
            name: serviceName,
            displayName: `Test Service ${serviceName}`,
            status: 'running', // Test services are always "running" when they exist
            sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
            sizeBytes: stats.size,
            createdAt: stats.birthtime.toISOString(),
            filePath: filePath,
          });
        } catch (error) {
          console.error(`Error reading service file ${file}:`, error);
        }
      }
    }

    return services.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error getting test services:', error);
    throw new Error(`Failed to get test services: ${error.message}`);
  }
}

/**
 * Create a test service
 * @param {string} appPath - Application root path
 * @param {string} serviceName - Name of the service
 * @param {number} sizeMB - Size in megabytes (default: 10MB)
 * @returns {Promise<Object>} Result object
 */
async function createTestService(appPath, serviceName, sizeMB = 10) {
  try {
    const servicesDir = getTestServicesDir(appPath);
    const servicePath = getTestServicePath(appPath, serviceName);

    // Check if service already exists
    try {
      await fs.access(servicePath);
      return {
        success: false,
        error: `Test service '${serviceName}' already exists`,
      };
    } catch {
      // File doesn't exist, proceed with creation
    }

    // Create directory if it doesn't exist
    try {
      await fs.mkdir(servicesDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore
    }

    // Create the dummy file
    await createDummyFile(servicePath, sizeMB);

    // Get file stats to return actual size
    const stats = await fs.stat(servicePath);

    return {
      success: true,
      message: `Test service '${serviceName}' created successfully`,
      service: {
        name: serviceName,
        displayName: `Test Service ${serviceName}`,
        status: 'running',
        sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
        sizeBytes: stats.size,
        createdAt: stats.birthtime.toISOString(),
        filePath: servicePath,
      },
    };
  } catch (error) {
    console.error(`Error creating test service ${serviceName}:`, error);
    return {
      success: false,
      error: error.message || `Failed to create test service '${serviceName}'`,
    };
  }
}

/**
 * Stop/Remove a test service
 * @param {string} appPath - Application root path
 * @param {string} serviceName - Name of the service
 * @returns {Promise<Object>} Result object
 */
async function stopTestService(appPath, serviceName) {
  try {
    const servicePath = getTestServicePath(appPath, serviceName);

    // Check if service exists
    try {
      await fs.access(servicePath);
    } catch {
      return {
        success: false,
        error: `Test service '${serviceName}' does not exist`,
      };
    }

    // Delete the file
    await fs.unlink(servicePath);

    // Try to remove directory if empty
    const servicesDir = getTestServicesDir(appPath);
    try {
      const files = await fs.readdir(servicesDir);
      if (files.length === 0) {
        await fs.rmdir(servicesDir);
      }
    } catch {
      // Ignore errors when removing directory
    }

    return {
      success: true,
      message: `Test service '${serviceName}' stopped and removed successfully`,
    };
  } catch (error) {
    console.error(`Error stopping test service ${serviceName}:`, error);
    return {
      success: false,
      error: error.message || `Failed to stop test service '${serviceName}'`,
    };
  }
}

/**
 * Stop/Remove all test services
 * @param {string} appPath - Application root path
 * @returns {Promise<Object>} Result object
 */
async function stopAllTestServices(appPath) {
  try {
    const services = await getTestServices(appPath);
    const results = [];

    for (const service of services) {
      const result = await stopTestService(appPath, service.name);
      results.push({
        serviceName: service.name,
        success: result.success,
        error: result.error,
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return {
      success: failCount === 0,
      message: `Stopped ${successCount} test service(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
      results,
    };
  } catch (error) {
    console.error('Error stopping all test services:', error);
    return {
      success: false,
      error: error.message || 'Failed to stop all test services',
    };
  }
}

/**
 * Get total size of all test services
 * @param {string} appPath - Application root path
 * @returns {Promise<Object>} Size information
 */
async function getTestServicesTotalSize(appPath) {
  try {
    const services = await getTestServices(appPath);
    const totalBytes = services.reduce((sum, service) => sum + service.sizeBytes, 0);
    
    return {
      totalBytes,
      totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
      totalGB: (totalBytes / (1024 * 1024 * 1024)).toFixed(4),
      count: services.length,
    };
  } catch (error) {
    console.error('Error getting test services total size:', error);
    return {
      totalBytes: 0,
      totalMB: '0.00',
      totalGB: '0.0000',
      count: 0,
    };
  }
}

module.exports = {
  getTestServices,
  createTestService,
  stopTestService,
  stopAllTestServices,
  getTestServicesTotalSize,
  getTestServicesDir,
};
