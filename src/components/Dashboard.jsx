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
  const [serviceFilter, setServiceFilter] = useState('all'); // 'all', 'running', 'stopped', 'paused'
  const [testServices, setTestServices] = useState([]);
  const [testServicesLoading, setTestServicesLoading] = useState(false);
  const [testServicesError, setTestServicesError] = useState(null);
  const [testServicesActionLoading, setTestServicesActionLoading] = useState({});
  const [testServicesTotalSize, setTestServicesTotalSize] = useState(null);
  const [applications, setApplications] = useState([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState(null);
  const [applicationActionLoading, setApplicationActionLoading] = useState({});

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'fa-house' },
    { id: 'database', label: 'Database', icon: 'fa-database' },
    { id: 'services', label: 'Services', icon: 'fa-gear' },
    { id: 'applications', label: 'Applications', icon: 'fa-window-restore' },
    { id: 'monitoring', label: 'Monitoring', icon: 'fa-chart-line' },
    { id: 'profile', label: 'Profile', icon: 'fa-user' },
  ];

  useEffect(() => {
    loadSessionInfo();
    checkDbConnection();
    loadServices();
    loadTestServices();
    loadApplications();
    
    // Check connection every 30 seconds
    const interval = setInterval(() => {
      checkDbConnection();
    }, 30000);

    // Refresh services every 10 seconds
    const servicesInterval = setInterval(() => {
      loadServices();
      loadTestServices();
    }, 10000);

    // Refresh applications every 5 seconds
    const appsInterval = setInterval(() => {
      loadApplications();
    }, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(servicesInterval);
      clearInterval(appsInterval);
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

  const loadTestServices = async () => {
    try {
      if (!window.electronAPI) {
        setTestServicesError('Electron API not available. Please restart the application.');
        return;
      }

      if (typeof window.electronAPI.getTestServices !== 'function' || 
          typeof window.electronAPI.getTestServicesTotalSize !== 'function') {
        setTestServicesError('Test services API not available. Please restart the Electron application.');
        return;
      }

      setTestServicesLoading(true);
      setTestServicesError(null);

      const [servicesResult, sizeResult] = await Promise.all([
        window.electronAPI.getTestServices(),
        window.electronAPI.getTestServicesTotalSize(),
      ]);

      if (servicesResult.success) {
        setTestServices(servicesResult.services || []);
      } else {
        setTestServicesError(servicesResult.error || 'Failed to load test services');
      }

      if (sizeResult.success) {
        setTestServicesTotalSize(sizeResult);
      }
    } catch (error) {
      console.error('Error loading test services:', error);
      setTestServicesError(error.message || 'Failed to load test services');
    } finally {
      setTestServicesLoading(false);
    }
  };

  const handleCreateTestServices = async () => {
    if (!window.electronAPI) {
      alert('Electron API is not available. Please restart the application.');
      return;
    }

    if (typeof window.electronAPI.createTestService !== 'function') {
      alert('Test services API is not available. Please restart the Electron application to load the updated preload script.');
      return;
    }

    setTestServicesActionLoading(prev => ({ ...prev, 'create-all': true }));

    try {
      const serviceNames = ['TestService1', 'TestService2', 'TestService3', 'TestService4', 'TestService5'];
      const sizeMB = 10; // 10MB per service
      
      const results = await Promise.all(
        serviceNames.map(name => 
          window.electronAPI.createTestService(name, sizeMB)
        )
      );

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      if (successCount > 0) {
        await loadTestServices();
        alert(`Successfully created ${successCount} test service(s)${failCount > 0 ? `, ${failCount} failed` : ''}`);
      } else {
        alert(`Failed to create test services: ${results[0]?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating test services:', error);
      alert(`Failed to create test services: ${error.message || 'Unknown error'}`);
    } finally {
      setTestServicesActionLoading(prev => ({ ...prev, 'create-all': false }));
    }
  };

  const handleStopTestService = async (serviceName) => {
    if (!window.electronAPI) {
      alert('Electron API is not available. Please restart the application.');
      return;
    }

    if (typeof window.electronAPI.stopTestService !== 'function') {
      alert('Test services API is not available. Please restart the Electron application.');
      return;
    }

    setTestServicesActionLoading(prev => ({ ...prev, [serviceName]: true }));

    try {
      const result = await window.electronAPI.stopTestService(serviceName);

      if (result.success) {
        await loadTestServices();
      } else {
        alert(`Failed to stop test service: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error stopping test service:', error);
      alert(`Failed to stop test service: ${error.message || 'Unknown error'}`);
    } finally {
      setTestServicesActionLoading(prev => ({ ...prev, [serviceName]: false }));
    }
  };

  const handleStopAllTestServices = async () => {
    if (!window.electronAPI) {
      alert('Electron API is not available. Please restart the application.');
      return;
    }

    if (typeof window.electronAPI.stopAllTestServices !== 'function') {
      alert('Test services API is not available. Please restart the Electron application.');
      return;
    }

    if (!confirm('Are you sure you want to stop all test services? This will remove all test service files.')) {
      return;
    }

    setTestServicesActionLoading(prev => ({ ...prev, 'stop-all': true }));

    try {
      const result = await window.electronAPI.stopAllTestServices();

      if (result.success) {
        await loadTestServices();
        alert(result.message || 'All test services stopped successfully');
      } else {
        alert(`Failed to stop all test services: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error stopping all test services:', error);
      alert(`Failed to stop all test services: ${error.message || 'Unknown error'}`);
    } finally {
      setTestServicesActionLoading(prev => ({ ...prev, 'stop-all': false }));
    }
  };

  const loadApplications = async () => {
    try {
      if (!window.electronAPI) {
        setApplicationsError('Electron API not available. Please restart the Electron application.');
        return;
      }

      if (!window.electronAPI.getRunningApplications) {
        setApplicationsError('Application control API not available. Please restart the Electron application to load the updated code.');
        return;
      }

      setApplicationsLoading(true);
      setApplicationsError(null);

      const result = await window.electronAPI.getRunningApplications();

      if (result.success) {
        const apps = result.applications || [];
        setApplications(apps);
        if (apps.length === 0) {
          setApplicationsError('No applications with visible windows found. Try opening some applications with windows.');
        }
      } else {
        console.error('Failed to load applications:', result.error);
        setApplicationsError(result.error || 'Failed to load applications');
      }
    } catch (error) {
      console.error('Error loading applications:', error);
      setApplicationsError(`Error: ${error.message || 'Failed to load applications'}`);
    } finally {
      setApplicationsLoading(false);
    }
  };

  const handleApplicationAction = async (processId, action) => {
    if (!window.electronAPI) {
      return;
    }

    const actionKey = `${processId}-${action}`;
    setApplicationActionLoading(prev => ({ ...prev, [actionKey]: true }));

    try {
      let result;
      switch (action) {
        case 'close':
          result = await window.electronAPI.closeApplication(processId);
          break;
        case 'force-close':
          result = await window.electronAPI.forceCloseApplication(processId);
          break;
        case 'focus':
          result = await window.electronAPI.focusApplication(processId);
          break;
        case 'minimize':
          result = await window.electronAPI.minimizeApplication(processId);
          break;
        default:
          return;
      }

      if (result.success) {
        // Refresh applications list after action
        await loadApplications();
      } else {
        alert(`Failed to ${action} application: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Error ${action}ing application:`, error);
      alert(`Failed to ${action} application: ${error.message || 'Unknown error'}`);
    } finally {
      setApplicationActionLoading(prev => ({ ...prev, [actionKey]: false }));
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

  // Windows Service Status Codes:
  // 1 = Stopped, 2 = Start Pending, 3 = Stop Pending, 4 = Running,
  // 5 = Continue Pending, 6 = Pause Pending, 7 = Paused
  
  // Convert numeric status code to status string
  const getStatusString = (status) => {
    if (status === null || status === undefined) return 'unknown';
    
    const statusNum = typeof status === 'number' ? status : parseInt(status, 10);
    
    if (isNaN(statusNum)) {
      // If it's not a number, try to handle string status
      const statusStr = String(status).toLowerCase().trim();
      return statusStr;
    }
    
    switch (statusNum) {
      case 1:
        return 'stopped';
      case 2:
        return 'start pending';
      case 3:
        return 'stop pending';
      case 4:
        return 'running';
      case 5:
        return 'continue pending';
      case 6:
        return 'pause pending';
      case 7:
        return 'paused';
      default:
        return 'unknown';
    }
  };

  // Get display name for status
  const getStatusDisplayName = (status) => {
    const statusStr = getStatusString(status);
    switch (statusStr) {
      case 'stopped':
        return 'Stopped';
      case 'start pending':
        return 'Start Pending';
      case 'stop pending':
        return 'Stop Pending';
      case 'running':
        return 'Running';
      case 'continue pending':
        return 'Continue Pending';
      case 'pause pending':
        return 'Pause Pending';
      case 'paused':
        return 'Paused';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status) => {
    const statusStr = getStatusString(status);
    switch (statusStr) {
      case 'running':
        return '#22c55e';
      case 'stopped':
      case 'stop pending':
        return '#ef4444';
      case 'paused':
        return '#fbbf24';
      case 'start pending':
      case 'continue pending':
      case 'pause pending':
        return '#fbbf24';
      default:
        return '#6b7280';
    }
  };

  const getStatusSummary = () => {
    const dbConnected = dbStatus.status === 'connected';
    const runningServices = services.filter(s => {
      const statusNum = typeof s.status === 'number' ? s.status : parseInt(s.status, 10);
      return statusNum === 4; // Running status code
    }).length;
    const totalServices = services.length;
    const runningApplications = applications.length;
    
    return { dbConnected, runningServices, totalServices, runningApplications };
  };

  const renderOverviewTab = () => {
    const { dbConnected, runningServices, totalServices, runningApplications } = getStatusSummary();
    
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

          <div className="stat-card">
            <div className="stat-card__icon"><i className="fa-solid fa-window-restore" aria-hidden="true"></i></div>
            <div className="stat-card__content">
              <div className="stat-card__value">{runningApplications}</div>
              <div className="stat-card__label">Running Apps</div>
            </div>
            <div className="stat-card__indicator stat-card__indicator--success"></div>
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
            onClick={() => setActiveTab('applications')}
          >
            <i className="fa-solid fa-window-restore overview-action-btn__icon" aria-hidden="true"></i>
            <span>Control Applications</span>
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
    // Helper function to get service status string from numeric code
    const getServiceStatusString = (service) => {
      return getStatusString(service.status);
    };

    // Helper function to check if service is running (status code 4)
    const isServiceRunning = (service) => {
      const statusNum = typeof service.status === 'number' ? service.status : parseInt(service.status, 10);
      return statusNum === 4;
    };

    // Helper function to check if service is stopped (status code 1 or 3)
    const isServiceStopped = (service) => {
      const statusNum = typeof service.status === 'number' ? service.status : parseInt(service.status, 10);
      return statusNum === 1 || statusNum === 3; // Stopped or Stop Pending
    };

    // Helper function to check if service is paused (status code 7)
    const isServicePaused = (service) => {
      const statusNum = typeof service.status === 'number' ? service.status : parseInt(service.status, 10);
      return statusNum === 7;
    };

    // Calculate filter counts
    const getFilterCounts = () => {
      const runningCount = services.filter(s => isServiceRunning(s)).length;
      const stoppedCount = services.filter(s => isServiceStopped(s)).length;
      const pausedCount = services.filter(s => isServicePaused(s)).length;
      
      return { runningCount, stoppedCount, pausedCount };
    };

    const { runningCount, stoppedCount, pausedCount } = getFilterCounts();

    // Filter services based on selected filter
    const getFilteredServices = () => {
      if (serviceFilter === 'all') {
        return services;
      }
      
      return services.filter((service) => {
        switch (serviceFilter) {
          case 'running':
            return isServiceRunning(service);
          case 'stopped':
            return isServiceStopped(service);
          case 'paused':
            return isServicePaused(service);
          default:
            return true;
        }
      });
    };

    const filteredServices = getFilteredServices();

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

        {/* Filter Buttons */}
        <div className="services-section__filters">
          <button
            className={`services-filter-btn ${serviceFilter === 'all' ? 'services-filter-btn--active' : ''}`}
            onClick={() => setServiceFilter('all')}
          >
            <i className="fa-solid fa-list" aria-hidden="true"></i>
            <span>All ({services.length})</span>
          </button>
          <button
            className={`services-filter-btn ${serviceFilter === 'running' ? 'services-filter-btn--active' : ''}`}
            onClick={() => setServiceFilter('running')}
          >
            <i className="fa-solid fa-circle-play" aria-hidden="true"></i>
            <span>Running ({runningCount})</span>
          </button>
          <button
            className={`services-filter-btn ${serviceFilter === 'stopped' ? 'services-filter-btn--active' : ''}`}
            onClick={() => setServiceFilter('stopped')}
          >
            <i className="fa-solid fa-circle-stop" aria-hidden="true"></i>
            <span>Stopped ({stoppedCount})</span>
          </button>
          <button
            className={`services-filter-btn ${serviceFilter === 'paused' ? 'services-filter-btn--active' : ''}`}
            onClick={() => setServiceFilter('paused')}
          >
            <i className="fa-solid fa-circle-pause" aria-hidden="true"></i>
            <span>Paused ({pausedCount})</span>
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
            {filteredServices.length === 0 ? (
              <div className="services-list__empty">
                <span>No {serviceFilter !== 'all' ? serviceFilter : ''} services found</span>
              </div>
            ) : (
              filteredServices.map((service) => {
                const isRunning = isServiceRunning(service);
                const isStopped = isServiceStopped(service);
                const isPaused = isServicePaused(service);
                const actionKey = service.name;
                const statusDisplayName = getStatusDisplayName(service.status);

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
                          {statusDisplayName}
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
                      {(isStopped || (!isRunning && !isPaused)) && (
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
                      {(isRunning || isPaused) && (
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
                          {isRunning && (
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
                          )}
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

        {/* Test Services Section */}
        <div className="services-section" style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px solid #e5e7eb' }}>
          <div className="services-section__header">
            <h2 className="services-section__title">Test Services</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {testServicesTotalSize && (
                <span style={{ 
                  fontSize: '0.875rem', 
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  <i className="fa-solid fa-hard-drive" aria-hidden="true"></i>
                  Total: {testServicesTotalSize.totalMB} MB ({testServicesTotalSize.count} services)
                </span>
              )}
              <button
                className="services-section__refresh"
                onClick={loadTestServices}
                disabled={testServicesLoading}
                title="Refresh test services"
              >
                <i className={`fa-solid fa-rotate ${testServicesLoading ? 'fa-spin' : ''}`} aria-hidden="true"></i>
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="service-item__action service-item__action--start"
              onClick={handleCreateTestServices}
              disabled={testServicesActionLoading['create-all'] || testServices.length >= 5}
              title="Create 5 test services (10MB each)"
              style={{ 
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                opacity: testServices.length >= 5 ? 0.5 : 1
              }}
            >
              {testServicesActionLoading['create-all'] ? (
                <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
              ) : (
                <i className="fa-solid fa-plus" aria-hidden="true"></i>
              )}
              Create 5 Test Services
            </button>
            {testServices.length > 0 && (
              <button
                className="service-item__action service-item__action--stop"
                onClick={handleStopAllTestServices}
                disabled={testServicesActionLoading['stop-all']}
                title="Stop all test services"
                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
              >
                {testServicesActionLoading['stop-all'] ? (
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                ) : (
                  <i className="fa-solid fa-stop" aria-hidden="true"></i>
                )}
                Stop All Test Services
              </button>
            )}
          </div>

          {testServicesError && (
            <div className="services-section__error">
              <span>{testServicesError}</span>
            </div>
          )}

          {testServicesLoading && testServices.length === 0 ? (
            <div className="services-section__loading">
              <span>Loading test services...</span>
            </div>
          ) : (
            <div className="services-list">
              {testServices.length === 0 ? (
                <div className="services-list__empty">
                  <span>No test services created. Click "Create 5 Test Services" to create test services that will increase application size.</span>
                </div>
              ) : (
                testServices.map((service) => {
                  const actionKey = service.name;

                  return (
                    <div key={service.name} className="service-item">
                      <div className="service-item__info">
                        <div className="service-item__header">
                          <span className="service-item__name">{service.displayName || service.name}</span>
                          <span
                            className="service-item__status"
                            style={{ color: '#22c55e' }}
                          >
                            <span
                              className="service-item__status-dot"
                              style={{ backgroundColor: '#22c55e' }}
                            ></span>
                            Running
                          </span>
                        </div>
                        <div className="service-item__details">
                          <span className="service-item__detail-label">Name:</span>
                          <span className="service-item__detail-value">{service.name}</span>
                        </div>
                        <div className="service-item__details">
                          <span className="service-item__detail-label">Size:</span>
                          <span className="service-item__detail-value">{service.sizeMB} MB</span>
                        </div>
                        <div className="service-item__details">
                          <span className="service-item__detail-label">Created:</span>
                          <span className="service-item__detail-value">
                            {new Date(service.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="service-item__actions">
                        <button
                          className="service-item__action service-item__action--stop"
                          onClick={() => handleStopTestService(service.name)}
                          disabled={testServicesActionLoading[actionKey]}
                          title="Stop and remove test service"
                        >
                          {testServicesActionLoading[actionKey] ? (
                            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                          ) : (
                            <i className="fa-solid fa-stop" aria-hidden="true"></i>
                          )}
                          Stop
                        </button>
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

  const renderApplicationsTab = () => {
    return (
      <div className="tab-content">
        <div className="services-section">
          <div className="services-section__header">
            <h2 className="services-section__title">Running Applications</h2>
            <button
              className="services-section__refresh"
              onClick={loadApplications}
              disabled={applicationsLoading}
              title="Refresh applications"
            >
              <i className={`fa-solid fa-rotate ${applicationsLoading ? 'fa-spin' : ''}`} aria-hidden="true"></i>
            </button>
          </div>

          {applicationsError && (
            <div className="services-section__error">
              <span>{applicationsError}</span>
              {applicationsError.includes('API not available') && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                  <strong>Note:</strong> Press Ctrl+C in the terminal and run <code>npm run electron:dev</code> again to restart the application.
                </div>
              )}
            </div>
          )}

          {applicationsLoading && applications.length === 0 ? (
            <div className="services-section__loading">
              <span>Loading applications...</span>
            </div>
          ) : (
            <div className="services-list">
              {applications.length === 0 ? (
                <div className="services-list__empty">
                  <span>No applications with windows are currently running</span>
                </div>
              ) : (
                applications.map((app) => {
                  const actionKey = app.id;

                  return (
                    <div key={app.id} className="service-item">
                      <div className="service-item__info">
                        <div className="service-item__header">
                          <span className="service-item__name">{app.title}</span>
                          <span
                            className="service-item__status"
                            style={{ color: '#22c55e' }}
                          >
                            <span
                              className="service-item__status-dot"
                              style={{ backgroundColor: '#22c55e' }}
                            ></span>
                            Running
                          </span>
                        </div>
                        <div className="service-item__details">
                          <span className="service-item__detail-label">Process:</span>
                          <span className="service-item__detail-value">{app.name}</span>
                        </div>
                        <div className="service-item__details">
                          <span className="service-item__detail-label">PID:</span>
                          <span className="service-item__detail-value">{app.id}</span>
                        </div>
                        <div className="service-item__details">
                          <span className="service-item__detail-label">Memory:</span>
                          <span className="service-item__detail-value">{app.memory.toFixed(2)} MB</span>
                        </div>
                        {app.cpu > 0 && (
                          <div className="service-item__details">
                            <span className="service-item__detail-label">CPU Time:</span>
                            <span className="service-item__detail-value">{app.cpu.toFixed(2)}s</span>
                          </div>
                        )}
                      </div>
                      <div className="service-item__actions">
                        <button
                          className="service-item__action service-item__action--start"
                          onClick={() => handleApplicationAction(app.id, 'focus')}
                          disabled={applicationActionLoading[`${actionKey}-focus`]}
                          title="Focus window"
                        >
                          {applicationActionLoading[`${actionKey}-focus`] ? (
                            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                          ) : (
                            <i className="fa-solid fa-eye" aria-hidden="true"></i>
                          )}
                          Focus
                        </button>
                        <button
                          className="service-item__action service-item__action--restart"
                          onClick={() => handleApplicationAction(app.id, 'minimize')}
                          disabled={applicationActionLoading[`${actionKey}-minimize`]}
                          title="Minimize window"
                        >
                          {applicationActionLoading[`${actionKey}-minimize`] ? (
                            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                          ) : (
                            <i className="fa-solid fa-window-minimize" aria-hidden="true"></i>
                          )}
                          Minimize
                        </button>
                        <button
                          className="service-item__action service-item__action--stop"
                          onClick={() => handleApplicationAction(app.id, 'close')}
                          disabled={applicationActionLoading[`${actionKey}-close`]}
                          title="Close application"
                        >
                          {applicationActionLoading[`${actionKey}-close`] ? (
                            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                          ) : (
                            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                          )}
                          Close
                        </button>
                        <button
                          className="service-item__action service-item__action--stop"
                          onClick={() => handleApplicationAction(app.id, 'force-close')}
                          disabled={applicationActionLoading[`${actionKey}-force-close`]}
                          title="Force close application"
                          style={{ backgroundColor: '#dc2626' }}
                        >
                          {applicationActionLoading[`${actionKey}-force-close`] ? (
                            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                          ) : (
                            <i className="fa-solid fa-skull" aria-hidden="true"></i>
                          )}
                          Force Kill
                        </button>
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
          {activeTab === 'applications' && renderApplicationsTab()}
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

