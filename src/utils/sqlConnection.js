const sql = require('mssql');
const Registry = require('winreg');

/**
 * Default registry path for SQL Server connection strings
 * Common locations:
 * - HKCU\Software\YourApp\SQLConnection
 * - HKLM\Software\YourApp\SQLConnection
 */
const DEFAULT_REGISTRY_PATH = '\\Software\\YourApp\\SQLConnection';

/**
 * Read SQL Server connection credentials from Windows Registry
 * @param {string} registryPath - Optional custom registry path (default: DEFAULT_REGISTRY_PATH)
 * @param {string} hive - Registry hive: 'HKCU' (default) or 'HKLM'
 * @returns {Promise<Object>} Connection configuration object
 */
async function getSqlCredentialsFromRegistry(registryPath = DEFAULT_REGISTRY_PATH, hive = 'HKCU') {
  if (process.platform !== 'win32') {
    throw new Error('SQL Server registry access is only available on Windows OS. Please configure SQL connection manually or use a Windows machine.');
  }

  try {
    const regKey = new Registry({
      hive: Registry[hive],
      key: registryPath,
    });

    // Read all values from the registry key
    return new Promise((resolve, reject) => {
      regKey.values((err, items) => {
        if (err) {
          // If key doesn't exist, return default structure
          if (err.code === 'ENOENT') {
            console.warn(`Registry key not found: ${hive}${registryPath}`);
            resolve(null);
            return;
          }
          reject(err);
          return;
        }

        // Convert registry items to configuration object
        const config = {};
        items.forEach((item) => {
          config[item.name] = item.value;
        });

        // Build SQL Server configuration
        const sqlConfig = {
          server: config.server || config.Server || config.SERVER || 'localhost',
          database: config.database || config.Database || config.DATABASE || '',
          options: {
            encrypt: config.encrypt === 'true' || config.Encrypt === 'true' || true, // Default to true for security
            trustServerCertificate: config.trustServerCertificate === 'true' || config.TrustServerCertificate === 'true' || false,
            enableArithAbort: true,
          },
          // Windows Authentication
          authentication: {
            type: 'default', // Uses Windows authentication
          },
          // Connection timeout (in milliseconds)
          connectionTimeout: parseInt(config.connectionTimeout || config.ConnectionTimeout || '15000', 10),
          requestTimeout: parseInt(config.requestTimeout || config.RequestTimeout || '15000', 10),
        };

        resolve(sqlConfig);
      });
    });
  } catch (error) {
    console.error('Error reading SQL credentials from registry:', error);
    throw error;
  }
}

/**
 * Connect to SQL Server using Windows Authentication
 * @param {Object} config - SQL Server configuration (if not provided, reads from registry)
 * @param {string} registryPath - Optional registry path to read credentials from
 * @param {string} hive - Registry hive: 'HKCU' or 'HKLM'
 * @returns {Promise<sql.ConnectionPool>} SQL Server connection pool
 */
async function connectToSqlServer(config = null, registryPath = DEFAULT_REGISTRY_PATH, hive = 'HKCU') {
  if (process.platform !== 'win32') {
    throw new Error('SQL Server Windows Authentication is only available on Windows OS. Please use SQL Server Authentication or switch to a Windows machine.');
  }

  try {
    // If config is not provided, read from registry
    let sqlConfig = config;
    if (!sqlConfig) {
      sqlConfig = await getSqlCredentialsFromRegistry(registryPath, hive);
      if (!sqlConfig) {
        throw new Error('SQL Server configuration not found in registry. Please configure the registry first.');
      }
    }

    // Create connection pool
    const pool = await sql.connect(sqlConfig);

    console.log('Successfully connected to SQL Server');
    return pool;
  } catch (error) {
    console.error('Error connecting to SQL Server:', error);
    throw error;
  }
}

/**
 * Test SQL Server connection
 * @param {Object} config - Optional SQL Server configuration
 * @param {string} registryPath - Optional registry path
 * @param {string} hive - Registry hive
 * @returns {Promise<Object>} Connection test result
 */
async function testSqlConnection(config = null, registryPath = DEFAULT_REGISTRY_PATH, hive = 'HKCU') {
  let pool = null;
  try {
    pool = await connectToSqlServer(config, registryPath, hive);
    
    // Test query
    const result = await pool.request().query('SELECT @@VERSION AS Version, SYSTEM_USER AS CurrentUser, DB_NAME() AS CurrentDatabase');
    
    return {
      success: true,
      message: 'Connection successful',
      serverInfo: {
        version: result.recordset[0]?.Version || 'Unknown',
        currentUser: result.recordset[0]?.CurrentUser || 'Unknown',
        currentDatabase: result.recordset[0]?.CurrentDatabase || 'Unknown',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Connection failed',
      code: error.code,
    };
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

/**
 * Execute a SQL query
 * @param {string} query - SQL query to execute
 * @param {Object} config - Optional SQL Server configuration
 * @param {string} registryPath - Optional registry path
 * @param {string} hive - Registry hive
 * @returns {Promise<Object>} Query result
 */
async function executeQuery(query, config = null, registryPath = DEFAULT_REGISTRY_PATH, hive = 'HKCU') {
  let pool = null;
  try {
    pool = await connectToSqlServer(config, registryPath, hive);
    const result = await pool.request().query(query);
    
    return {
      success: true,
      recordset: result.recordset,
      rowsAffected: result.rowsAffected,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Query execution failed',
      code: error.code,
    };
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

/**
 * Get registry path information for documentation
 * @returns {Object} Registry path information
 */
function getRegistryPathInfo() {
  return {
    defaultPath: DEFAULT_REGISTRY_PATH,
    hives: ['HKCU', 'HKLM'],
    exampleStructure: {
      server: 'your-sql-server\\instance',
      database: 'YourDatabase',
      encrypt: 'true',
      trustServerCertificate: 'false',
      connectionTimeout: '15000',
      requestTimeout: '15000',
    },
  };
}

module.exports = {
  getSqlCredentialsFromRegistry,
  connectToSqlServer,
  testSqlConnection,
  executeQuery,
  getRegistryPathInfo,
};

