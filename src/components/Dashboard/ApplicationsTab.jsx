import React from 'react';

function ApplicationsTab({ 
  applications,
  applicationsLoading,
  applicationsError,
  applicationActionLoading,
  onRefresh,
  onApplicationAction,
}) {
  return (
    <div className="tab-content">
      <div className="services-section">
        <div className="services-section__header">
          <h2 className="services-section__title">Running Applications</h2>
          <button
            className="services-section__refresh"
            onClick={onRefresh}
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
                        onClick={() => onApplicationAction(app.id, 'focus')}
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
                        onClick={() => onApplicationAction(app.id, 'minimize')}
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
                        onClick={() => onApplicationAction(app.id, 'close')}
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
                        onClick={() => onApplicationAction(app.id, 'force-close')}
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
}

export default ApplicationsTab;
