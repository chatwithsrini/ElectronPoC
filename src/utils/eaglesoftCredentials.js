const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

/**
 * Detect which PowerShell executable can access the Eaglesoft COM object
 * @returns {Promise<string|null>} Path to working PowerShell or null
 */
async function detectWorkingPowerShell() {
  // More robust COM check that does not rely on exit codes,
  // and instead inspects the textual output. This avoids issues
  // where PowerShell exits with a non-zero code even when COM is
  // technically available.
  const testScript = `
$ErrorActionPreference = "Stop"
try {
  $null = New-Object -ComObject "EaglesoftSettings.EaglesoftSettings"
  Write-Output "SUCCESS"
} catch {
  Write-Output ("ERROR: " + $_.Exception.Message)
}
`.trim();

  const encodedScript = Buffer.from(testScript, 'utf16le').toString('base64');
  
  // Eaglesoft is typically a 32-bit application, so try 32-bit PowerShell first
  const powershellPaths = [
    '%SystemRoot%\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe', // 32-bit (try first)
    'powershell.exe', // 64-bit (fallback)
  ];

  for (const psPath of powershellPaths) {
    try {
      console.log(`Testing PowerShell: ${psPath}`);
      
      const { stdout, stderr } = await execPromise(
        `${psPath} -NoProfile -NonInteractive -EncodedCommand ${encodedScript}`,
        { timeout: 5000 }
      );

      const output = (stdout || '').trim();

      if (stderr && stderr.trim()) {
        console.log(`PowerShell stderr (${psPath}):`, stderr.trim());
      }

      if (output === 'SUCCESS') {
        console.log(`✓ Found working PowerShell: ${psPath}`);
        return psPath;
      }

      if (output.startsWith('ERROR:')) {
        console.log(`✗ Failed with ${psPath}: ${output}`);
      } else {
        console.log(`✗ Unexpected output with ${psPath}: ${output}`);
      }
    } catch (error) {
      console.log(`✗ Exception with ${psPath}: ${error.message}`);
      continue;
    }
  }

  return null;
}

/**
 * Fetch the Eaglesoft database connection string from the locally installed
 * Eaglesoft application using the EaglesoftSettings COM object.
 * 
 * This mimics the .NET implementation:
 * Type eaglesoftSettingsType = Type.GetTypeFromProgID("EaglesoftSettings.EaglesoftSettings");
 * string connectionString = eaglesoftSettings.GetLegacyConnectionString(true);
 * 
 * @param {boolean} usePrimaryDatabase - true for primary database, false for secondary
 * @returns {Promise<Object>} Result object with success status and connection string or error
 */
async function getEaglesoftConnectionString(usePrimaryDatabase = true) {
  if (process.platform !== 'win32') {
    return {
      success: false,
      error: 'Eaglesoft connection retrieval is only available on Windows',
      connectionString: null,
    };
  }

  try {
    // Read productName and token similar to the .NET COM wrapper
    // .NET version uses ConfigurationManager.AppSettings["ProductName"] / ["Token"].
    // Here we use the same defaults from App.config, but allow overrides
    // via environment variables if needed.
    const DEFAULT_PRODUCT_NAME = 'DentalXChange';
    const DEFAULT_TOKEN = '384a535946515c374d46534c4a001def7332d25d4f9300fa3422bb50fa86a0d3';

    const productName = process.env.EAGLESOFT_PRODUCT_NAME || DEFAULT_PRODUCT_NAME;
    const token = process.env.EAGLESOFT_TOKEN || DEFAULT_TOKEN;

    // First detect which PowerShell works
    const workingPowerShell = await detectWorkingPowerShell();
    if (!workingPowerShell) {
      return {
        success: false,
        error: 'Eaglesoft COM object not accessible via PowerShell',
        connectionString: null,
        hint: [
          'Eaglesoft may not be installed on this system',
          'Try running PowerShell as Administrator',
          'Check if Eaglesoft needs to be repaired/reinstalled',
        ],
      };
    }

    console.log('Using PowerShell:', workingPowerShell);

    // PowerShell script to instantiate the COM object and call GetLegacyConnectionString
    const powershellScript = `
try {
  $eaglesoftSettings = New-Object -ComObject "EaglesoftSettings.EaglesoftSettings"
  if ($eaglesoftSettings -eq $null) {
    Write-Output "ERROR: Could not create EaglesoftSettings COM object"
    exit 1
  }

  # If productName and token are provided, mirror the .NET wrapper:
  # bool isTokenValid = eaglesoftSettings.SetToken(productName, token);
  # if (isTokenValid) { connectionString = eaglesoftSettings.GetLegacyConnectionString(true); }
  $productName = "${productName}"
  $token = "${token}"

  if (-not [string]::IsNullOrEmpty($productName) -and -not [string]::IsNullOrEmpty($token)) {
    $isTokenValid = $eaglesoftSettings.SetToken($productName, $token)
    if (-not $isTokenValid) {
      Write-Output "ERROR: SetToken failed for product '$productName'"
      exit 1
    }
  }
  
  $usePrimary = ${usePrimaryDatabase ? '$true' : '$false'}
  $connectionString = $eaglesoftSettings.GetLegacyConnectionString($usePrimary)
  
  if ([string]::IsNullOrEmpty($connectionString)) {
    Write-Output "ERROR: Connection string is empty"
    exit 1
  }
  
  Write-Output $connectionString
  exit 0
}
catch {
  Write-Output "ERROR: $($_.Exception.Message)"
  exit 1
}
`.trim();

    // Encode the script to base64 (UTF-16LE) for PowerShell -EncodedCommand
    const encodedScript = Buffer.from(powershellScript, 'utf16le').toString('base64');

    // Execute PowerShell script with encoded command
    const { stdout, stderr } = await execPromise(
      `${workingPowerShell} -NoProfile -NonInteractive -EncodedCommand ${encodedScript}`,
      {
        timeout: 10000,
        maxBuffer: 1024 * 1024, // 1MB buffer
      }
    );

    const output = stdout.trim();

    // Check if there was an error in the output
    if (output.startsWith('ERROR:')) {
      const errorMessage = output.substring(6).trim();
      console.error('Eaglesoft connection string retrieval failed:', errorMessage);
      return {
        success: false,
        error: errorMessage,
        connectionString: null,
        hint: getEaglesoftErrorHint(errorMessage),
      };
    }

    // Check for stderr
    if (stderr && stderr.trim().length > 0) {
      console.warn('PowerShell stderr:', stderr);
    }

    // Validate that we got a connection string
    if (!output || output.length === 0) {
      return {
        success: false,
        error: 'Empty connection string returned from Eaglesoft',
        connectionString: null,
        hint: [
          'Eaglesoft is installed and COM object is accessible',
          'However, the database connection is not configured in Eaglesoft',
          'Please follow these steps:',
          '1. Open the Eaglesoft application',
          '2. Complete the initial setup/configuration wizard',
          '3. Configure database connection settings in Eaglesoft',
          '4. Verify you can access patient records or main screens',
          '5. Then try again - the connection string should appear',
        ],
      };
    }

    console.log('Successfully retrieved Eaglesoft connection string');
    return {
      success: true,
      connectionString: output,
      source: 'EaglesoftSettings COM Object',
      databaseType: usePrimaryDatabase ? 'Primary' : 'Secondary',
    };
  } catch (error) {
    console.error('Error fetching Eaglesoft connection string:', error);
    return {
      success: false,
      error: error.message || 'Failed to retrieve Eaglesoft connection string',
      connectionString: null,
      hint: getEaglesoftErrorHint(error.message),
    };
  }
}

/**
 * Parse an ODBC connection string into a configuration object
 * 
 * @param {string} connectionString - ODBC connection string
 * @returns {Object} Parsed configuration object
 */
function parseOdbcConnectionString(connectionString) {
  if (!connectionString || typeof connectionString !== 'string') {
    return null;
  }

  const config = {};
  
  // Split by semicolon, but handle cases where values might contain semicolons
  const parts = connectionString.split(';').filter(part => part.trim().length > 0);
  
  for (const part of parts) {
    const equalIndex = part.indexOf('=');
    if (equalIndex === -1) continue;
    
    const key = part.substring(0, equalIndex).trim();
    const value = part.substring(equalIndex + 1).trim();
    
    // Map common ODBC connection string keys to our config format
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
        // For Eaglesoft-style ODBC strings, DSN identifies the logical server/DSN name
        config.server = value;
        config.DSN = value;
        break;
      case 'database':
      case 'initial catalog':
        config.database = value;
        break;
      case 'dbn':
        // For Eaglesoft-style ODBC strings, DBN is the database name
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
        config.windowsAuth = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true' || value.toLowerCase() === 'sspi';
        break;
      case 'encrypt':
        config.encrypt = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
        break;
      case 'trustservercertificate':
        config.trustServerCertificate = value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';
        break;
      default:
        // Store any other parameters as-is
        config[key] = value;
        break;
    }
  }
  
  return config;
}

/**
 * Get the Eaglesoft connection configuration as a parsed object
 * 
 * @param {boolean} usePrimaryDatabase - true for primary database, false for secondary
 * @returns {Promise<Object>} Result object with success status and parsed configuration
 */
async function getEaglesoftConnectionConfig(usePrimaryDatabase = true) {
  try {
    const result = await getEaglesoftConnectionString(usePrimaryDatabase);
    
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
      config: config,
      source: result.source,
      databaseType: result.databaseType,
    };
  } catch (error) {
    console.error('Error getting Eaglesoft connection config:', error);
    return {
      success: false,
      error: error.message || 'Failed to get Eaglesoft connection configuration',
      config: null,
    };
  }
}

/**
 * Test if Eaglesoft is installed on the system
 * 
 * @returns {Promise<Object>} Result object with installation status
 */
async function isEaglesoftInstalled() {
  if (process.platform !== 'win32') {
    return {
      installed: false,
      error: 'Not a Windows system',
    };
  }

  const powershellScript = `
try {
  $eaglesoftSettings = New-Object -ComObject "EaglesoftSettings.EaglesoftSettings"
  if ($eaglesoftSettings -eq $null) {
    Write-Output "ERROR:COM object is null"
    exit 1
  } else {
    Write-Output "SUCCESS"
    exit 0
  }
}
catch {
  Write-Output "ERROR:$($_.Exception.Message)"
  exit 1
}
`.trim();

  // Encode the script to base64 (UTF-16LE) for PowerShell -EncodedCommand
  const encodedScript = Buffer.from(powershellScript, 'utf16le').toString('base64');

  // Eaglesoft is typically a 32-bit application, so try 32-bit PowerShell first
  const powershellPaths = [
    '%SystemRoot%\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe', // 32-bit (try first for Eaglesoft)
    'powershell.exe', // 64-bit (fallback)
  ];

  let lastError = null;

  for (const psPath of powershellPaths) {
    try {
      console.log(`Trying PowerShell at: ${psPath}`);
      
      const { stdout, stderr } = await execPromise(
        `${psPath} -NoProfile -NonInteractive -EncodedCommand ${encodedScript}`,
        {
          timeout: 5000,
        }
      );

      const output = stdout.trim();
      
      // Log the raw output for debugging
      console.log('PowerShell output:', output);
      if (stderr && stderr.trim()) {
        console.log('PowerShell stderr:', stderr.trim());
      }
      
      if (output.startsWith('ERROR:')) {
        const errorMessage = output.substring(6);
        console.error('Eaglesoft check failed with error:', errorMessage);
        lastError = errorMessage;
        continue; // Try next PowerShell version
      }

      if (output === 'SUCCESS') {
        console.log('✓ Eaglesoft COM object accessible via:', psPath);
        return {
          installed: true,
          message: 'Eaglesoft is installed and COM object is accessible',
          powershellPath: psPath,
        };
      }
    } catch (error) {
      console.error(`Exception with ${psPath}:`, error.message);
      lastError = error.message;
      continue; // Try next PowerShell version
    }
  }

  // If we get here, all attempts failed
  return {
    installed: false,
    error: lastError || 'Eaglesoft COM object is not available',
    message: 'Eaglesoft COM object is not available. Tried both 32-bit and 64-bit PowerShell.',
    hint: [
      'Eaglesoft appears to be installed but COM object is not accessible',
      'Error: 0x80040154 - Class not registered',
      'This typically means Eaglesoft is 32-bit but being accessed from 64-bit process',
      'Try running the diagnostic: node diagnose-eaglesoft.js',
    ],
  };
}

/**
 * Get helpful error hints based on the error message
 * 
 * @param {string} errorMessage - The error message
 * @returns {Array<string>} Array of hint strings
 */
function getEaglesoftErrorHint(errorMessage) {
  if (!errorMessage) return [];

  const hints = [];
  
  if (errorMessage.includes('Could not create EaglesoftSettings COM object') ||
      errorMessage.includes('0x80040154')) { // REGDB_E_CLASSNOTREG
    hints.push('The EaglesoftSettings COM object is not registered on this system.');
    hints.push('Ensure Eaglesoft software is properly installed on this machine.');
    hints.push('You may need to re-install or repair your Eaglesoft installation.');
  } else if (errorMessage.includes('Access denied') || errorMessage.includes('0x80070005')) {
    hints.push('Access denied when trying to read Eaglesoft settings.');
    hints.push('Try running the application as Administrator.');
    hints.push('Ensure your user account has permissions to access Eaglesoft settings.');
  } else if (errorMessage.includes('Connection string is empty')) {
    hints.push('Eaglesoft returned an empty connection string.');
    hints.push('Ensure Eaglesoft database is properly configured.');
    hints.push('Check Eaglesoft application settings for database configuration.');
  } else if (errorMessage.includes('timeout')) {
    hints.push('Request timed out while accessing Eaglesoft settings.');
    hints.push('The Eaglesoft application may not be responding.');
    hints.push('Try restarting the Eaglesoft service or application.');
  }
  
  return hints;
}

/**
 * Create a database connection object for use with the databaseConnections module
 * 
 * @param {string} connectionName - Name for this connection
 * @param {boolean} usePrimaryDatabase - true for primary database, false for secondary
 * @returns {Promise<Object>} Result object with connection data ready to be added
 */
async function createEaglesoftConnection(connectionName = 'Eaglesoft Database', usePrimaryDatabase = true) {
  try {
    const result = await getEaglesoftConnectionConfig(usePrimaryDatabase);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        hint: result.hint,
      };
    }
    
    const { config, connectionString } = result;
    
    // Determine database type based on driver
    let dbType = 'mssql'; // Default to MSSQL
    if (config.driver) {
      const driverLower = config.driver.toLowerCase();
      if (driverLower.includes('mysql')) {
        dbType = 'mysql';
      } else if (driverLower.includes('postgres')) {
        dbType = 'postgresql';
      } else if (driverLower.includes('oracle')) {
        dbType = 'oracle';
      } else if (driverLower.includes('sqlite')) {
        dbType = 'sqlite';
      }
    }
    
    // Build connection data in the format expected by databaseConnections.addConnection
    const connectionData = {
      name: connectionName,
      type: dbType,
      config: {
        // For Eaglesoft we prefer using the ODBC DSN/DBN information,
        // but we still populate generic fields so the UI can display them.
        server: config.server || 'localhost',
        database: config.database || '',
        port: config.port,
        username: config.username,
        password: config.password,
        windowsAuth: config.windowsAuth || false,
        encrypt: config.encrypt !== false,
        trustServerCertificate: config.trustServerCertificate === true,
        driver: config.driver,
        // Preserve Eaglesoft-specific keys when present
        DSN: config.DSN,
        DBN: config.DBN,
        // Flag so we know to use ODBC for this connection when testing
        useOdbc: true,
        // Store original ODBC connection string for reference
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
    console.error('Error creating Eaglesoft connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to create Eaglesoft connection',
    };
  }
}

module.exports = {
  getEaglesoftConnectionString,
  getEaglesoftConnectionConfig,
  parseOdbcConnectionString,
  isEaglesoftInstalled,
  createEaglesoftConnection,
  getEaglesoftErrorHint,
  detectWorkingPowerShell,
};
