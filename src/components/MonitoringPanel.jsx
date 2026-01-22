import React, { useEffect, useState } from 'react';
import MemoryOptimizer from './MemoryOptimizer';

function MonitoringPanel() {
  const [metrics, setMetrics] = useState(null);
  const [previousMetrics, setPreviousMetrics] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadMetrics();

    let interval;
    if (autoRefresh) {
      // Refresh metrics every 30 seconds
      interval = setInterval(() => {
        loadMetrics();
      }, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

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
        
        // Store previous metrics before updating
        if (metrics) {
          setPreviousMetrics(metrics);
          
          // Analyze changes
          const analysisResult = await window.electronAPI.analyzeMetrics(
            currentMetrics,
            metrics
          );
          
          if (analysisResult.success) {
            setAnalysis(analysisResult.analysis);
            
            // Add new alerts
            if (analysisResult.analysis.alerts.length > 0) {
              setAlerts(prev => [
                ...analysisResult.analysis.alerts,
                ...prev,
              ].slice(0, 10)); // Keep only last 10 alerts
            }
          }
        }

        setMetrics(currentMetrics);
        
        // Update history (keep last 20 data points)
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

  const getStatusColor = (percent) => {
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
            <span>Auto-refresh</span>
          </label>
          <button
            className="monitoring-panel__refresh"
            onClick={loadMetrics}
            disabled={loading}
            title="Refresh metrics"
          >
            <i className={`fa-solid fa-rotate ${loading ? 'fa-spin' : ''}`} aria-hidden="true"></i>
          </button>
        </div>
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

      {/* Memory Optimizer - Shows recommendations when memory is high */}
      {metrics && (
        <MemoryOptimizer
          memoryPercent={parseFloat(metrics.memory.usedMemoryPercent)}
          processMemoryMB={parseFloat(metrics.process.memoryUsageMB)}
          onAction={(actionId) => console.log('Memory action:', actionId)}
        />
      )}

      {/* Metrics Grid */}
      {metrics && (
        <div className="monitoring-grid">
          {/* Application Size */}
          <div className="monitoring-card">
            <div className="monitoring-card__header">
              <i className="fa-solid fa-hard-drive monitoring-card__icon" aria-hidden="true"></i>
              <span className="monitoring-card__title">Application Size</span>
            </div>
            <div className="monitoring-card__value">
              {metrics.diskUsage.appSizeMB} MB
            </div>
            {analysis?.changes.appSize && (
              <div className="monitoring-card__trend">
                <i className={`fa-solid ${getTrendIcon(analysis.changes.appSize)} monitoring-card__trend-icon`} aria-hidden="true"></i>
                <span className={`monitoring-card__trend-value ${
                  parseFloat(analysis.changes.appSize) > 0 ? 'positive' : 'negative'
                }`}>
                  {parseFloat(analysis.changes.appSize) > 0 ? '+' : ''}
                  {analysis.changes.appSize} MB
                </span>
                <span className="monitoring-card__trend-percent">
                  ({analysis.changes.appSizePercent}%)
                </span>
              </div>
            )}
          </div>

          {/* System Memory */}
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
                  backgroundColor: getStatusColor(parseFloat(metrics.memory.usedMemoryPercent))
                }}
              ></div>
            </div>
            <div className="monitoring-card__label">
              {metrics.memory.usedMemoryPercent}% used
            </div>
          </div>

          {/* Process Memory */}
          <div className="monitoring-card">
            <div className="monitoring-card__header">
              <i className="fa-solid fa-bolt monitoring-card__icon" aria-hidden="true"></i>
              <span className="monitoring-card__title">Process Memory</span>
            </div>
            <div className="monitoring-card__value">
              {metrics.process.memoryUsageMB} MB
            </div>
            <div className="monitoring-card__label">
              Heap memory usage
            </div>
          </div>

          {/* CPU Information */}
          <div className="monitoring-card">
            <div className="monitoring-card__header">
              <i className="fa-solid fa-desktop monitoring-card__icon" aria-hidden="true"></i>
              <span className="monitoring-card__title">CPU</span>
            </div>
            <div className="monitoring-card__value">
              {metrics.cpu.cores} cores
            </div>
            <div className="monitoring-card__label">
              Load: {metrics.cpu.loadAverage[0]}
            </div>
          </div>

          {/* Uptime */}
          <div className="monitoring-card">
            <div className="monitoring-card__header">
              <i className="fa-solid fa-clock monitoring-card__icon" aria-hidden="true"></i>
              <span className="monitoring-card__title">Uptime</span>
            </div>
            <div className="monitoring-card__value">
              {formatUptime(metrics.process.uptime)}
            </div>
            <div className="monitoring-card__label">
              PID: {metrics.process.pid}
            </div>
          </div>

          {/* Scale Recommendation */}
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
      )}

      {/* History Chart (Enhanced Visualization with Clear Information) */}
      {history.length > 1 && (
        <div className="monitoring-history">
          <div className="monitoring-history__header">
            <h3 className="monitoring-history__title">Resource Trends</h3>
            <div className="monitoring-history__info">
              <span className="monitoring-history__datapoints">
                {history.length} data points
              </span>
            </div>
          </div>

          {/* Legend */}
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

          {/* Chart with multiple metrics */}
          <div className="monitoring-history__charts">
            {/* System Memory Chart */}
            <div className="monitoring-history__chart-section">
              <h4 className="monitoring-history__chart-title">
                <i className="fa-solid fa-microchip monitoring-history__chart-icon" aria-hidden="true"></i>
                System Memory Usage
              </h4>
              <div className="monitoring-history__chart">
                {history.map((point, index) => {
                  const isRecent = index === history.length - 1;
                  const showLabel = index % 3 === 0 || isRecent; // Show every 3rd label + last
                  
                  return (
                    <div
                      key={`mem-${index}`}
                      className={`monitoring-history__bar-wrapper ${isRecent ? 'recent' : ''}`}
                    >
                      {/* Value label above bar */}
                      <div className="monitoring-history__bar-value">
                        {showLabel && `${point.memoryPercent.toFixed(1)}%`}
                      </div>
                      
                      {/* Bar */}
                      <div
                        className="monitoring-history__bar"
                        style={{
                          height: `${Math.max(point.memoryPercent, 5)}%`,
                          backgroundColor: getStatusColor(point.memoryPercent),
                        }}
                        title={`Memory: ${point.memoryPercent.toFixed(1)}% at ${new Date(point.timestamp).toLocaleTimeString()}`}
                      >
                        {isRecent && <span className="monitoring-history__bar-pulse"></span>}
                      </div>
                      
                      {/* Time label below bar */}
                      <div className="monitoring-history__bar-label">
                        {showLabel && formatTimeLabel(point.timestamp)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Process Memory Chart */}
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
                      {/* Value label above bar */}
                      <div className="monitoring-history__bar-value">
                        {showLabel && `${point.processMemoryMB.toFixed(0)}`}
                      </div>
                      
                      {/* Bar */}
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
                      
                      {/* Time label below bar */}
                      <div className="monitoring-history__bar-label">
                        {showLabel && formatTimeLabel(point.timestamp)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* App Size Chart */}
            <div className="monitoring-history__chart-section">
              <h4 className="monitoring-history__chart-title">
                <i className="fa-solid fa-hard-drive monitoring-history__chart-icon" aria-hidden="true"></i>
                Application Size (MB)
              </h4>
              <div className="monitoring-history__chart monitoring-history__chart--secondary">
                {history.map((point, index) => {
                  const maxSize = Math.max(...history.map(p => p.appSizeMB));
                  const minSize = Math.min(...history.map(p => p.appSizeMB));
                  const range = maxSize - minSize || 1;
                  const heightPercent = ((point.appSizeMB - minSize) / range) * 80 + 20;
                  const isRecent = index === history.length - 1;
                  const showLabel = index % 3 === 0 || isRecent;
                  
                  return (
                    <div
                      key={`app-${index}`}
                      className={`monitoring-history__bar-wrapper ${isRecent ? 'recent' : ''}`}
                    >
                      {/* Value label above bar */}
                      <div className="monitoring-history__bar-value">
                        {showLabel && `${point.appSizeMB.toFixed(1)}`}
                      </div>
                      
                      {/* Bar */}
                      <div
                        className="monitoring-history__bar monitoring-history__bar--app"
                        style={{
                          height: `${Math.max(heightPercent, 5)}%`,
                          backgroundColor: '#8b5cf6',
                        }}
                        title={`App Size: ${point.appSizeMB.toFixed(1)} MB at ${new Date(point.timestamp).toLocaleTimeString()}`}
                      >
                        {isRecent && <span className="monitoring-history__bar-pulse"></span>}
                      </div>
                      
                      {/* Time label below bar */}
                      <div className="monitoring-history__bar-label">
                        {showLabel && formatTimeLabel(point.timestamp)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="monitoring-history__stats">
            <div className="monitoring-history__stat">
              <span className="monitoring-history__stat-label">Current Memory:</span>
              <span className="monitoring-history__stat-value" style={{ color: getStatusColor(history[history.length - 1].memoryPercent) }}>
                {history[history.length - 1].memoryPercent.toFixed(1)}%
              </span>
            </div>
            <div className="monitoring-history__stat">
              <span className="monitoring-history__stat-label">Average Memory:</span>
              <span className="monitoring-history__stat-value">
                {(history.reduce((sum, p) => sum + p.memoryPercent, 0) / history.length).toFixed(1)}%
              </span>
            </div>
            <div className="monitoring-history__stat">
              <span className="monitoring-history__stat-label">Peak Memory:</span>
              <span className="monitoring-history__stat-value" style={{ color: '#ef4444' }}>
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
  
  // Show time in HH:MM format
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatTimeRange(startTimestamp, endTimestamp) {
  const diffMs = endTimestamp - startTimestamp;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 60) {
    return `${diffMins} min`;
  }
  
  const hours = Math.floor(diffMins / 60);
  const minutes = diffMins % 60;
  
  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export default MonitoringPanel;
