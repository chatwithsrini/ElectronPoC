import React, { useEffect, useState } from 'react';

function AddConnectionModal({ supportedDbTypes, onClose, onAdd }) {
  const [mode, setMode] = useState('discover');
  const [discoveredDatabases, setDiscoveredDatabases] = useState([]);
  const [discoveringDatabases, setDiscoveringDatabases] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState('');
  const [fetchingCredentials, setFetchingCredentials] = useState(false);
  const [credentialsAutoFilled, setCredentialsAutoFilled] = useState(false);
  const [credentialsSource, setCredentialsSource] = useState('');
  
  const [connectionName, setConnectionName] = useState('');
  const [dbType, setDbType] = useState('mssql');
  const [server, setServer] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [windowsAuth, setWindowsAuth] = useState(false);
  const [encrypt, setEncrypt] = useState(true);
  const [trustServerCertificate, setTrustServerCertificate] = useState(false);

  useEffect(() => {
    if (mode === 'discover') {
      discoverDatabases();
    }
  }, [mode]);

  const discoverDatabases = async () => {
    if (!window.electronAPI || !window.electronAPI.discoverAllDatabases) {
      return;
    }

    setDiscoveringDatabases(true);
    try {
      const result = await window.electronAPI.discoverAllDatabases();
      if (result.success) {
        setDiscoveredDatabases(result.instances || []);
      } else {
        console.error('Failed to discover databases:', result.error);
      }
    } catch (error) {
      console.error('Error discovering databases:', error);
    } finally {
      setDiscoveringDatabases(false);
    }
  };

  const handleInstanceSelect = async (instanceId) => {
    setSelectedInstance(instanceId);
    
    if (!instanceId) {
      setConnectionName('');
      setDbType('mssql');
      setServer('');
      setHost('');
      setPort('');
      setDatabase('');
      setUsername('');
      setPassword('');
      setWindowsAuth(false);
      setCredentialsAutoFilled(false);
      setCredentialsSource('');
      return;
    }

    const instance = discoveredDatabases.find(db => 
      `${db.type}-${db.name}` === instanceId
    );

    if (!instance) return;

    setConnectionName(instance.displayName);
    setDbType(instance.type);

    if (instance.type === 'mssql') {
      setServer(instance.serverName);
      setWindowsAuth(true);
    } else {
      setHost(instance.serverName);
      setPort(instance.port?.toString() || '');
    }

    if (window.electronAPI && window.electronAPI.fetchDatabaseCredentials) {
      setFetchingCredentials(true);
      try {
        const result = await window.electronAPI.fetchDatabaseCredentials(
          instance.type, 
          instance.name
        );
        
        if (result.success && result.config) {
          console.log('Auto-filling credentials from registry:', result.source);
          setCredentialsAutoFilled(true);
          setCredentialsSource(result.source);
          
          if (instance.type === 'mssql') {
            if (result.config.database) setDatabase(result.config.database);
            if (result.config.username || result.config.user) {
              setUsername(result.config.username || result.config.user);
              setWindowsAuth(false);
            }
            if (result.config.password) setPassword(result.config.password);
            if (result.config.encrypt !== undefined) setEncrypt(result.config.encrypt === 'true' || result.config.encrypt === true);
            if (result.config.trustServerCertificate !== undefined) {
              setTrustServerCertificate(result.config.trustServerCertificate === 'true' || result.config.trustServerCertificate === true);
            }
          } else {
            if (result.config.database) setDatabase(result.config.database);
            if (result.config.username || result.config.user) {
              setUsername(result.config.username || result.config.user);
            }
            if (result.config.password) setPassword(result.config.password);
            if (result.config.port) setPort(result.config.port.toString());
            if (result.config.host) setHost(result.config.host);
          }
        } else if (result.error) {
          console.log('No credentials found in registry:', result.error);
          setCredentialsAutoFilled(false);
          setCredentialsSource('');
        }
      } catch (error) {
        console.error('Error fetching credentials:', error);
      } finally {
        setFetchingCredentials(false);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!connectionName.trim()) {
      alert('Please enter a connection name');
      return;
    }

    const connectionData = {
      name: connectionName.trim(),
      type: dbType,
      config: {},
    };

    if (dbType === 'mssql') {
      connectionData.config = {
        server: server.trim(),
        database: database.trim(),
        port: port ? parseInt(port, 10) : undefined,
        windowsAuth,
        encrypt,
        trustServerCertificate,
      };
      if (!windowsAuth) {
        connectionData.config.username = username.trim();
        connectionData.config.password = password;
      }
    } else if (dbType === 'mysql' || dbType === 'postgresql') {
      connectionData.config = {
        host: host.trim() || 'localhost',
        port: port ? parseInt(port, 10) : (dbType === 'mysql' ? 3306 : 5432),
        database: database.trim(),
        username: username.trim(),
        password: password,
      };
    } else if (dbType === 'mongodb') {
      connectionData.config = {
        host: host.trim() || 'localhost',
        port: port ? parseInt(port, 10) : 27017,
        database: database.trim(),
        username: username.trim(),
        password: password,
      };
    }

    onAdd(connectionData);
  };

  const getDefaultPort = () => {
    if (!supportedDbTypes || !supportedDbTypes.typeInfo) return '';
    return supportedDbTypes.typeInfo[dbType]?.defaultPort || '';
  };

  const supportsWindowsAuth = () => {
    if (!supportedDbTypes || !supportedDbTypes.typeInfo) return false;
    return supportedDbTypes.typeInfo[dbType]?.supportsWindowsAuth || false;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Database Connection</h2>
          <button className="modal-close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          {/* Mode Selector */}
          <div className="form-group">
            <label>Connection Mode</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className={`mode-selector-btn ${mode === 'discover' ? 'mode-selector-btn--active' : ''}`}
                onClick={() => setMode('discover')}
              >
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                Discover Databases
              </button>
              <button
                type="button"
                className={`mode-selector-btn ${mode === 'manual' ? 'mode-selector-btn--active' : ''}`}
                onClick={() => setMode('manual')}
              >
                <i className="fa-solid fa-keyboard" aria-hidden="true"></i>
                Manual Entry
              </button>
            </div>
          </div>

          {/* Discover Mode */}
          {mode === 'discover' && (
            <>
              <div className="form-group">
                <label htmlFor="discoveredInstance">
                  Select Database Instance *
                  {discoveringDatabases && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                      <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Discovering...
                    </span>
                  )}
                </label>
                <select
                  id="discoveredInstance"
                  value={selectedInstance}
                  onChange={(e) => handleInstanceSelect(e.target.value)}
                  required={mode === 'discover'}
                  disabled={discoveringDatabases}
                >
                  <option value="">-- Select a database --</option>
                  {discoveredDatabases.length === 0 && !discoveringDatabases && (
                    <option value="" disabled>No databases found on this machine</option>
                  )}
                  {discoveredDatabases.map(db => (
                    <option key={`${db.type}-${db.name}`} value={`${db.type}-${db.name}`}>
                      {db.displayName} ({db.serverName})
                    </option>
                  ))}
                </select>
                {discoveredDatabases.length === 0 && !discoveringDatabases && (
                  <div style={{ 
                    fontSize: '0.8rem', 
                    color: '#6b7280', 
                    marginTop: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <i className="fa-solid fa-info-circle" aria-hidden="true"></i>
                    No databases discovered. Click "Manual Entry" to add a connection manually.
                  </div>
                )}
                {fetchingCredentials && (
                  <div style={{ 
                    fontSize: '0.8rem', 
                    color: '#3b82f6', 
                    marginTop: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                    Fetching credentials from registry...
                  </div>
                )}
              </div>

              {selectedInstance && (
                <>
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'rgba(59, 130, 246, 0.1)', 
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    marginBottom: '0.5rem'
                  }}>
                    <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                      <i className="fa-solid fa-circle-info" aria-hidden="true"></i> Review and modify the connection details below
                    </div>
                  </div>
                  
                  {credentialsAutoFilled && (
                    <div style={{ 
                      padding: '0.75rem', 
                      background: 'rgba(34, 197, 94, 0.1)', 
                      borderRadius: '0.5rem',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      marginBottom: '1rem'
                    }}>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: '#22c55e',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <i className="fa-solid fa-circle-check" aria-hidden="true"></i>
                        <div>
                          <strong>Credentials auto-filled from registry</strong>
                          {credentialsSource && (
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                              Source: {credentialsSource}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {!credentialsAutoFilled && !fetchingCredentials && (
                    <div style={{ 
                      padding: '0.75rem', 
                      background: 'rgba(251, 191, 36, 0.1)', 
                      borderRadius: '0.5rem',
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                      marginBottom: '1rem'
                    }}>
                      <div style={{ fontSize: '0.875rem', color: '#fbbf24' }}>
                        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> No credentials found in registry - please enter manually
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Connection Name */}
          {(mode === 'manual' || selectedInstance) && (
            <div className="form-group">
              <label htmlFor="connectionName">Connection Name *</label>
              <input
                type="text"
                id="connectionName"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder="My Database"
                required
              />
            </div>
          )}

          {/* Database Type - Manual Mode Only */}
          {mode === 'manual' && (
            <div className="form-group">
              <label htmlFor="dbType">Database Type *</label>
              <select
                id="dbType"
                value={dbType}
                onChange={(e) => {
                  setDbType(e.target.value);
                  setPort('');
                }}
              >
                {supportedDbTypes && supportedDbTypes.types.map(type => (
                  <option key={type} value={type}>
                    {supportedDbTypes.typeInfo[type]?.name || type}
                    {!supportedDbTypes.typeInfo[type]?.installed && ' (Driver not installed)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Show form fields only when in manual mode or instance is selected in discover mode */}
          {(mode === 'manual' || selectedInstance) && dbType === 'mssql' ? (
            <>
              <div className="form-group">
                <label htmlFor="server">Server *</label>
                <input
                  type="text"
                  id="server"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  placeholder="localhost or localhost\\SQLEXPRESS"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="database">Database</label>
                <input
                  type="text"
                  id="database"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder="master"
                />
              </div>

              {supportsWindowsAuth() && (
                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    id="windowsAuth"
                    checked={windowsAuth}
                    onChange={(e) => setWindowsAuth(e.target.checked)}
                    style={{ width: 'auto', marginRight: '0.5rem' }}
                  />
                  <label htmlFor="windowsAuth" style={{ marginBottom: 0 }}>Use Windows Authentication</label>
                </div>
              )}

              {!windowsAuth && (
                <>
                  <div className="form-group">
                    <label htmlFor="username">Username</label>
                    <input
                      type="text"
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="sa"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                      type="password"
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  id="encrypt"
                  checked={encrypt}
                  onChange={(e) => setEncrypt(e.target.checked)}
                  style={{ width: 'auto', marginRight: '0.5rem' }}
                />
                <label htmlFor="encrypt" style={{ marginBottom: 0 }}>Encrypt Connection</label>
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  id="trustServerCertificate"
                  checked={trustServerCertificate}
                  onChange={(e) => setTrustServerCertificate(e.target.checked)}
                  style={{ width: 'auto', marginRight: '0.5rem' }}
                />
                <label htmlFor="trustServerCertificate" style={{ marginBottom: 0 }}>Trust Server Certificate</label>
              </div>
            </>
          ) : (mode === 'manual' || selectedInstance) ? (
            <>
              <div className="form-group">
                <label htmlFor="host">Host *</label>
                <input
                  type="text"
                  id="host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="localhost"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="port">Port</label>
                <input
                  type="number"
                  id="port"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder={getDefaultPort()}
                />
              </div>

              <div className="form-group">
                <label htmlFor="database">Database</label>
                <input
                  type="text"
                  id="database"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder={dbType === 'mongodb' ? 'admin' : 'postgres'}
                />
              </div>

              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="root"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          ) : null}

          <div className="modal-footer">
            <button type="button" className="modal-btn modal-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal-btn modal-btn--primary">
              Add Connection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddConnectionModal;
