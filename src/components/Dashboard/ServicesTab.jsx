import React, { useState } from 'react';
import { getStatusDisplayName, getStatusColor } from '../../utils/statusHelpers';

function ServicesTab({ 
  services,
  servicesLoading,
  servicesError,
  actionLoading,
  onRefreshServices,
  onServiceAction,
}) {
  const [serviceFilter, setServiceFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

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
    const term = searchTerm.trim().toLowerCase();

    const statusFiltered = services.filter((service) => {
      switch (serviceFilter) {
        case 'running':
          return isServiceRunning(service);
        case 'stopped':
          return isServiceStopped(service);
        case 'paused':
          return isServicePaused(service);
        case 'all':
        default:
          return true;
      }
    });

    if (!term) {
      return statusFiltered;
    }

    return statusFiltered.filter((service) => {
      const name = (service.name || '').toLowerCase();
      const displayName = (service.displayName || '').toLowerCase();
      return name.includes(term) || displayName.includes(term);
    });
  };

  const filteredServices = getFilteredServices();

  return (
    <div className="tab-content">
      <div className="services-section">
        <div className="services-section__header">
          <h2 className="services-section__title">Windows Services</h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div className="services-section__search">
              <i
                className="fa-solid fa-magnifying-glass services-section__search-icon"
                aria-hidden="true"
              ></i>
              <input
                type="text"
                className="services-section__search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search services by name..."
              />
            </div>
            <button
              className="services-section__refresh"
              onClick={onRefreshServices}
              disabled={servicesLoading}
              title="Refresh services"
            >
              <i className={`fa-solid fa-rotate ${servicesLoading ? 'fa-spin' : ''}`} aria-hidden="true"></i>
            </button>
          </div>
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
    </div>
  );
}

export default ServicesTab;
