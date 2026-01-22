import React, { useEffect, useState } from 'react';
import MonitoringPanel from './MonitoringPanel';

function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [dbStatus, setDbStatus] = useState({
    status: 'checking', // 'checking', 'connected', 'disconnected', 'error'
    message: 'Checking connection...',
    serverInfo: null,
    error: null,
  });
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'fa-house' },
    { id: 'database', label: 'Database', icon: 'fa-database' },
    { id: 'services', label: 'Services', icon: 'fa-gear' },
    { id: 'monitoring', label: 'Monitoring', icon: 'fa-chart-line' },
    { id: 'profile', label: 'Profile', icon: 'fa-user' },
  ];

  useEffect(() => {
    loadSessionInfo();
    checkDbConnection();
    loadServices();
    
    // Check connection every 30 seconds
    const interval = setInterval(() => {
      checkDbConnection();
    }, 30000);

    // Refresh services every 10 seconds
    const servicesInterval = setInterval(() => {
      loadServices();
    }, 10000);

    return () => {
      clearInterval(interval);
      clearInterval(servicesInterval);
    };
  }, []);

  const loadSessionInfo = async () => {
    try {
      if (window.electronAPI) {
        const session = await window.electronAPI.getSession();
        setSessionInfo(session);
      }
    } catch (error) {
      console.error('Error loading session info:', error);
    }
  };

  const checkDbConnection = async () => {
    try {
      if (!window.electronAPI) {
        setDbStatus({
          status: 'error',
          message: 'Electron API not available',
          serverInfo: null,
          error: 'API not available',
        });
        return;
      }

      setDbStatus(prev => ({
        ...prev,
        status: 'checking',
        message: 'Checking connection...',
      }));

      const result = await window.electronAPI.testSqlConnection();

      if (result.success) {
        setDbStatus({
          status: 'connected',
          message: 'Database connected',
          serverInfo: result.serverInfo,
          error: null,
        });
      } else {
        setDbStatus({
          status: 'disconnected',
          message: 'Database disconnected',
          serverInfo: null,
          error: result.error || 'Connection failed',
        });
      }
    } catch (error) {
      console.error('Error checking DB connection:', error);
      setDbStatus({
        status: 'error',
        message: 'Connection error',
        serverInfo: null,
        error: error.message || 'Unknown error',
      });
    }
  };

  const loadServices = async () => {
    try {
      if (!window.electronAPI) {
        setServicesError('Electron API not available');
        return;
      }

      setServicesLoading(true);
      setServicesError(null);

      const result = await window.electronAPI.getWindowsServices();

      if (result.success) {
        setServices(result.services || []);
      } else {
        setServicesError(result.error || 'Failed to load services');
      }
    } catch (error) {
      console.error('Error loading services:', error);
      setServicesError(error.message || 'Failed to load services');
    } finally {
      setServicesLoading(false);
    }
  };

  const handleServiceAction = async (serviceName, action) => {
    if (!window.electronAPI) {
      return;
    }

    const actionKey = `${serviceName}-${action}`;
    setActionLoading(prev => ({ ...prev, [actionKey]: true }));

    try {
      let result;
      switch (action) {
        case 'start':
          result = await window.electronAPI.startService(serviceName);
          break;
        case 'stop':
          result = await window.electronAPI.stopService(serviceName);
          break;
        case 'restart':
          result = await window.electronAPI.restartService(serviceName);
          break;
        default:
          return;
      }

      if (result.success) {
        // Refresh services list after action
        await loadServices();
      } else {
        alert(`Failed to ${action} service: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Error ${action}ing service:`, error);
      alert(`Failed to ${action} service: ${error.message || 'Unknown error'}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  const handleLogout = async () => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.logout();
        onLogout();
      }
    } catch (error) {
      console.error('Logout error:', error);
      onLogout(); // Logout locally even if API call fails
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'running':
        return '#22c55e';
      case 'stopped':
        return '#ef4444';
      case 'paused':
        return '#fbbf24';
      default:
        return '#6b7280';
    }
  };

  const getStatusSummary = () => {
    const dbConnected = dbStatus.status === 'connected';
    const runningServices = services.filter(s => s.status?.toLowerCase() === 'running').length;
    const totalServices = services.length;
    
    return { dbConnected, runningServices, totalServices };
  };

  const renderOverviewTab = () => {
    const { dbConnected, runningServices, totalServices } = getStatusSummary();
    
    return (
      <div className="tab-content">
        <div className="overview-welcome">
          <h2 className="overview-welcome__title">
            Welcome back, <span className="overview-welcome__name">{user.username}</span>!
          </h2>
          <p className="overview-welcome__subtitle">
            Here's an overview of your system status
          </p>
        </div>

        <div className="overview-stats">
          <div className="stat-card">
            <div className="stat-card__icon"><i className="fa-solid fa-database" aria-hidden="true"></i></div>
            <div className="stat-card__content">
              <div className="stat-card__value">
                {dbConnected ? 'Connected' : 'Disconnected'}
              </div>
              <div className="stat-card__label">Database Status</div>
            </div>
            <div className={`stat-card__indicator stat-card__indicator--${dbConnected ? 'success' : 'error'}`}></div>
          </div>

          <div className="stat-card">
            <div className="stat-card__icon"><i className="fa-solid fa-gear" aria-hidden="true"></i></div>
            <div className="stat-card__content">
              <div className="stat-card__value">
                {runningServices} / {totalServices}
              </div>
              <div className="stat-card__label">Services Running</div>
            </div>
            <div className="stat-card__indicator stat-card__indicator--info"></div>
          </div>

          <div className="stat-card">
            <div className="stat-card__icon"><i className="fa-solid fa-user" aria-hidden="true"></i></div>
            <div className="stat-card__content">
              <div className="stat-card__value">{user.authMethod || 'Local'}</div>
              <div className="stat-card__label">Authentication</div>
            </div>
            <div className="stat-card__indicator stat-card__indicator--success"></div>
          </div>

          <div className="stat-card">
            <div className="stat-card__icon"><i className="fa-solid fa-clock" aria-hidden="true"></i></div>
            <div className="stat-card__content">
              <div className="stat-card__value">
                {sessionInfo ? new Date(sessionInfo.authenticatedAt).toLocaleTimeString() : 'N/A'}
              </div>
              <div className="stat-card__label">Session Started</div>
            </div>
            <div className="stat-card__indicator stat-card__indicator--info"></div>
          </div>
        </div>

        {user.domain && (
          <div className="overview-info">
            <div className="overview-info__item">
              <span className="overview-info__label">Domain:</span>
              <span className="overview-info__value">{user.domain}</span>
            </div>
          </div>
        )}

        <div className="overview-actions">
          <button 
            className="overview-action-btn"
            onClick={() => setActiveTab('database')}
          >
            <i className="fa-solid fa-database overview-action-btn__icon" aria-hidden="true"></i>
            <span>Check Database</span>
          </button>
          <button 
            className="overview-action-btn"
            onClick={() => setActiveTab('services')}
          >
            <i className="fa-solid fa-gear overview-action-btn__icon" aria-hidden="true"></i>
            <span>Manage Services</span>
          </button>
          <button 
            className="overview-action-btn"
            onClick={() => setActiveTab('monitoring')}
          >
            <i className="fa-solid fa-chart-line overview-action-btn__icon" aria-hidden="true"></i>
            <span>View Monitoring</span>
          </button>
        </div>
      </div>
    );
  };

  const renderDatabaseTab = () => {
    return (
      <div className="tab-content">
        <div className="db-connection">
        <div className="db-connection__header">
          <div className="db-connection__indicator">
            <span
              className={`db-connection__dot db-connection__dot--${dbStatus.status}`}
            ></span>
            <span className="db-connection__label">Database Connection</span>
          </div>
          <button
            className="db-connection__refresh"
            onClick={checkDbConnection}
            disabled={dbStatus.status === 'checking'}
            title="Refresh connection"
          >
            <i className={`fa-solid fa-rotate ${dbStatus.status === 'checking' ? 'fa-spin' : ''}`} aria-hidden="true"></i>
          </button>
        </div>
        <div className="db-connection__status">
          <span className={`db-connection__message db-connection__message--${dbStatus.status}`}>
            {dbStatus.message}
          </span>
        </div>
        {dbStatus.status === 'connected' && dbStatus.serverInfo && (
          <div className="db-connection__info">
            <div className="db-connection__info-item">
              <span className="db-connection__info-label">User:</span>
              <span className="db-connection__info-value">
                {dbStatus.serverInfo.currentUser || 'N/A'}
              </span>
            </div>
            <div className="db-connection__info-item">
              <span className="db-connection__info-label">Database:</span>
              <span className="db-connection__info-value">
                {dbStatus.serverInfo.currentDatabase || 'N/A'}
              </span>
            </div>
          </div>
        )}
        {dbStatus.status === 'disconnected' && dbStatus.error && (
          <div className="db-connection__error">
            <span className="db-connection__error-text">{dbStatus.error}</span>
          </div>
        )}
        </div>
      </div>
    );
  };

  const renderServicesTab = () => {
    return (
      <div className="tab-content">
        <div className="services-section">
        <div className="services-section__header">
          <h2 className="services-section__title">Windows Services</h2>
          <button
            className="services-section__refresh"
            onClick={loadServices}
            disabled={servicesLoading}
            title="Refresh services"
          >
            <i className={`fa-solid fa-rotate ${servicesLoading ? 'fa-spin' : ''}`} aria-hidden="true"></i>
          </button>
        </div>

        {servicesError && (
          <div className="services-section__error">
            <span>{servicesError}</span>
          </div>
        )}

        {servicesLoading && services.length === 0 ? (
          <div className="services-section__loading">
            <span>Loading services...</span>
          </div>
        ) : (
          <div className="services-list">
            {services.length === 0 ? (
              <div className="services-list__empty">
                <span>No services found</span>
              </div>
            ) : (
              services.map((service) => {
                const isRunning = service.status?.toLowerCase() === 'running';
                const isStopped = service.status?.toLowerCase() === 'stopped';
                const actionKey = service.name;

                return (
                  <div key={service.name} className="service-item">
                    <div className="service-item__info">
                      <div className="service-item__header">
                        <span className="service-item__name">{service.displayName || service.name}</span>
                        <span
                          className="service-item__status"
                          style={{ color: getStatusColor(service.status) }}
                        >
                          <span
                            className="service-item__status-dot"
                            style={{ backgroundColor: getStatusColor(service.status) }}
                          ></span>
                          {service.status || 'Unknown'}
                        </span>
                      </div>
                      <div className="service-item__details">
                        <span className="service-item__detail-label">Name:</span>
                        <span className="service-item__detail-value">{service.name}</span>
                      </div>
                      <div className="service-item__details">
                        <span className="service-item__detail-label">Start Type:</span>
                        <span className="service-item__detail-value">{service.startType || 'Unknown'}</span>
                      </div>
                    </div>
                    <div className="service-item__actions">
                      {isStopped && (
                        <button
                          className="service-item__action service-item__action--start"
                          onClick={() => handleServiceAction(service.name, 'start')}
                          disabled={actionLoading[`${actionKey}-start`]}
                          title="Start service"
                        >
                          {actionLoading[`${actionKey}-start`] ? (
                            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                          ) : (
                            <i className="fa-solid fa-play" aria-hidden="true"></i>
                          )}
                          Start
                        </button>
                      )}
                      {isRunning && (
                        <>
                          <button
                            className="service-item__action service-item__action--stop"
                            onClick={() => handleServiceAction(service.name, 'stop')}
                            disabled={actionLoading[`${actionKey}-stop`]}
                            title="Stop service"
                          >
                            {actionLoading[`${actionKey}-stop`] ? (
                              <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                            ) : (
                              <i className="fa-solid fa-stop" aria-hidden="true"></i>
                            )}
                            Stop
                          </button>
                          <button
                            className="service-item__action service-item__action--restart"
                            onClick={() => handleServiceAction(service.name, 'restart')}
                            disabled={actionLoading[`${actionKey}-restart`]}
                            title="Restart service"
                          >
                            {actionLoading[`${actionKey}-restart`] ? (
                              <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                            ) : (
                              <i className="fa-solid fa-rotate" aria-hidden="true"></i>
                            )}
                            Restart
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
        </div>
      </div>
    );
  };

  const renderMonitoringTab = () => {
    return (
      <div className="tab-content">
        <MonitoringPanel />
      </div>
    );
  };

  const renderProfileTab = () => {
    return (
      <div className="tab-content">
        <div className="profile-section">
          <div className="profile-header">
            <div className="profile-avatar">
              <i className="fa-solid fa-user profile-avatar__icon" aria-hidden="true"></i>
            </div>
            <div className="profile-info">
              <h2 className="profile-info__name">{user.username}</h2>
              <p className="profile-info__role">{user.authMethod || 'User'}</p>
            </div>
          </div>

          <div className="profile-details">
            <div className="profile-detail-item">
              <span className="profile-detail-item__label">Username</span>
              <span className="profile-detail-item__value">{user.username}</span>
            </div>
            
            {user.domain && (
              <div className="profile-detail-item">
                <span className="profile-detail-item__label">Domain</span>
                <span className="profile-detail-item__value">{user.domain}</span>
              </div>
            )}
            
            <div className="profile-detail-item">
              <span className="profile-detail-item__label">Authentication Method</span>
              <span className="profile-detail-item__value">{user.authMethod || 'Local'}</span>
            </div>
            
            {sessionInfo && (
              <>
                <div className="profile-detail-item">
                  <span className="profile-detail-item__label">Session Started</span>
                  <span className="profile-detail-item__value">
                    {new Date(sessionInfo.authenticatedAt).toLocaleString()}
                  </span>
                </div>
                
                <div className="profile-detail-item">
                  <span className="profile-detail-item__label">Session Duration</span>
                  <span className="profile-detail-item__value">
                    {Math.floor((Date.now() - new Date(sessionInfo.authenticatedAt)) / 60000)} minutes
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="profile-actions">
            <button className="profile-action-btn profile-action-btn--logout" onClick={handleLogout}>
              <i className="fa-solid fa-right-from-bracket profile-action-btn__icon" aria-hidden="true"></i>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <div className="app__header">
        <div className="app__badge">
          <span className="app__badge-dot"></span>
          <span>Authenticated</span>
        </div>

        <h1 className="app__title">
          <span className="app__title-highlight">{user.username}</span>'s Dashboard
        </h1>
      </div>

      {/* Tab Navigation */}
      <div className="tabs">
        <div className="tabs__nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tabs__nav-item ${activeTab === tab.id ? 'tabs__nav-item--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <i className={`fa-solid ${tab.icon} tabs__nav-icon`} aria-hidden="true"></i>
              <span className="tabs__nav-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="tabs__content">
          {activeTab === 'overview' && renderOverviewTab()}
          {activeTab === 'database' && renderDatabaseTab()}
          {activeTab === 'services' && renderServicesTab()}
          {activeTab === 'monitoring' && renderMonitoringTab()}
          {activeTab === 'profile' && renderProfileTab()}
        </div>
      </div>

      <div className="app__footer">
        <span>Connected to Windows Services</span>
        <span className="app__footer-separator">•</span>
        <span>Electron POC v1.0</span>
      </div>
    </div>
  );
}

export default Dashboard;

