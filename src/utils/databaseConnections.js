const sql = require('mssql');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const Registry = require('winreg');
const eaglesoftCredentials = require('./eaglesoftCredentials');

const execPromise = promisify(exec);

// In-memory store for database connections
let savedConnections = [];
let connectionStatuses = new Map();
const PASSWORD_PLACEHOLDER = '***SAVED***';

/**
 * Mask sensitive fields before sending to renderer/UI.
 * Important: we keep real passwords in memory + on disk so tests can work.
 * If you need stronger security, store secrets in OS credential vault.
 */
function sanitizeConnectionsForRenderer(connections) {
  return (connections || []).map(conn => ({
    ...conn,
    config: {
      ...conn.config,
      password: conn?.config?.password ? PASSWORD_PLACEHOLDER : undefined,
    },
  }));
}

/**
 * Supported database types
 */
const DB_TYPES = {
  MSSQL: 'mssql',
  MYSQL: 'mysql',
  POSTGRESQL: 'postgresql',
  MONGODB: 'mongodb',
  ORACLE: 'oracle',
  SQLITE: 'sqlite',
};

/**
 * Discover installed SQL Server instances on the machine
 */
async function discoverSqlServerInstances() {
  if (process.platform !== 'win32') {
    return { success: false, error: 'SQL Server discovery is only available on Windows', instances: [] };
  }

  try {
    const instances = [];

    // Method 1: Check registry for installed instances
    const regPaths = [
      { hive: Registry.HKLM, key: '\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL' },
      { hive: Registry.HKLM, key: '\\SOFTWARE\\WOW6432Node\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL' },
    ];

    for (const regPath of regPaths) {
      try {
        const regKey = new Registry({ hive: regPath.hive, key: regPath.key });
        const items = await new Promise((resolve, reject) => {
          regKey.values((err, items) => {
            if (err) {
              resolve([]);
            } else {
              resolve(items);
            }
          });
        });

        for (const item of items) {
          const instanceName = item.name;
          const serverName = instanceName === 'MSSQLSERVER' 
            ? 'localhost' 
            : `localhost\\${instanceName}`;
          
          instances.push({
            name: instanceName,
            serverName: serverName,
            displayName: `SQL Server (${instanceName})`,
            type: DB_TYPES.MSSQL,
            source: 'registry',
          });
        }
      } catch (err) {
        // Continue to next registry path
        console.log(`Registry path not found: ${regPath.key}`);
      }
    }

    // Method 2: Use SQL Browser to discover network instances (optional)
    try {
      const { stdout } = await execPromise('sqlcmd -L', { timeout: 5000 });
      const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('Servers:'));
      for (const line of lines) {
        const serverName = line.trim();
        if (serverName && !instances.find(i => i.serverName === serverName)) {
          instances.push({
            name: serverName,
            serverName: serverName,
            displayName: `SQL Server (${serverName})`,
            type: DB_TYPES.MSSQL,
            source: 'network',
          });
        }
      }
    } catch (err) {
      console.log('SQL Browser discovery not available');
    }

    return {
      success: true,
      instances,
      count: instances.length,
    };
  } catch (error) {
    console.error('Error discovering SQL Server instances:', error);
    return {
      success: false,
      error: error.message,
      instances: [],
    };
  }
}

/**
 * Discover MySQL installations
 */
async function discoverMySqlInstances() {
  if (process.platform !== 'win32') {
    return { success: false, error: 'MySQL discovery is only available on Windows', instances: [] };
  }

  try {
    const instances = [];

    // Check Windows services for MySQL
    try {
      const { stdout } = await execPromise('sc query type= service state= all | findstr /i "mysql"', { timeout: 5000 });
      const lines = stdout.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('SERVICE_NAME:')) {
          const serviceName = lines[i].split(':')[1].trim();
          if (serviceName.toLowerCase().includes('mysql')) {
            instances.push({
              name: serviceName,
              serverName: 'localhost',
              displayName: `MySQL (${serviceName})`,
              type: DB_TYPES.MYSQL,
              port: 3306,
              source: 'service',
            });
          }
        }
      }
    } catch (err) {
      console.log('MySQL service discovery not available');
    }

    // Check common registry paths
    const regPaths = [
      { hive: Registry.HKLM, key: '\\SOFTWARE\\MySQL AB' },
      { hive: Registry.HKLM, key: '\\SOFTWARE\\WOW6432Node\\MySQL AB' },
    ];

    for (const regPath of regPaths) {
      try {
        const regKey = new Registry({ hive: regPath.hive, key: regPath.key });
        const items = await new Promise((resolve) => {
          regKey.keys((err, keys) => {
            if (err) resolve([]);
            else resolve(keys);
          });
        });

        for (const key of items) {
          const keyName = key.key.split('\\').pop();
          if (!instances.find(i => i.name === keyName)) {
            instances.push({
              name: keyName,
              serverName: 'localhost',
              displayName: `MySQL (${keyName})`,
              type: DB_TYPES.MYSQL,
              port: 3306,
              source: 'registry',
            });
          }
        }
      } catch (err) {
        console.log(`Registry path not found: ${regPath.key}`);
      }
    }

    return {
      success: true,
      instances,
      count: instances.length,
    };
  } catch (error) {
    console.error('Error discovering MySQL instances:', error);
    return {
      success: false,
      error: error.message,
      instances: [],
    };
  }
}

/**
 * Discover PostgreSQL installations
 */
async function discoverPostgreSqlInstances() {
  if (process.platform !== 'win32') {
    return { success: false, error: 'PostgreSQL discovery is only available on Windows', instances: [] };
  }

  try {
    const instances = [];

    // Check Windows services for PostgreSQL
    try {
      const { stdout } = await execPromise('sc query type= service state= all | findstr /i "postgresql"', { timeout: 5000 });
      const lines = stdout.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('SERVICE_NAME:')) {
          const serviceName = lines[i].split(':')[1].trim();
          if (serviceName.toLowerCase().includes('postgresql')) {
            instances.push({
              name: serviceName,
              serverName: 'localhost',
              displayName: `PostgreSQL (${serviceName})`,
              type: DB_TYPES.POSTGRESQL,
              port: 5432,
              source: 'service',
            });
          }
        }
      }
    } catch (err) {
      console.log('PostgreSQL service discovery not available');
    }

    // Check common registry paths
    const regPaths = [
      { hive: Registry.HKLM, key: '\\SOFTWARE\\PostgreSQL' },
      { hive: Registry.HKLM, key: '\\SOFTWARE\\WOW6432Node\\PostgreSQL' },
    ];

    for (const regPath of regPaths) {
      try {
        const regKey = new Registry({ hive: regPath.hive, key: regPath.key });
        const items = await new Promise((resolve) => {
          regKey.keys((err, keys) => {
            if (err) resolve([]);
            else resolve(keys);
          });
        });

        for (const key of items) {
          const keyName = key.key.split('\\').pop();
          if (!instances.find(i => i.name === keyName)) {
            instances.push({
              name: keyName,
              serverName: 'localhost',
              displayName: `PostgreSQL (${keyName})`,
              type: DB_TYPES.POSTGRESQL,
              port: 5432,
              source: 'registry',
            });
          }
        }
      } catch (err) {
        console.log(`Registry path not found: ${regPath.key}`);
      }
    }

    return {
      success: true,
      instances,
      count: instances.length,
    };
  } catch (error) {
    console.error('Error discovering PostgreSQL instances:', error);
    return {
      success: false,
      error: error.message,
      instances: [],
    };
  }
}

/**
 * Discover MongoDB installations
 */
async function discoverMongoDbInstances() {
  if (process.platform !== 'win32') {
    return { success: false, error: 'MongoDB discovery is only available on Windows', instances: [] };
  }

  try {
    const instances = [];

    // Check Windows services for MongoDB
    try {
      const { stdout } = await execPromise('sc query type= service state= all | findstr /i "mongodb mongo"', { timeout: 5000 });
      const lines = stdout.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('SERVICE_NAME:')) {
          const serviceName = lines[i].split(':')[1].trim();
          if (serviceName.toLowerCase().includes('mongo')) {
            instances.push({
              name: serviceName,
              serverName: 'localhost',
              displayName: `MongoDB (${serviceName})`,
              type: DB_TYPES.MONGODB,
              port: 27017,
              source: 'service',
            });
          }
        }
      }
    } catch (err) {
      console.log('MongoDB service discovery not available');
    }

    return {
      success: true,
      instances,
      count: instances.length,
    };
  } catch (error) {
    console.error('Error discovering MongoDB instances:', error);
    return {
      success: false,
      error: error.message,
      instances: [],
    };
  }
}

/**
 * Discover all database instances on the machine
 */
async function discoverAllDatabases() {
  try {
    const [sqlServer, mysql, postgresql, mongodb] = await Promise.all([
      discoverSqlServerInstances(),
      discoverMySqlInstances(),
      discoverPostgreSqlInstances(),
      discoverMongoDbInstances(),
    ]);

    const allInstances = [
      ...(sqlServer.instances || []),
      ...(mysql.instances || []),
      ...(postgresql.instances || []),
      ...(mongodb.instances || []),
    ];

    return {
      success: true,
      instances: allInstances,
      count: allInstances.length,
      byType: {
        mssql: sqlServer.instances || [],
        mysql: mysql.instances || [],
        postgresql: postgresql.instances || [],
        mongodb: mongodb.instances || [],
      },
    };
  } catch (error) {
    console.error('Error discovering databases:', error);
    return {
      success: false,
      error: error.message,
      instances: [],
    };
  }
}

/**
 * Discover actual registry paths for a database instance on the local machine
 */
async function discoverRegistryPaths(dbType, instanceName) {
  const possiblePaths = [];
  const hives = [Registry.HKCU, Registry.HKLM];
  
  let basePaths = [];
  
  // Define base paths to search based on database type
  switch (dbType) {
    case DB_TYPES.MSSQL:
      basePaths = [
        `\\SOFTWARE\\YourApp\\SQLConnection\\${instanceName}`,
        `\\SOFTWARE\\YourApp\\SQLConnection`,
        `\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\${instanceName}`,
        `\\SOFTWARE\\Microsoft\\MSSQLServer\\${instanceName}`,
      ];
      break;
    case DB_TYPES.MYSQL:
      basePaths = [
        `\\SOFTWARE\\YourApp\\MySQLConnection\\${instanceName}`,
        `\\SOFTWARE\\YourApp\\MySQLConnection`,
        `\\SOFTWARE\\MySQL AB\\${instanceName}`,
        `\\SOFTWARE\\MySQL AB`,
        `\\SOFTWARE\\MySQL`,
      ];
      break;
    case DB_TYPES.POSTGRESQL:
      basePaths = [
        `\\SOFTWARE\\YourApp\\PostgreSQLConnection\\${instanceName}`,
        `\\SOFTWARE\\YourApp\\PostgreSQLConnection`,
        `\\SOFTWARE\\PostgreSQL\\${instanceName}`,
        `\\SOFTWARE\\PostgreSQL\\Installations\\${instanceName}`,
        `\\SOFTWARE\\PostgreSQL`,
      ];
      break;
    case DB_TYPES.MONGODB:
      basePaths = [
        `\\SOFTWARE\\YourApp\\MongoDBConnection\\${instanceName}`,
        `\\SOFTWARE\\YourApp\\MongoDBConnection`,
        `\\SOFTWARE\\MongoDB\\${instanceName}`,
        `\\SOFTWARE\\MongoDB`,
      ];
      break;
  }

  // Check each combination of hive and base path
  for (const hive of hives) {
    for (const basePath of basePaths) {
      try {
        const regKey = new Registry({
          hive: hive,
          key: basePath,
        });

        // Check if the key exists by trying to read it
        await new Promise((resolve, reject) => {
          regKey.values((err, items) => {
            if (err) {
              reject(err);
            } else {
              resolve(items);
            }
          });
        });

        // If we get here, the key exists
        possiblePaths.push({
          hive: hive,
          path: basePath,
          fullPath: `${hive === Registry.HKCU ? 'HKCU' : 'HKLM'}${basePath}`,
        });
      } catch (err) {
        // Key doesn't exist, continue
      }
    }
  }

  return possiblePaths;
}

/**
 * Read configuration from a specific registry key
 */
async function readRegistryConfig(hive, path) {
  try {
    const regKey = new Registry({
      hive: hive,
      key: path,
    });

    const config = await new Promise((resolve, reject) => {
      regKey.values((err, items) => {
        if (err) {
          reject(err);
          return;
        }

        const config = {};
        items.forEach((item) => {
          config[item.name] = item.value;
        });
        resolve(config);
      });
    });

    return config;
  } catch (error) {
    console.error(`Error reading registry key ${path}:`, error);
    return null;
  }
}

/**
 * Fetch connection credentials from registry for a specific database instance
 * Dynamically discovers registry paths on the local machine
 */
async function fetchCredentialsFromRegistry(dbType, instanceName) {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Registry access is only available on Windows' };
  }

  try {
    console.log(`Fetching credentials for ${dbType} instance: ${instanceName}`);

    // First, discover actual registry paths on this machine
    const registryPaths = await discoverRegistryPaths(dbType, instanceName);

    if (registryPaths.length === 0) {
      console.log('No registry paths found for this instance');
      return {
        success: false,
        error: 'No configuration found in registry. Please enter connection details manually.',
        config: null,
      };
    }

    console.log(`Found ${registryPaths.length} possible registry path(s):`, registryPaths.map(p => p.fullPath));

    // Try each discovered registry path
    for (const regPath of registryPaths) {
      try {
        const config = await readRegistryConfig(regPath.hive, regPath.path);

        if (config && Object.keys(config).length > 0) {
          console.log(`Successfully loaded configuration from: ${regPath.fullPath}`);
          return {
            success: true,
            config,
            source: regPath.fullPath,
          };
        }
      } catch (err) {
        console.log(`Failed to read from ${regPath.fullPath}:`, err.message);
        // Continue to next path
      }
    }

    // Registry paths found but no valid configuration
    return {
      success: false,
      error: 'Registry keys found but no valid configuration. Please enter connection details manually.',
      config: null,
      discoveredPaths: registryPaths.map(p => p.fullPath),
    };
  } catch (error) {
    console.error('Error fetching credentials from registry:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get the path to the connections config file
 */
function getConnectionsFilePath() {
  const userDataPath = process.env.APPDATA || 
    (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
  const appDir = path.join(userDataPath, 'ElectronPoC');
  return path.join(appDir, 'db-connections.json');
}

/**
 * Ensure the app directory exists
 */
async function ensureAppDirectory() {
  const filePath = getConnectionsFilePath();
  const dir = path.dirname(filePath);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Load saved connections from file
 */
async function loadSavedConnections() {
  try {
    await ensureAppDirectory();
    const filePath = getConnectionsFilePath();
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      savedConnections = JSON.parse(data);
      return savedConnections;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, return empty array
        savedConnections = [];
        return savedConnections;
      }
      throw error;
    }
  } catch (error) {
    console.error('Error loading saved connections:', error);
    return [];
  }
}

/**
 * Save connections to file
 */
async function saveSavedConnections() {
  try {
    await ensureAppDirectory();
    const filePath = getConnectionsFilePath();
    // Persist full connection config so background tests can work.
    // NOTE: this stores passwords in plaintext in the user's AppData.
    // If you need better security, integrate keytar/Windows Credential Manager.
    await fs.writeFile(filePath, JSON.stringify(savedConnections, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving connections:', error);
    throw error;
  }
}

/**
 * Generate unique ID for connection
 */
function generateConnectionId() {
  return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add a new database connection
 */
async function addConnection(connectionData) {
  try {
    const newConnection = {
      id: generateConnectionId(),
      name: connectionData.name,
      type: connectionData.type,
      config: connectionData.config,
      createdAt: new Date().toISOString(),
      lastTested: null,
    };

    savedConnections.push(newConnection);
    await saveSavedConnections();

    return {
      success: true,
      connection: newConnection,
    };
  } catch (error) {
    console.error('Error adding connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to add connection',
    };
  }
}

/**
 * Remove a database connection
 */
async function removeConnection(connectionId) {
  try {
    const index = savedConnections.findIndex(conn => conn.id === connectionId);
    if (index === -1) {
      return {
        success: false,
        error: 'Connection not found',
      };
    }

    savedConnections.splice(index, 1);
    connectionStatuses.delete(connectionId);
    await saveSavedConnections();

    return {
      success: true,
    };
  } catch (error) {
    console.error('Error removing connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to remove connection',
    };
  }
}

/**
 * Update a database connection
 */
async function updateConnection(connectionId, updates) {
  try {
    const connection = savedConnections.find(conn => conn.id === connectionId);
    if (!connection) {
      return {
        success: false,
        error: 'Connection not found',
      };
    }

    Object.assign(connection, {
      ...updates,
      id: connectionId, // Ensure ID doesn't change
      createdAt: connection.createdAt, // Preserve creation date
    });

    await saveSavedConnections();

    return {
      success: true,
      connection,
    };
  } catch (error) {
    console.error('Error updating connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to update connection',
    };
  }
}

/**
 * Get all saved connections
 */
async function getAllConnections() {
  try {
    await loadSavedConnections();
    return {
      success: true,
      // Never send raw passwords to the renderer
      connections: sanitizeConnectionsForRenderer(savedConnections),
    };
  } catch (error) {
    console.error('Error getting connections:', error);
    return {
      success: false,
      error: error.message || 'Failed to get connections',
      connections: [],
    };
  }
}

/**
 * Test a generic ODBC connection using a connection string.
 * Primarily used for Eaglesoft DSN-style connections.
 * 
 * For Eaglesoft (which uses 32-bit ODBC), this will automatically use
 * the 32-bit Node.js bridge to avoid architecture mismatch errors.
 */
async function testOdbcConnection(config) {
  // Check if this is an Eaglesoft connection (has useOdbc flag)
  // If so, use the 32-bit bridge
  if (config.useOdbc) {
    const { testOdbcConnection32Bit } = require('./eaglesoftOdbcBridge');
    return await testOdbcConnection32Bit(config);
  }

  // Otherwise, try direct ODBC connection (for 64-bit ODBC drivers)
  let odbc;
  try {
    // Require at runtime so the app can still run without ODBC installed
    // and show a helpful message instead of crashing.
    // Users can install with: npm install odbc
    // (or have it bundled in the Electron app's dependencies).
    // eslint-disable-next-line global-require
    odbc = require('odbc');
  } catch (err) {
    return {
      success: false,
      error: 'ODBC driver not installed. Please install the "odbc" npm package to test ODBC DSN connections.',
      code: 'ODBC_DRIVER_MISSING',
    };
  }

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
      error: 'Missing ODBC connection string information for Eaglesoft connection.',
    };
  }

  // Mask password for logging
  const safeConnectionString = connectionString.replace(/PWD=[^;]*/gi, 'PWD=***');
  console.log('[ODBC] Attempting connection with:', safeConnectionString);
  console.log('[ODBC] DSN:', config.DSN || config.server || 'N/A');
  console.log('[ODBC] DBN:', config.DBN || config.database || 'N/A');
  console.log('[ODBC] UID:', config.username || 'N/A');

  let connection;
  try {
    connection = await odbc.connect(connectionString);
    console.log('[ODBC] Connection established successfully');
    // Run a very simple query that should work across SQL Server ODBC drivers
    const result = await connection.query('SELECT 1 AS TestValue');
    console.log('[ODBC] Test query executed successfully');

    return {
      success: true,
      message: 'ODBC connection successful',
      serverInfo: {
        // We don’t have rich server metadata here; this is mainly a connectivity check.
        version: 'ODBC connection',
        currentUser: config.username || 'N/A',
        currentDatabase: config.DBN || config.database || 'N/A',
        serverName: config.DSN || config.server || 'N/A',
      },
      rawResult: result,
    };
  } catch (error) {
    console.error('[ODBC] Connection failed:', error);
    console.error('[ODBC] Error details:', {
      message: error.message,
      code: error.code,
      odbcErrors: error.odbcErrors,
      state: error.state,
    });

    // Build a more helpful error message
    let errorMessage = error.message || 'ODBC connection failed';
    const hints = [];

    // Check for common ODBC error patterns
    if (error.odbcErrors && error.odbcErrors.length > 0) {
      const odbcError = error.odbcErrors[0];
      errorMessage = odbcError.message || errorMessage;
      
      // IM002 - Data source name not found
      if (odbcError.state === 'IM002' || errorMessage.includes('Data source name not found')) {
        hints.push(`DSN "${config.DSN || config.server}" is not configured in Windows ODBC Data Sources.`);
        hints.push('Open "ODBC Data Sources (32-bit)" from Windows Start menu.');
        hints.push(`Add a System DSN named "${config.DSN || config.server}" pointing to your Eaglesoft database.`);
        hints.push('If Eaglesoft uses ProvideX, ensure the ProvideX ODBC driver is installed.');
      }
      
      // 28000 - Invalid authorization / login failed
      if (odbcError.state === '28000' || errorMessage.includes('login failed')) {
        hints.push('Invalid username or password for the DSN.');
        hints.push(`Verify credentials: UID=${config.username || 'N/A'}`);
        hints.push('Check the DSN configuration in ODBC Data Source Administrator.');
      }
      
      // 08001 - Unable to connect
      if (odbcError.state === '08001' || errorMessage.includes('unable to connect')) {
        hints.push('Cannot establish connection to the database server.');
        hints.push('Ensure the database server/service is running.');
        hints.push('Verify network connectivity if using a remote server.');
      }
    }

    if (hints.length === 0) {
      hints.push(`The DSN "${config.DSN || config.server}" must be configured in Windows ODBC Data Source Administrator (32-bit).`);
      hints.push('Eaglesoft typically uses ProvideX ODBC driver. Ensure it is installed and the DSN is configured.');
      hints.push('Try opening Eaglesoft application to verify database connectivity works there first.');
      hints.push(`Connection string used: ${safeConnectionString}`);
    }

    return {
      success: false,
      error: errorMessage,
      code: error.code,
      state: error.state,
      hint: hints,
    };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing ODBC connection:', err);
      }
    }
  }
}

/**
 * Test MSSQL connection
 */
async function testMssqlConnection(config) {
  let pool = null;
  try {
    const connectionConfig = {
      server: config.server || 'localhost',
      database: config.database || '',
      port: config.port || 1433,
      options: {
        encrypt: config.encrypt !== false,
        trustServerCertificate: config.trustServerCertificate === true,
        enableArithAbort: true,
      },
      connectionTimeout: config.connectionTimeout || 15000,
      requestTimeout: config.requestTimeout || 15000,
    };

    // Add authentication
    if (config.windowsAuth) {
      connectionConfig.authentication = {
        type: 'default', // Windows Authentication
      };
    } else {
      connectionConfig.user = config.username || config.user;
      connectionConfig.password = config.password;
    }

    pool = await sql.connect(connectionConfig);
    const result = await pool.request().query('SELECT @@VERSION AS Version, SYSTEM_USER AS CurrentUser, DB_NAME() AS CurrentDatabase');

    return {
      success: true,
      message: 'Connection successful',
      serverInfo: {
        version: result.recordset[0]?.Version || 'Unknown',
        currentUser: result.recordset[0]?.CurrentUser || 'Unknown',
        currentDatabase: result.recordset[0]?.CurrentDatabase || 'Unknown',
        serverName: config.server,
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
      try {
        await pool.close();
      } catch (err) {
        console.error('Error closing pool:', err);
      }
    }
  }
}

/**
 * Build a helpful hint for MySQL "Access denied" errors (wrong password or MySQL 8 auth).
 * Returns an array of tip strings so the UI can render as bullets.
 * @param {string} [triedHosts] - e.g. "127.0.0.1, localhost" for display
 */
function getMysqlAccessDeniedHint(errorMessage, triedHosts) {
  const base = [
    'Confirm in terminal: mysql -h 127.0.0.1 -u root -p and enter the SAME password as in the app. If that works but the app fails, the app may have the wrong password saved.',
    'Remove this connection in the app, then Add connection again with Host 127.0.0.1 and retype the password (do not copy-paste).',
    'MySQL 8.0 — in MySQL run: ALTER USER \'root\'@\'localhost\' IDENTIFIED WITH mysql_native_password BY \'your_password\'; then same for \'root\'@\'127.0.0.1\'; then FLUSH PRIVILEGES;',
    'Or create a new user: CREATE USER \'appuser\'@\'127.0.0.1\' IDENTIFIED WITH mysql_native_password BY \'password\'; GRANT ALL ON *.* TO \'appuser\'@\'127.0.0.1\'; FLUSH PRIVILEGES; then in the app use Host 127.0.0.1, user appuser.',
  ];
  if (triedHosts && triedHosts.length) {
    base.unshift(`Tried host(s): ${triedHosts.join(', ')} — all failed.`);
  }
  return base;
}

/**
 * Test MySQL connection (requires mysql2 package)
 */
async function testMysqlConnection(config) {
  let mysql;
  try {
    try {
      mysql = require('mysql2/promise');
    } catch (err) {
      return {
        success: false,
        error: 'MySQL driver not installed. Please install mysql2 package.',
      };
    }

    const host = (config.host || 'localhost').trim().toLowerCase();
    const port = parseInt(config.port, 10) || 3306;
    const user = (config.username || config.user || 'root').trim();
    // Trim to avoid hidden whitespace issues from copy/paste.
    const password = config.password != null ? String(config.password).trim() : '';

    // If password came from older saved file where we masked it, fail fast with a clear message.
    if (password === PASSWORD_PLACEHOLDER) {
      return {
        success: false,
        error: 'Saved password is masked (***SAVED***). Remove this connection and add it again with the real password.',
        code: 'PASSWORD_MASKED',
        hint: [
          'This connection was saved with a masked password placeholder.',
          'Remove the connection in the app and add it again, then retype the real password and click Test.',
        ],
      };
    }
    const database = (config.database || '').trim() || undefined;
    const isLocal = host === 'localhost' || host === '127.0.0.1';

    const baseConfig = {
      port,
      user,
      password,
      database,
      connectTimeout: config.connectionTimeout || 15000,
      // For local connections, disable SSL to avoid handshake/auth issues with MySQL 8
      ...(isLocal && { ssl: false }),
    };

    const hostsToTry = host === 'localhost' ? ['127.0.0.1', 'localhost'] : host === '127.0.0.1' ? ['127.0.0.1', 'localhost'] : [host];

    let connection;
    let connectedHost;
    let lastError;
    for (const tryHost of hostsToTry) {
      try {
        connection = await mysql.createConnection({ ...baseConfig, host: tryHost });
        connectedHost = tryHost;
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const isAccessDenied = err.code === 'ER_ACCESS_DENIED_ERROR' || (err.message && err.message.includes('Access denied'));
        if (!isAccessDenied) {
          break;
        }
      }
    }

    if (!connection) {
      const hint = getMysqlAccessDeniedHint(lastError?.message, hostsToTry);
      return {
        success: false,
        error: lastError?.message || 'Connection failed',
        code: lastError?.code,
        hint: Array.isArray(hint) ? hint : [hint],
        triedHosts: hostsToTry,
      };
    }

    // "database" can be a reserved keyword in some MySQL versions/modes as an alias.
    const [rows] = await connection.execute('SELECT VERSION() AS version, USER() AS user, DATABASE() AS currentDatabase');
    await connection.end();

    return {
      success: true,
      message: 'Connection successful',
      serverInfo: {
        version: rows[0]?.version || 'Unknown',
        currentUser: rows[0]?.user || 'Unknown',
        currentDatabase: rows[0]?.currentDatabase || 'Unknown',
        serverName: connectedHost,
      },
    };
  } catch (error) {
    const isAccessDenied = error.code === 'ER_ACCESS_DENIED_ERROR' ||
      (error.message && error.message.includes('Access denied'));
    const hint = isAccessDenied ? getMysqlAccessDeniedHint(error.message, []) : undefined;
    return {
      success: false,
      error: error.message || 'Connection failed',
      code: error.code,
      ...(hint && { hint: Array.isArray(hint) ? hint : [hint] }),
    };
  }
}

/**
 * Test PostgreSQL connection (placeholder - requires pg package)
 */
async function testPostgresqlConnection(config) {
  let Client;
  try {
    // Check if pg is available
    try {
      const pg = require('pg');
      Client = pg.Client;
    } catch (err) {
      return {
        success: false,
        error: 'PostgreSQL driver not installed. Please install pg package.',
      };
    }

    const client = new Client({
      host: config.host || 'localhost',
      port: config.port || 5432,
      user: config.username || config.user,
      password: config.password,
      database: config.database || 'postgres',
      connectionTimeoutMillis: config.connectionTimeout || 15000,
    });

    await client.connect();
    const result = await client.query('SELECT version(), current_user, current_database()');
    await client.end();

    return {
      success: true,
      message: 'Connection successful',
      serverInfo: {
        version: result.rows[0]?.version || 'Unknown',
        currentUser: result.rows[0]?.current_user || 'Unknown',
        currentDatabase: result.rows[0]?.current_database || 'Unknown',
        serverName: config.host,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Connection failed',
      code: error.code,
    };
  }
}

/**
 * Test MongoDB connection (placeholder - requires mongodb package)
 */
async function testMongodbConnection(config) {
  let MongoClient;
  try {
    // Check if mongodb is available
    try {
      const mongodb = require('mongodb');
      MongoClient = mongodb.MongoClient;
    } catch (err) {
      return {
        success: false,
        error: 'MongoDB driver not installed. Please install mongodb package.',
      };
    }

    const connectionString = config.connectionString || 
      `mongodb://${config.username ? `${config.username}:${config.password}@` : ''}${config.host || 'localhost'}:${config.port || 27017}/${config.database || ''}`;

    const client = new MongoClient(connectionString, {
      serverSelectionTimeoutMS: config.connectionTimeout || 15000,
    });

    await client.connect();
    const adminDb = client.db().admin();
    const serverInfo = await adminDb.serverInfo();
    await client.close();

    return {
      success: true,
      message: 'Connection successful',
      serverInfo: {
        version: serverInfo.version || 'Unknown',
        currentUser: config.username || 'Unknown',
        currentDatabase: config.database || 'Unknown',
        serverName: config.host,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Connection failed',
      code: error.code,
    };
  }
}

/**
 * Test a database connection
 */
async function testConnection(connectionId) {
  try {
    const connection = savedConnections.find(conn => conn.id === connectionId);
    if (!connection) {
      return {
        success: false,
        error: 'Connection not found',
      };
    }

    let result;

    // Special handling: Eaglesoft connections use an ODBC DSN-style connection string.
    // When useOdbc + odbcConnectionString are present, prefer testing via ODBC
    // instead of trying to treat the DSN as a TCP hostname (which causes ENOTFOUND).
    if (connection.config && connection.config.useOdbc && connection.config.odbcConnectionString) {
      result = await testOdbcConnection(connection.config);
    } else {
      switch (connection.type) {
        case DB_TYPES.MSSQL:
          result = await testMssqlConnection(connection.config);
          break;
      case DB_TYPES.MYSQL:
        result = await testMysqlConnection(connection.config);
        break;
      case DB_TYPES.POSTGRESQL:
        result = await testPostgresqlConnection(connection.config);
        break;
      case DB_TYPES.MONGODB:
        result = await testMongodbConnection(connection.config);
        break;
        default:
          result = {
            success: false,
            error: `Database type '${connection.type}' is not supported yet`,
          };
      }
    }

    // Update last tested timestamp
    connection.lastTested = new Date().toISOString();
    await saveSavedConnections();

    // Store connection status
    connectionStatuses.set(connectionId, {
      ...result,
      testedAt: connection.lastTested,
    });

    return result;
  } catch (error) {
    console.error('Error testing connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to test connection',
    };
  }
}

/**
 * Test all saved connections
 */
async function testAllConnections() {
  try {
    await loadSavedConnections();
    const results = [];

    for (const connection of savedConnections) {
      const result = await testConnection(connection.id);
      results.push({
        connectionId: connection.id,
        name: connection.name,
        type: connection.type,
        ...result,
      });
    }

    return {
      success: true,
      results,
    };
  } catch (error) {
    console.error('Error testing all connections:', error);
    return {
      success: false,
      error: error.message || 'Failed to test connections',
    };
  }
}

/**
 * Get connection status (from cache)
 */
function getConnectionStatus(connectionId) {
  return connectionStatuses.get(connectionId) || {
    success: null,
    message: 'Not tested yet',
  };
}

/**
 * Get all connection statuses
 */
async function getAllConnectionStatuses() {
  try {
    await loadSavedConnections();
    const statuses = savedConnections.map(conn => ({
      id: conn.id,
      name: conn.name,
      type: conn.type,
      createdAt: conn.createdAt,
      lastTested: conn.lastTested,
      status: connectionStatuses.get(conn.id) || {
        success: null,
        message: 'Not tested yet',
      },
    }));

    return {
      success: true,
      statuses,
    };
  } catch (error) {
    console.error('Error getting connection statuses:', error);
    return {
      success: false,
      error: error.message || 'Failed to get connection statuses',
    };
  }
}

/**
 * Get supported database types
 */
function getSupportedDatabaseTypes() {
  return {
    success: true,
    types: Object.values(DB_TYPES),
    typeInfo: {
      [DB_TYPES.MSSQL]: {
        name: 'Microsoft SQL Server',
        defaultPort: 1433,
        supportsWindowsAuth: true,
        installed: true,
      },
      [DB_TYPES.MYSQL]: {
        name: 'MySQL',
        defaultPort: 3306,
        supportsWindowsAuth: false,
        installed: isPackageInstalled('mysql2'),
      },
      [DB_TYPES.POSTGRESQL]: {
        name: 'PostgreSQL',
        defaultPort: 5432,
        supportsWindowsAuth: false,
        installed: isPackageInstalled('pg'),
      },
      [DB_TYPES.MONGODB]: {
        name: 'MongoDB',
        defaultPort: 27017,
        supportsWindowsAuth: false,
        installed: isPackageInstalled('mongodb'),
      },
      [DB_TYPES.ORACLE]: {
        name: 'Oracle Database',
        defaultPort: 1521,
        supportsWindowsAuth: false,
        installed: false,
      },
      [DB_TYPES.SQLITE]: {
        name: 'SQLite',
        defaultPort: null,
        supportsWindowsAuth: false,
        installed: isPackageInstalled('sqlite3'),
      },
    },
  };
}

/**
 * Check if a package is installed
 */
function isPackageInstalled(packageName) {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Eaglesoft is installed on the system
 */
async function isEaglesoftInstalled() {
  try {
    return await eaglesoftCredentials.isEaglesoftInstalled();
  } catch (error) {
    console.error('Error checking Eaglesoft installation:', error);
    return {
      installed: false,
      error: error.message,
    };
  }
}

/**
 * Fetch connection credentials from locally installed Eaglesoft database
 * 
 * @param {boolean} usePrimaryDatabase - true for primary database, false for secondary
 * @returns {Promise<Object>} Result with connection configuration
 */
async function fetchEaglesoftCredentials(usePrimaryDatabase = true) {
  try {
    console.log('Fetching Eaglesoft credentials from local installation...');
    return await eaglesoftCredentials.getEaglesoftConnectionConfig(usePrimaryDatabase);
  } catch (error) {
    console.error('Error fetching Eaglesoft credentials:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch Eaglesoft credentials',
    };
  }
}

/**
 * Add an Eaglesoft connection by automatically fetching credentials from local installation
 * 
 * @param {string} connectionName - Optional name for the connection
 * @param {boolean} usePrimaryDatabase - true for primary database, false for secondary
 * @returns {Promise<Object>} Result with the added connection
 */
async function addEaglesoftConnection(connectionName = 'Eaglesoft Database', usePrimaryDatabase = true) {
  try {
    console.log('Creating Eaglesoft connection from local installation...');
    
    // First check if Eaglesoft is installed
    const installCheck = await isEaglesoftInstalled();
    if (!installCheck.installed) {
      return {
        success: false,
        error: 'Eaglesoft is not installed on this system',
        hint: [
          'Install Eaglesoft software on this machine',
          'Ensure the Eaglesoft COM object (EaglesoftSettings.EaglesoftSettings) is registered',
        ],
      };
    }
    
    // Create the connection data from Eaglesoft
    const result = await eaglesoftCredentials.createEaglesoftConnection(connectionName, usePrimaryDatabase);
    
    if (!result.success) {
      return result;
    }
    
    // Add the connection to our saved connections
    const addResult = await addConnection(result.connectionData);
    
    if (addResult.success) {
      return {
        ...addResult,
        source: result.source,
        databaseType: result.databaseType,
        message: 'Eaglesoft connection added successfully',
      };
    }
    
    return addResult;
  } catch (error) {
    console.error('Error adding Eaglesoft connection:', error);
    return {
      success: false,
      error: error.message || 'Failed to add Eaglesoft connection',
    };
  }
}

module.exports = {
  DB_TYPES,
  addConnection,
  removeConnection,
  updateConnection,
  getAllConnections,
  testConnection,
  testAllConnections,
  getConnectionStatus,
  getAllConnectionStatuses,
  getSupportedDatabaseTypes,
  loadSavedConnections,
  discoverAllDatabases,
  discoverSqlServerInstances,
  discoverMySqlInstances,
  discoverPostgreSqlInstances,
  discoverMongoDbInstances,
  discoverRegistryPaths,
  readRegistryConfig,
  fetchCredentialsFromRegistry,
  isEaglesoftInstalled,
  fetchEaglesoftCredentials,
  addEaglesoftConnection,
};
