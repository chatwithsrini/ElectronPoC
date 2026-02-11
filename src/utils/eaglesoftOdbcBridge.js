/**
 * Eaglesoft ODBC Bridge for 32-bit Architecture
 * 
 * This module acts as a bridge between the 64-bit Electron app and the 32-bit
 * Eaglesoft ODBC DSN. It uses 32-bit PowerShell to access 32-bit ODBC drivers.
 * 
 * This approach mirrors how the .NET project uses Eaglesoft.COMWrapper32Bit
 * and doesn't require any additional installations (PowerShell is built-in).
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

/**
 * Path to 32-bit PowerShell (required for 32-bit ODBC access)
 */
const POWERSHELL_32BIT_PATH = '%SystemRoot%\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe';

/**
 * Test an ODBC connection using 32-bit PowerShell
 * @param {Object} config - Connection configuration with DSN, DBN, username, password
 * @returns {Promise<Object>} Result object with success, message, error, etc.
 */
async function testOdbcConnection32Bit(config) {
  // Build ODBC connection string
  const connectionString =
    config.odbcConnectionString ||
    [
      config.DBN ? `DBN=${config.DBN}` : null,
      config.DSN ? `DSN=${config.DSN}` : null,
      config.username ? `UID=${config.username}` : null,
      config.password ? `PWD=${config.password}` : null,
    ]
      .filter(Boolean)
      .join(';');

  if (!connectionString) {
    return {
      success: false,
      error: 'Missing ODBC connection string information',
    };
  }

  // PowerShell script to test ODBC connection via .NET ODBC classes
  // Using 32-bit PowerShell ensures we can access 32-bit ODBC drivers.
  //
  // IMPORTANT:
  // - We wrap the connection string in SINGLE quotes in PowerShell:
  //     $connectionString = '...'
  // - In single-quoted strings, PowerShell treats characters literally,
  //   including the backtick (`), so the password VwnAKYX` is preserved.
  // - The ONLY thing we must escape is a single quote itself, by doubling it.
  const escapedConnectionString = connectionString.replace(/'/g, "''");

  const powershellScript = `
$ErrorActionPreference = "Stop"
try {
  # Load .NET ODBC classes
  Add-Type -AssemblyName System.Data

  # Connection string (using single quotes to avoid most escaping issues)
  $connectionString = '${escapedConnectionString}'
  
  # Create ODBC connection
  $connection = New-Object System.Data.Odbc.OdbcConnection($connectionString)
  
  # Attempt to open connection
  $connection.Open()
  
  # If we get here, connection succeeded
  Write-Output "SUCCESS"
  
  # Try to execute a simple test query
  $command = $connection.CreateCommand()
  $command.CommandText = "SELECT 1 AS TestValue"
  $reader = $command.ExecuteReader()
  
  if ($reader.Read()) {
    Write-Output "QUERY_SUCCESS"
  }
  
  $reader.Close()
  $connection.Close()
  
  exit 0
} catch {
  Write-Output "ERROR: $($_.Exception.Message)"
  
  # Add specific error details for common issues
  $errorMessage = $_.Exception.Message
  
  if ($errorMessage -like "*Data source name not found*" -or $errorMessage -like "*IM002*") {
    Write-Output "HINT: DSN not configured in 32-bit ODBC Data Source Administrator"
  } elseif ($errorMessage -like "*login failed*" -or $errorMessage -like "*28000*") {
    Write-Output "HINT: Invalid username or password"
  } elseif ($errorMessage -like "*unable to connect*" -or $errorMessage -like "*08001*") {
    Write-Output "HINT: Cannot connect to database server"
  }
  
  exit 1
}
`.trim();

  // Encode the script to Base64 (UTF-16LE) for safe execution
  const encodedScript = Buffer.from(powershellScript, 'utf16le').toString('base64');

  try {
    // Execute using 32-bit PowerShell
    const { stdout, stderr } = await execPromise(
      `${POWERSHELL_32BIT_PATH} -NoProfile -NonInteractive -EncodedCommand ${encodedScript}`,
      { timeout: 30000 }
    );

    const output = stdout.trim();
    const lines = output.split('\n').map(line => line.trim());

    // Check for success indicators
    if (lines.includes('SUCCESS')) {
      return {
        success: true,
        message: 'ODBC connection successful (via 32-bit PowerShell)',
        serverInfo: {
          version: 'ODBC connection (32-bit)',
          currentUser: config.username || 'N/A',
          currentDatabase: config.DBN || config.database || 'N/A',
          serverName: config.DSN || config.server || 'N/A',
        },
      };
    }

    // Check for error messages
    const errorLines = lines.filter(line => line.startsWith('ERROR:'));
    const hintLines = lines.filter(line => line.startsWith('HINT:'));

    if (errorLines.length > 0) {
      const errorMessage = errorLines[0].replace('ERROR: ', '');
      const hints = hintLines.map(line => line.replace('HINT: ', ''));

      // Add general hints if none provided
      if (hints.length === 0) {
        hints.push(`Verify DSN "${config.DSN || config.server}" exists in ODBC Data Source Administrator (32-bit).`);
        hints.push('Open Windows Start → Search for "ODBC Data Sources (32-bit)".');
        hints.push('Ensure Eaglesoft application can connect to the database.');
      }

      return {
        success: false,
        error: errorMessage,
        hint: hints,
      };
    }

    // Unexpected output
    return {
      success: false,
      error: 'Unexpected response from ODBC test',
      output: output,
    };
  } catch (error) {
    // PowerShell process returned a non-zero exit code.
    // However, stdout/stderr may still contain our SUCCESS/ERROR/HINT markers.
    const stdout = (error && error.stdout ? String(error.stdout) : '').trim();
    const stderr = (error && error.stderr ? String(error.stderr) : '').trim();
    const combined = `${stdout}\n${stderr}`.trim();

    if (combined) {
      const lines = combined.split('\n').map(line => line.trim());

      // If SUCCESS is present anywhere, treat as success.
      if (lines.some(line => line === 'SUCCESS')) {
        return {
          success: true,
          message: 'ODBC connection successful (via 32-bit PowerShell)',
          serverInfo: {
            version: 'ODBC connection (32-bit)',
            currentUser: config.username || 'N/A',
            currentDatabase: config.DBN || config.database || 'N/A',
            serverName: config.DSN || config.server || 'N/A',
          },
        };
      }

      const errorLines = lines.filter(line => line.startsWith('ERROR:'));
      const hintLines = lines.filter(line => line.startsWith('HINT:'));

      if (errorLines.length > 0) {
        const errorMessage = errorLines[0].replace('ERROR: ', '');
        const hints = hintLines.map(line => line.replace('HINT: ', ''));

        if (hints.length === 0) {
          hints.push(`Verify DSN "${config.DSN || config.server}" exists in ODBC Data Source Administrator (32-bit).`);
          hints.push('Open Windows Start → Search for "ODBC Data Sources (32-bit)".');
          hints.push('Ensure Eaglesoft application can connect to the database.');
        }

        return {
          success: false,
          error: errorMessage,
          hint: hints,
          rawOutput: combined,
        };
      }

      // Fallback: propagate combined output for diagnostics.
      return {
        success: false,
        error: 'Failed to execute 32-bit PowerShell ODBC test',
        output: combined,
      };
    }

    // No useful stdout/stderr; generic failure.
    return {
      success: false,
      error: error.message || 'Failed to execute 32-bit PowerShell ODBC test',
      hint: [
        'Ensure 32-bit PowerShell is available on your system.',
        `Expected path: ${POWERSHELL_32BIT_PATH}`,
        'This should be available by default on 64-bit Windows systems.',
      ],
    };
  }
}

module.exports = {
  testOdbcConnection32Bit,
};
