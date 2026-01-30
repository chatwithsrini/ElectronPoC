const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * Get list of running applications (processes with windows)
 * @returns {Promise<Array>} List of running applications
 */
async function getRunningApplications() {
  try {
    // Get processes with window titles using PowerShell
    // Using -EncodedCommand to avoid quote escaping issues
    const psScript = `Get-Process | Where-Object {\$_.MainWindowTitle -ne ''} | Select-Object -Property Id, ProcessName, MainWindowTitle, @{Name='Memory';Expression={[math]::Round(\$_.WorkingSet64 / 1MB, 2)}}, @{Name='CPU';Expression={if (\$_.CPU) {[math]::Round(\$_.CPU, 2)} else {0}}} | ConvertTo-Json`;

    const { stdout, stderr } = await execPromise(`powershell -NoProfile -NonInteractive -Command "${psScript}"`, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 30000, // 30 second timeout
      windowsHide: true,
    });

    if (stderr && stderr.trim()) {
      console.error('PowerShell stderr:', stderr);
    }

    if (!stdout || stdout.trim() === '') {
      return [];
    }

    const output = stdout.trim();
    
    let processes = [];

    try {
      // Parse JSON output
      const parsed = JSON.parse(output);
      processes = Array.isArray(parsed) ? parsed : [parsed];
    } catch (parseError) {
      console.error('Error parsing PowerShell output:', parseError);
      console.error('Output was:', output.substring(0, 500));
      return [];
    }

    // Filter and format the results
    const applications = processes
      .filter(proc => {
        if (!proc || !proc.MainWindowTitle || !proc.ProcessName) {
          return false;
        }
        // Filter out empty or very short window titles
        if (proc.MainWindowTitle.trim().length === 0) {
          return false;
        }
        return true;
      })
      .map(proc => ({
        id: proc.Id,
        name: proc.ProcessName,
        title: proc.MainWindowTitle,
        memory: typeof proc.Memory === 'number' ? proc.Memory : 0, // Memory in MB
        cpu: typeof proc.CPU === 'number' ? proc.CPU : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return applications;
  } catch (error) {
    console.error('Error getting running applications:', error);
    throw new Error(`Failed to get running applications: ${error.message}`);
  }
}

/**
 * Close an application by process ID
 * @param {number} processId - Process ID to close
 * @returns {Promise<Object>} Result object
 */
async function closeApplication(processId) {
  try {
    // Try graceful close first using taskkill
    const { stdout, stderr } = await execPromise(`taskkill /PID ${processId}`, {
      timeout: 5000,
    });

    return {
      success: true,
      message: `Application closed successfully (PID: ${processId})`,
    };
  } catch (error) {
    console.error(`Error closing application (PID: ${processId}):`, error);
    return {
      success: false,
      error: error.message || `Failed to close application (PID: ${processId})`,
    };
  }
}

/**
 * Force close an application by process ID
 * @param {number} processId - Process ID to force close
 * @returns {Promise<Object>} Result object
 */
async function forceCloseApplication(processId) {
  try {
    // Force close using taskkill /F
    const { stdout, stderr } = await execPromise(`taskkill /F /PID ${processId}`, {
      timeout: 5000,
    });

    return {
      success: true,
      message: `Application force closed successfully (PID: ${processId})`,
    };
  } catch (error) {
    console.error(`Error force closing application (PID: ${processId}):`, error);
    return {
      success: false,
      error: error.message || `Failed to force close application (PID: ${processId})`,
    };
  }
}

/**
 * Bring application window to front (focus)
 * @param {number} processId - Process ID to focus
 * @returns {Promise<Object>} Result object
 */
async function focusApplication(processId) {
  try {
    // Use PowerShell with a simpler approach using Add-Type with -TypeDefinition
    const psScript = `\$proc = Get-Process -Id ${processId} -ErrorAction SilentlyContinue; if (\$proc -and \$proc.MainWindowHandle -ne 0) { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32Util { [DllImport(\\"user32.dll\\")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport(\\"user32.dll\\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }' -ErrorAction SilentlyContinue; [Win32Util]::ShowWindow(\$proc.MainWindowHandle, 9); [Win32Util]::SetForegroundWindow(\$proc.MainWindowHandle); Write-Output 'Success' } else { Write-Output 'Failed' }`;

    const { stdout, stderr } = await execPromise(`powershell -NoProfile -NonInteractive -Command "${psScript}"`, {
      timeout: 10000,
      windowsHide: true,
    });

    if (stdout && stdout.includes('Success')) {
      return {
        success: true,
        message: `Application focused successfully (PID: ${processId})`,
      };
    } else {
      return {
        success: false,
        error: 'Failed to focus application window - process may not have a visible window',
      };
    }
  } catch (error) {
    console.error(`Error focusing application (PID: ${processId}):`, error);
    return {
      success: false,
      error: error.message || `Failed to focus application (PID: ${processId})`,
    };
  }
}

/**
 * Minimize application window
 * @param {number} processId - Process ID to minimize
 * @returns {Promise<Object>} Result object
 */
async function minimizeApplication(processId) {
  try {
    // Use PowerShell with a simpler approach using Add-Type with -TypeDefinition
    const psScript = `\$proc = Get-Process -Id ${processId} -ErrorAction SilentlyContinue; if (\$proc -and \$proc.MainWindowHandle -ne 0) { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32Min { [DllImport(\\"user32.dll\\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }' -ErrorAction SilentlyContinue; [Win32Min]::ShowWindow(\$proc.MainWindowHandle, 6); Write-Output 'Success' } else { Write-Output 'Failed' }`;

    const { stdout, stderr } = await execPromise(`powershell -NoProfile -NonInteractive -Command "${psScript}"`, {
      timeout: 10000,
      windowsHide: true,
    });

    if (stdout && stdout.includes('Success')) {
      return {
        success: true,
        message: `Application minimized successfully (PID: ${processId})`,
      };
    } else {
      return {
        success: false,
        error: 'Failed to minimize application window - process may not have a visible window',
      };
    }
  } catch (error) {
    console.error(`Error minimizing application (PID: ${processId}):`, error);
    return {
      success: false,
      error: error.message || `Failed to minimize application (PID: ${processId})`,
    };
  }
}

/**
 * Get detailed information about a specific application
 * @param {number} processId - Process ID
 * @returns {Promise<Object>} Application details
 */
async function getApplicationDetails(processId) {
  try {
    const psScript = `
      $proc = Get-Process -Id ${processId} -ErrorAction SilentlyContinue;
      if ($proc) {
        $info = @{
          Id = $proc.Id
          ProcessName = $proc.ProcessName
          MainWindowTitle = $proc.MainWindowTitle
          StartTime = $proc.StartTime
          TotalProcessorTime = $proc.TotalProcessorTime.TotalSeconds
          WorkingSet = [math]::Round($proc.WorkingSet64 / 1MB, 2)
          VirtualMemorySize = [math]::Round($proc.VirtualMemorySize64 / 1MB, 2)
          Path = $proc.Path
          Company = $proc.Company
          ProductVersion = $proc.ProductVersion
          FileVersion = $proc.FileVersion
          Responding = $proc.Responding
          Threads = $proc.Threads.Count
        }
        $info | ConvertTo-Json
      }
    `;

    const { stdout, stderr } = await execPromise(`powershell -Command "${psScript}"`, {
      timeout: 5000,
    });

    if (!stdout || stdout.trim() === '') {
      throw new Error('Application not found');
    }

    const details = JSON.parse(stdout.trim());
    return {
      success: true,
      details: {
        id: details.Id,
        name: details.ProcessName,
        title: details.MainWindowTitle,
        startTime: details.StartTime,
        cpuTime: details.TotalProcessorTime,
        memory: details.WorkingSet,
        virtualMemory: details.VirtualMemorySize,
        path: details.Path,
        company: details.Company,
        version: details.ProductVersion || details.FileVersion,
        responding: details.Responding,
        threads: details.Threads,
      },
    };
  } catch (error) {
    console.error(`Error getting application details (PID: ${processId}):`, error);
    return {
      success: false,
      error: error.message || `Failed to get application details (PID: ${processId})`,
    };
  }
}

module.exports = {
  getRunningApplications,
  closeApplication,
  forceCloseApplication,
  focusApplication,
  minimizeApplication,
  getApplicationDetails,
};
