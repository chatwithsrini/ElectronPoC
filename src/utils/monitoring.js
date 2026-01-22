const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Get application disk size recursively
 * @param {string} dirPath - Directory path to measure
 * @returns {Promise<number>} Size in bytes
 */
async function getDirectorySize(dirPath) {
  try {
    let totalSize = 0;
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      
      // Skip node_modules and other large directories that shouldn't be monitored
      if (item.name === 'node_modules' || item.name === '.git') {
        continue;
      }

      try {
        if (item.isDirectory()) {
          totalSize += await getDirectorySize(itemPath);
        } else if (item.isFile()) {
          const stats = await fs.stat(itemPath);
          totalSize += stats.size;
        }
      } catch (error) {
        // Skip files/directories we can't access
        continue;
      }
    }

    return totalSize;
  } catch (error) {
    console.error(`Error getting directory size for ${dirPath}:`, error);
    return 0;
  }
}

/**
 * Get current application metrics
 * @param {string} appPath - Application root path
 * @returns {Promise<Object>} Application metrics
 */
async function getApplicationMetrics(appPath) {
  try {
    const metrics = {
      timestamp: Date.now(),
      diskUsage: {
        appSize: 0,
        appSizeMB: 0,
        appSizeGB: 0,
      },
      memory: {
        totalMemoryGB: 0,
        freeMemoryGB: 0,
        usedMemoryGB: 0,
        usedMemoryPercent: 0,
      },
      cpu: {
        cores: 0,
        model: '',
        loadAverage: [],
      },
      process: {
        memoryUsageMB: 0,
        uptime: 0,
        pid: process.pid,
      },
    };

    // Get disk usage
    const appSize = await getDirectorySize(appPath);
    metrics.diskUsage.appSize = appSize;
    metrics.diskUsage.appSizeMB = (appSize / (1024 * 1024)).toFixed(2);
    metrics.diskUsage.appSizeGB = (appSize / (1024 * 1024 * 1024)).toFixed(4);

    // Get memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    metrics.memory.totalMemoryGB = (totalMemory / (1024 * 1024 * 1024)).toFixed(2);
    metrics.memory.freeMemoryGB = (freeMemory / (1024 * 1024 * 1024)).toFixed(2);
    metrics.memory.usedMemoryGB = (usedMemory / (1024 * 1024 * 1024)).toFixed(2);
    metrics.memory.usedMemoryPercent = ((usedMemory / totalMemory) * 100).toFixed(1);

    // Get CPU information
    const cpus = os.cpus();
    metrics.cpu.cores = cpus.length;
    metrics.cpu.model = cpus[0]?.model || 'Unknown';
    metrics.cpu.loadAverage = os.loadavg().map(load => load.toFixed(2));

    // Get process metrics
    const memUsage = process.memoryUsage();
    metrics.process.memoryUsageMB = (memUsage.heapUsed / (1024 * 1024)).toFixed(2);
    metrics.process.uptime = Math.floor(process.uptime());

    return metrics;
  } catch (error) {
    console.error('Error getting application metrics:', error);
    throw error;
  }
}

/**
 * Analyze metrics and detect scale changes
 * @param {Object} currentMetrics - Current metrics
 * @param {Object} previousMetrics - Previous metrics
 * @returns {Object} Analysis result
 */
function analyzeMetrics(currentMetrics, previousMetrics) {
  const analysis = {
    needsScaleUp: false,
    needsScaleDown: false,
    alerts: [],
    changes: {
      appSize: 0,
      appSizePercent: 0,
      memory: 0,
      memoryPercent: 0,
    },
  };

  if (!previousMetrics) {
    return analysis;
  }

  // Calculate app size change
  const currentSize = parseFloat(currentMetrics.diskUsage.appSizeMB);
  const previousSize = parseFloat(previousMetrics.diskUsage.appSizeMB);
  const sizeChange = currentSize - previousSize;
  const sizeChangePercent = previousSize > 0 ? ((sizeChange / previousSize) * 100) : 0;

  analysis.changes.appSize = sizeChange.toFixed(2);
  analysis.changes.appSizePercent = sizeChangePercent.toFixed(2);

  // Calculate memory change
  const currentMemPercent = parseFloat(currentMetrics.memory.usedMemoryPercent);
  const previousMemPercent = parseFloat(previousMetrics.memory.usedMemoryPercent);
  const memChange = currentMemPercent - previousMemPercent;

  analysis.changes.memory = memChange.toFixed(2);
  analysis.changes.memoryPercent = currentMemPercent.toFixed(1);

  // Detect scale up needs (app size increased significantly)
  if (sizeChangePercent > 5) {
    analysis.needsScaleUp = true;
    analysis.alerts.push({
      type: 'scale-up',
      severity: 'warning',
      message: `Application size increased by ${sizeChangePercent.toFixed(1)}% (${Math.abs(sizeChange).toFixed(2)} MB)`,
      timestamp: Date.now(),
    });
  }

  // Detect scale down opportunity (app size decreased significantly)
  if (sizeChangePercent < -5) {
    analysis.needsScaleDown = true;
    analysis.alerts.push({
      type: 'scale-down',
      severity: 'info',
      message: `Application size decreased by ${Math.abs(sizeChangePercent).toFixed(1)}% (${Math.abs(sizeChange).toFixed(2)} MB)`,
      timestamp: Date.now(),
    });
  }

  // Memory usage alerts
  if (currentMemPercent > 85) {
    analysis.needsScaleUp = true;
    analysis.alerts.push({
      type: 'memory-high',
      severity: 'warning',
      message: `High memory usage detected: ${currentMemPercent}%`,
      timestamp: Date.now(),
    });
  } else if (currentMemPercent < 30 && previousMemPercent > 50) {
    analysis.alerts.push({
      type: 'memory-low',
      severity: 'info',
      message: `Memory usage decreased significantly to ${currentMemPercent}%`,
      timestamp: Date.now(),
    });
  }

  // Process memory alerts
  const processMemMB = parseFloat(currentMetrics.process.memoryUsageMB);
  if (processMemMB > 500) {
    analysis.needsScaleUp = true;
    analysis.alerts.push({
      type: 'process-memory-high',
      severity: 'warning',
      message: `High process memory usage: ${processMemMB.toFixed(2)} MB`,
      timestamp: Date.now(),
    });
  }

  return analysis;
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format uptime to human-readable format
 * @param {number} seconds - Uptime in seconds
 * @returns {string} Formatted uptime
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

module.exports = {
  getApplicationMetrics,
  analyzeMetrics,
  getDirectorySize,
  formatBytes,
  formatUptime,
};
