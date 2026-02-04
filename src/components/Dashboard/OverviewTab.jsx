import React from 'react';

function OverviewTab({ 
  user, 
  sessionInfo,
  dbConnections,
  services,
  applications,
  onNavigateToTab,
}) {
  const connectedDatabases = dbConnections.filter(conn => conn.status?.success === true).length;
  const totalDatabases = dbConnections.length;
  
  const runningServices = services.filter(s => {
    const statusNum = typeof s.status === 'number' ? s.status : parseInt(s.status, 10);
    return statusNum === 4; // Running status code
  }).length;
  const totalServices = services.length;
  
  const runningApplications = applications.length;

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
              {totalDatabases > 0 ? `${connectedDatabases} / ${totalDatabases}` : 'None'}
            </div>
            <div className="stat-card__label">Database Connections</div>
          </div>
          <div className={`stat-card__indicator stat-card__indicator--${connectedDatabases > 0 ? 'success' : 'info'}`}></div>
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
          onClick={() => onNavigateToTab('database')}
        >
          <i className="fa-solid fa-database overview-action-btn__icon" aria-hidden="true"></i>
          <span>Check Database</span>
        </button>
        <button 
          className="overview-action-btn"
          onClick={() => onNavigateToTab('services')}
        >
          <i className="fa-solid fa-gear overview-action-btn__icon" aria-hidden="true"></i>
          <span>Manage Services</span>
        </button>
        <button 
          className="overview-action-btn"
          onClick={() => onNavigateToTab('applications')}
        >
          <i className="fa-solid fa-window-restore overview-action-btn__icon" aria-hidden="true"></i>
          <span>Control Applications</span>
        </button>
        <button 
          className="overview-action-btn"
          onClick={() => onNavigateToTab('monitoring')}
        >
          <i className="fa-solid fa-chart-line overview-action-btn__icon" aria-hidden="true"></i>
          <span>View Monitoring</span>
        </button>
      </div>
    </div>
  );
}

export default OverviewTab;
