import React, { useState } from 'react';
import { getStatusDisplayName, getStatusColor } from '../../utils/statusHelpers';

function ServicesTab({ 
  services,
  servicesLoading,
  servicesError,
  actionLoading,
  testServices,
  testServicesLoading,
  testServicesError,
  testServicesActionLoading,
  testServicesTotalSize,
  onRefreshServices,
  onServiceAction,
  onRefreshTestServices,
  onCreateTestServices,
  onStopTestService,
  onStopAllTestServices,
}) {
  const [serviceFilter, setServiceFilter] = useState('all');

  const isServiceRunning = (service) => {
    const statusNum = typeof service.status === 'number' ? service.status : parseInt(service.status, 10);
    return statusNum === 4;
  };

  const isServiceStopped = (service) => {
    const statusNum = typeof service.status === 'number' ? service.status : parseInt(service.status, 10);
    return statusNum === 1 || statusNum === 3;
  };

  const isServicePaused = (service) => {
    const statusNum = typeof service.status === 'number' ? service.status : parseInt(service.status, 10);
    return statusNum === 7;
  };

  const getFilterCounts = () => {
    const runningCount = services.filter(s => isServiceRunning(s)).length;
    const stoppedCount = services.filter(s => isServiceStopped(s)).length;
    const pausedCount = services.filter(s => isServicePaused(s)).length;
    
    return { runningCount, stoppedCount, pausedCount };
  };

  const { runningCount, stoppedCount, pausedCount } = getFilterCounts();

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
            onClick={onRefreshServices}
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
                          onClick={() => onServiceAction(service.name, 'start')}
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
                            onClick={() => onServiceAction(service.name, 'stop')}
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
                              onClick={() => onServiceAction(service.name, 'restart')}
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
              onClick={onRefreshTestServices}
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
            onClick={onCreateTestServices}
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
              onClick={onStopAllTestServices}
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
                        onClick={() => onStopTestService(service.name)}
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
}

export default ServicesTab;
