import React, { useEffect, useState, useRef } from 'react';
import MemoryOptimizer from './MemoryOptimizer';
import { getStatusDisplayName, getStatusColor, getConnectionStatusColor, getConnectionStatusText } from '../utils/statusHelpers';

function MonitoringPanel({
  dbConnections = [],
  dbConnectionsLoading = false,
  services = [],
  servicesLoading = false,
  applications = [],
  applicationsLoading = false,
  onRefreshDatabases = () => {},
  onRefreshServices = () => {},
  onRefreshApplications = () => {},
}) {
  const [metrics, setMetrics] = useState(null);
  const [previousMetrics, setPreviousMetrics] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeSection, setActiveSection] = useState('status'); // 'status' | 'resources'
  const metricsRef = useRef(null);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  const loadMetrics = async () => {
    try {
      if (!window.electronAPI?.getAppMetrics) {
        setError('Monitoring API not available');
        setLoading(false);
        return;
      }

      const result = await window.electronAPI.getAppMetrics();

      if (result.success) {
        const currentMetrics = result.metrics;
        const prevMetrics = metricsRef.current;

        if (prevMetrics) {
          setPreviousMetrics(prevMetrics);
          const analysisResult = await window.electronAPI.analyzeMetrics(
            currentMetrics,
            prevMetrics
          );
          if (analysisResult.success) {
            setAnalysis(analysisResult.analysis);
            if (analysisResult.analysis.alerts.length > 0) {
              setAlerts(prev => [
                ...analysisResult.analysis.alerts,
                ...prev,
              ].slice(0, 10));
            }
          }
        }

        setMetrics(currentMetrics);
        setHistory(prev => [
          ...prev,
          {
            timestamp: currentMetrics.timestamp,
            appSizeMB: parseFloat(currentMetrics.diskUsage.appSizeMB),
            memoryPercent: parseFloat(currentMetrics.memory.usedMemoryPercent),
            processMemoryMB: parseFloat(currentMetrics.process.memoryUsageMB),
          }
        ].slice(-20));
        setError(null);
      } else {
        setError(result.error || 'Failed to load metrics');
      }
    } catch (err) {
      console.error('Error loading metrics:', err);
      setError(err.message || 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    let interval;
    if (autoRefresh) {
      interval = setInterval(loadMetrics, 30000);
    }
    return () => interval && clearInterval(interval);
  }, [autoRefresh]);

  const dismissAlert = (index) => {
    setAlerts(prev => prev.filter((_, i) => i !== index));
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case 'scale-up':
      case 'memory-high':
      case 'process-memory-high':
        return 'fa-triangle-exclamation';
      case 'scale-down':
      case 'memory-low':
        return 'fa-circle-info';
      default:
        return 'fa-chart-simple';
    }
  };

  const getResourceStatusColor = (percent) => {
    if (percent > 85) return '#ef4444';
    if (percent > 70) return '#fbbf24';
    return '#22c55e';
  };

  const getTrendIcon = (change) => {
    const changeNum = parseFloat(change);
    if (changeNum > 0.1) return 'fa-arrow-trend-up';
    if (changeNum < -0.1) return 'fa-arrow-trend-down';
    return 'fa-minus';
  };

  const isServiceRunning = (service) => {
    const statusNum = typeof service.status === 'number' ? service.status : parseInt(service.status, 10);
    return statusNum === 4;
  };

  const connectedDatabases = dbConnections.filter(conn => conn.status?.success === true).length;
  const totalDatabases = dbConnections.length;

  // Filter to DentalXChange services only (name or displayName starts with "Dental")
  const dentalServices = services.filter((svc) => {
    const name = (svc.name || '').trim();
    const displayName = (svc.displayName || '').trim();
    return name.toLowerCase().startsWith('dental') || displayName.toLowerCase().startsWith('dental');
  });
  const runningServices = dentalServices.filter(s => isServiceRunning(s)).length;
  const totalServices = dentalServices.length;

  if (loading && !metrics) {
    return (
      <div className="monitoring-panel">
        <div className="monitoring-panel__loading">
          <span>Loading monitoring data...</span>
        </div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="monitoring-panel">
        <div className="monitoring-panel__error">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="monitoring-panel">
      <div className="monitoring-panel__header">
        <h2 className="monitoring-panel__title">System Monitoring</h2>
        <div className="monitoring-panel__controls">
          <label className="monitoring-panel__toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh (30s)</span>
          </label>
          <button
            className="monitoring-panel__refresh"
            onClick={loadMetrics}
            disabled={loading}
            title="Refresh system metrics"
          >
            <i className={`fa-solid fa-rotate ${loading ? 'fa-spin' : ''}`} aria-hidden="true"></i>
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="monitoring-panel__tabs">
        <button
          className={`monitoring-panel__tab ${activeSection === 'status' ? 'monitoring-panel__tab--active' : ''}`}
          onClick={() => setActiveSection('status')}
        >
          <i className="fa-solid fa-signal" aria-hidden="true"></i>
          Application Status
        </button>
        <button
          className={`monitoring-panel__tab ${activeSection === 'resources' ? 'monitoring-panel__tab--active' : ''}`}
          onClick={() => setActiveSection('resources')}
        >
          <i className="fa-solid fa-gauge-high" aria-hidden="true"></i>
          System Resources
        </button>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="monitoring-panel__alerts">
          {alerts.map((alert, index) => (
            <div
              key={index}
              className={`monitoring-alert monitoring-alert--${alert.severity}`}
            >
              <i className={`fa-solid ${getAlertIcon(alert.type)} monitoring-alert__icon`} aria-hidden="true"></i>
              <span className="monitoring-alert__message">{alert.message}</span>
              <button
                className="monitoring-alert__dismiss"
                onClick={() => dismissAlert(index)}
                title="Dismiss alert"
              >
                <i className="fa-solid fa-times" aria-hidden="true"></i>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Live Application Status - Redesigned */}
      {activeSection === 'status' && (
        <div className="live-status">
          <div className="live-status__header">
            <div className="live-status__header-content">
              <span className="live-status__badge">LIVE</span>
              <h3 className="live-status__title">Application Status</h3>
            </div>
            <span className="live-status__refresh-info">DB 60s · Services 30s · Apps 30s</span>
          </div>

          <div className="live-status__grid">
            {/* Database Connections */}
            <div
              className="live-status__panel live-status__panel--db"
              data-status={totalDatabases > 0 ? (connectedDatabases === totalDatabases ? 'ok' : 'warning') : 'idle'}
            >
              <div className="live-status__panel-accent"></div>
              <div className="live-status__panel-header">
                <div className="live-status__panel-icon">
                  <i className="fa-solid fa-plug" aria-hidden="true"></i>
                </div>
                <div className="live-status__panel-title-wrap">
                  <span className="live-status__panel-title">Database Connections</span>
                  <button
                    className="live-status__panel-refresh"
                    onClick={onRefreshDatabases}
                    disabled={dbConnectionsLoading}
                    title="Refresh"
                  >
                    <i className={`fa-solid fa-arrows-rotate ${dbConnectionsLoading ? 'fa-spin' : ''}`} aria-hidden="true"></i>
                  </button>
                </div>
              </div>
              <div className="live-status__panel-metric">
                {dbConnectionsLoading && dbConnections.length === 0 ? (
                  <span className="live-status__loading">Checking...</span>
                ) : (
                  <>
                    <span className="live-status__metric-value">
                      {totalDatabases > 0 ? `${connectedDatabases}/${totalDatabases}` : '—'}
                    </span>
                    <span className="live-status__metric-label">Connected</span>
                  </>
                )}
              </div>
              {dbConnections.length > 0 && (
                <ul className="live-status__list">
                  {dbConnections.map((conn) => (
                    <li key={conn.id} className="live-status__item" title={conn.name}>
                      <span
                        className="live-status__item-indicator"
                        style={{ backgroundColor: getConnectionStatusColor(conn.status) }}
                      ></span>
                      <span className="live-status__item-name">{conn.name}</span>
                      <span
                        className="live-status__item-tag"
                        style={{
                          color: getConnectionStatusColor(conn.status),
                          borderColor: getConnectionStatusColor(conn.status),
                        }}
                      >
                        {getConnectionStatusText(conn.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* DentalXChange Services */}
            <div
              className="live-status__panel live-status__panel--svc"
              data-status={totalServices > 0 ? (runningServices > 0 ? 'ok' : 'error') : 'idle'}
            >
              <div className="live-status__panel-accent"></div>
              <div className="live-status__panel-header">
                <div className="live-status__panel-icon">
                  <i className="fa-solid fa-gears" aria-hidden="true"></i>
                </div>
                <div className="live-status__panel-title-wrap">
                  <span className="live-status__panel-title">DentalXChange Services</span>
                  <button
                    className="live-status__panel-refresh"
                    onClick={onRefreshServices}
                    disabled={servicesLoading}
                    title="Refresh"
                  >
                    <i className={`fa-solid fa-arrows-rotate ${servicesLoading ? 'fa-spin' : ''}`} aria-hidden="true"></i>
                  </button>
                </div>
              </div>
              <div className="live-status__panel-metric">
                {servicesLoading && dentalServices.length === 0 ? (
                  <span className="live-status__loading">Checking...</span>
                ) : (
                  <>
                    <span className="live-status__metric-value">
                      {totalServices > 0 ? `${runningServices}/${totalServices}` : '—'}
                    </span>
                    <span className="live-status__metric-label">Running</span>
                  </>
                )}
              </div>
              {dentalServices.length > 0 && (
                <ul className="live-status__list">
                  {dentalServices.slice(0, 8).map((svc) => (
                    <li key={svc.name} className="live-status__item" title={svc.displayName || svc.name}>
                      <span
                        className="live-status__item-indicator"
                        style={{ backgroundColor: getStatusColor(svc.status) }}
                      ></span>
                      <span className="live-status__item-name">{svc.displayName || svc.name}</span>
                      <span
                        className="live-status__item-tag"
                        style={{
                          color: getStatusColor(svc.status),
                          borderColor: getStatusColor(svc.status),
                        }}
                      >
                        {getStatusDisplayName(svc.status)}
                      </span>
                    </li>
                  ))}
                  {dentalServices.length > 8 && (
                    <li className="live-status__item live-status__item--more">+{dentalServices.length - 8} more</li>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Running Applications */}
          <div className="live-status__apps">
            <div className="live-status__apps-header">
              <div className="live-status__apps-icon">
                <i className="fa-solid fa-window-maximize" aria-hidden="true"></i>
              </div>
              <span className="live-status__apps-title">
                Running Applications
                {!applicationsLoading && (
                  <span className="live-status__apps-count">{applications.length}</span>
                )}
              </span>
              <button
                className="live-status__panel-refresh"
                onClick={onRefreshApplications}
                disabled={applicationsLoading}
                title="Refresh"
              >
                <i className={`fa-solid fa-arrows-rotate ${applicationsLoading ? 'fa-spin' : ''}`} aria-hidden="true"></i>
              </button>
            </div>
            {applicationsLoading && applications.length === 0 ? (
              <div className="live-status__apps-empty">Checking...</div>
            ) : applications.length === 0 ? (
              <div className="live-status__apps-empty">No applications with windows running</div>
            ) : (
              <div className="live-status__apps-strip">
                {applications.map((app) => (
                  <div key={app.id} className="live-status__app-chip" title={app.title}>
                    <span className="live-status__app-chip-dot"></span>
                    <span className="live-status__app-chip-name">{app.title}</span>
                    <span className="live-status__app-chip-meta">
                      {app.memory?.toFixed(0)} MB
                      {app.cpu > 0 && ` · ${app.cpu.toFixed(0)}s`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* System Resources Section */}
      {activeSection === 'resources' && metrics && (
        <>
          <MemoryOptimizer
            memoryPercent={parseFloat(metrics.memory.usedMemoryPercent)}
            processMemoryMB={parseFloat(metrics.process.memoryUsageMB)}
            onAction={(actionId) => console.log('Memory action:', actionId)}
          />

          <div className="monitoring-grid">
            <div className="monitoring-card">
              <div className="monitoring-card__header">
                <i className="fa-solid fa-hard-drive monitoring-card__icon" aria-hidden="true"></i>
                <span className="monitoring-card__title">Application Size</span>
              </div>
              <div className="monitoring-card__value">{metrics.diskUsage.appSizeMB} MB</div>
              {analysis?.changes.appSize && (
                <div className="monitoring-card__trend">
                  <i className={`fa-solid ${getTrendIcon(analysis.changes.appSize)} monitoring-card__trend-icon`} aria-hidden="true"></i>
                  <span className={`monitoring-card__trend-value ${parseFloat(analysis.changes.appSize) > 0 ? 'positive' : 'negative'}`}>
                    {parseFloat(analysis.changes.appSize) > 0 ? '+' : ''}{analysis.changes.appSize} MB
                  </span>
                  <span className="monitoring-card__trend-percent">({analysis.changes.appSizePercent}%)</span>
                </div>
              )}
            </div>

            <div className="monitoring-card">
              <div className="monitoring-card__header">
                <i className="fa-solid fa-microchip monitoring-card__icon" aria-hidden="true"></i>
                <span className="monitoring-card__title">System Memory</span>
              </div>
              <div className="monitoring-card__value">
                {metrics.memory.usedMemoryGB} GB / {metrics.memory.totalMemoryGB} GB
              </div>
              <div className="monitoring-card__progress">
                <div
                  className="monitoring-card__progress-bar"
                  style={{
                    width: `${metrics.memory.usedMemoryPercent}%`,
                    backgroundColor: getResourceStatusColor(parseFloat(metrics.memory.usedMemoryPercent))
                  }}
                ></div>
              </div>
              <div className="monitoring-card__label">{metrics.memory.usedMemoryPercent}% used</div>
            </div>

            <div className="monitoring-card">
              <div className="monitoring-card__header">
                <i className="fa-solid fa-bolt monitoring-card__icon" aria-hidden="true"></i>
                <span className="monitoring-card__title">Process Memory</span>
              </div>
              <div className="monitoring-card__value">{metrics.process.memoryUsageMB} MB</div>
              <div className="monitoring-card__label">Heap memory usage</div>
            </div>

            <div className="monitoring-card">
              <div className="monitoring-card__header">
                <i className="fa-solid fa-desktop monitoring-card__icon" aria-hidden="true"></i>
                <span className="monitoring-card__title">CPU</span>
              </div>
              <div className="monitoring-card__value">{metrics.cpu.cores} cores</div>
              <div className="monitoring-card__label">Load: {metrics.cpu.loadAverage[0]}</div>
            </div>

            <div className="monitoring-card">
              <div className="monitoring-card__header">
                <i className="fa-solid fa-clock monitoring-card__icon" aria-hidden="true"></i>
                <span className="monitoring-card__title">Uptime</span>
              </div>
              <div className="monitoring-card__value">{formatUptime(metrics.process.uptime)}</div>
              <div className="monitoring-card__label">PID: {metrics.process.pid}</div>
            </div>

            {analysis && (analysis.needsScaleUp || analysis.needsScaleDown) && (
              <div className="monitoring-card monitoring-card--recommendation">
                <div className="monitoring-card__header">
                  <i className={`fa-solid ${analysis.needsScaleUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} monitoring-card__icon`} aria-hidden="true"></i>
                  <span className="monitoring-card__title">Recommendation</span>
                </div>
                <div className="monitoring-card__recommendation">
                  {analysis.needsScaleUp && (
                    <div className="monitoring-card__recommendation-item">
                      <strong>Scale Up Needed</strong>
                      <p>Resource usage is increasing. Consider optimizing or scaling.</p>
                    </div>
                  )}
                  {analysis.needsScaleDown && (
                    <div className="monitoring-card__recommendation-item">
                      <strong>Scale Down Opportunity</strong>
                      <p>Resource usage has decreased. Resources can be optimized.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Resource Trends */}
          {history.length > 1 && (
            <div className="monitoring-history">
              <div className="monitoring-history__header">
                <h3 className="monitoring-history__title">Resource Trends</h3>
                <div className="monitoring-history__header-right">
                  <span
                    className="monitoring-history__status-badge"
                    style={{
                      backgroundColor: `${getResourceStatusColor(history[history.length - 1].memoryPercent)}33`,
                      color: getResourceStatusColor(history[history.length - 1].memoryPercent),
                      borderColor: getResourceStatusColor(history[history.length - 1].memoryPercent),
                    }}
                    title={`System memory: ${history[history.length - 1].memoryPercent.toFixed(1)}%`}
                  >
                    {history[history.length - 1].memoryPercent > 85
                      ? 'Critical'
                      : history[history.length - 1].memoryPercent > 70
                        ? 'Warning'
                        : 'Normal'}
                  </span>
                  <span className="monitoring-history__datapoints">{history.length} data points</span>
                </div>
              </div>
              <div className="monitoring-history__legend">
                <div className="monitoring-history__legend-item">
                  <span className="monitoring-history__legend-color" style={{ backgroundColor: '#22c55e' }}></span>
                  <span>Normal (&lt;70%)</span>
                </div>
                <div className="monitoring-history__legend-item">
                  <span className="monitoring-history__legend-color" style={{ backgroundColor: '#fbbf24' }}></span>
                  <span>Warning (70-85%)</span>
                </div>
                <div className="monitoring-history__legend-item">
                  <span className="monitoring-history__legend-color" style={{ backgroundColor: '#ef4444' }}></span>
                  <span>Critical (&gt;85%)</span>
                </div>
              </div>
              <div className="monitoring-history__charts">
                <div className="monitoring-history__chart-section">
                  <h4 className="monitoring-history__chart-title">
                    <i className="fa-solid fa-microchip monitoring-history__chart-icon" aria-hidden="true"></i>
                    System Memory Usage
                  </h4>
                  <div className="monitoring-history__chart">
                    {history.map((point, index) => {
                      const isRecent = index === history.length - 1;
                      const showLabel = index % 3 === 0 || isRecent;
                      return (
                        <div
                          key={`mem-${index}`}
                          className={`monitoring-history__bar-wrapper ${isRecent ? 'recent' : ''}`}
                        >
                          <div className="monitoring-history__bar-value">
                            {showLabel && `${point.memoryPercent.toFixed(1)}%`}
                          </div>
                          <div
                            className="monitoring-history__bar"
                            style={{
                              height: `${Math.max(point.memoryPercent, 5)}%`,
                              backgroundColor: getResourceStatusColor(point.memoryPercent),
                            }}
                            title={`Memory: ${point.memoryPercent.toFixed(1)}% at ${new Date(point.timestamp).toLocaleTimeString()}`}
                          >
                            {isRecent && <span className="monitoring-history__bar-pulse"></span>}
                          </div>
                          <div className="monitoring-history__bar-label">
                            {showLabel && formatTimeLabel(point.timestamp)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="monitoring-history__chart-section">
                  <h4 className="monitoring-history__chart-title">
                    <i className="fa-solid fa-bolt monitoring-history__chart-icon" aria-hidden="true"></i>
                    Process Memory (MB)
                  </h4>
                  <div className="monitoring-history__chart monitoring-history__chart--secondary">
                    {history.map((point, index) => {
                      const maxMemory = Math.max(...history.map(p => p.processMemoryMB));
                      const heightPercent = (point.processMemoryMB / maxMemory) * 100;
                      const isRecent = index === history.length - 1;
                      const showLabel = index % 3 === 0 || isRecent;
                      return (
                        <div
                          key={`proc-${index}`}
                          className={`monitoring-history__bar-wrapper ${isRecent ? 'recent' : ''}`}
                        >
                          <div className="monitoring-history__bar-value">
                            {showLabel && `${point.processMemoryMB.toFixed(0)}`}
                          </div>
                          <div
                            className="monitoring-history__bar monitoring-history__bar--process"
                            style={{
                              height: `${Math.max(heightPercent, 5)}%`,
                              backgroundColor: '#3b82f6',
                            }}
                            title={`Process: ${point.processMemoryMB.toFixed(1)} MB at ${new Date(point.timestamp).toLocaleTimeString()}`}
                          >
                            {isRecent && <span className="monitoring-history__bar-pulse"></span>}
                          </div>
                          <div className="monitoring-history__bar-label">
                            {showLabel && formatTimeLabel(point.timestamp)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="monitoring-history__stats">
                <div className="monitoring-history__stat">
                  <span className="monitoring-history__stat-label">Current Memory:</span>
                  <span
                    className="monitoring-history__stat-value monitoring-history__stat-value--status"
                    style={{ color: getResourceStatusColor(history[history.length - 1].memoryPercent) }}
                  >
                    {history[history.length - 1].memoryPercent.toFixed(1)}%
                    <span
                      className="monitoring-history__stat-badge"
                      style={{
                        backgroundColor: `${getResourceStatusColor(history[history.length - 1].memoryPercent)}33`,
                        color: getResourceStatusColor(history[history.length - 1].memoryPercent),
                      }}
                    >
                      {history[history.length - 1].memoryPercent > 85 ? 'Critical' : history[history.length - 1].memoryPercent > 70 ? 'Warning' : 'Normal'}
                    </span>
                  </span>
                </div>
                <div className="monitoring-history__stat">
                  <span className="monitoring-history__stat-label">Peak Memory:</span>
                  <span
                    className="monitoring-history__stat-value"
                    style={{ color: getResourceStatusColor(Math.max(...history.map(p => p.memoryPercent))) }}
                  >
                    {Math.max(...history.map(p => p.memoryPercent)).toFixed(1)}%
                  </span>
                </div>
                <div className="monitoring-history__stat">
                  <span className="monitoring-history__stat-label">Time Range:</span>
                  <span className="monitoring-history__stat-value">
                    {formatTimeRange(history[0].timestamp, history[history.length - 1].timestamp)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(' ');
}

function formatTimeLabel(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatTimeRange(startTimestamp, endTimestamp) {
  const diffMs = endTimestamp - startTimestamp;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} min`;
  const hours = Math.floor(diffMins / 60);
  const minutes = diffMins % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export default MonitoringPanel;
