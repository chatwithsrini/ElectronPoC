import React, { useState } from 'react';

function MemoryOptimizer({ memoryPercent, processMemoryMB, onAction }) {
  const [expanding, setExpanding] = useState(false);

  const getMemoryLevel = () => {
    if (memoryPercent > 85) return 'critical';
    if (memoryPercent > 70) return 'warning';
    return 'normal';
  };

  const getRecommendations = () => {
    const level = getMemoryLevel();
    const recommendations = [];

    if (level === 'critical') {
      recommendations.push({
        id: 1,
        icon: 'fa-circle-exclamation',
        title: 'Critical: Immediate Action Required',
        description: 'System memory is critically high (>85%). Take action now to prevent slowdowns.',
        actions: [
          { id: 'close-apps', label: 'Close Unused Applications', type: 'manual' },
          { id: 'restart-services', label: 'Restart Heavy Services', type: 'action' },
          { id: 'clear-cache', label: 'Clear System Cache', type: 'action' },
        ],
        priority: 'high'
      });
    } else if (level === 'warning') {
      recommendations.push({
        id: 2,
        icon: 'fa-triangle-exclamation',
        title: 'Warning: Memory Usage High',
        description: 'System memory is elevated (70-85%). Consider optimization.',
        actions: [
          { id: 'review-apps', label: 'Review Running Applications', type: 'manual' },
          { id: 'optimize-services', label: 'Optimize Services', type: 'action' },
        ],
        priority: 'medium'
      });
    }

    // Process-specific recommendations
    if (processMemoryMB > 500) {
      recommendations.push({
        id: 3,
        icon: 'fa-bolt',
        title: 'High Process Memory Usage',
        description: `This application is using ${processMemoryMB.toFixed(2)} MB. Consider optimization.`,
        actions: [
          { id: 'reload-app', label: 'Reload Application', type: 'action' },
          { id: 'close-tabs', label: 'Close Unused Tabs/Windows', type: 'manual' },
        ],
        priority: 'medium'
      });
    }

    // General recommendations always shown
    recommendations.push({
      id: 4,
      icon: 'fa-lightbulb',
      title: 'Memory Optimization Tips',
      description: 'General best practices for maintaining optimal memory usage.',
      actions: [
        { id: 'tips', label: 'View Optimization Tips', type: 'info' },
      ],
      priority: 'low'
    });

    return recommendations;
  };

  const handleAction = async (actionId, recommendation) => {
    if (onAction) {
      onAction(actionId, recommendation);
    }

    switch (actionId) {
      case 'close-apps':
        alert('💡 Tip:\n\n1. Press Ctrl+Shift+Esc to open Task Manager\n2. Go to "Processes" tab\n3. Sort by "Memory" column\n4. Right-click and "End Task" on unused applications');
        break;

      case 'restart-services':
        if (confirm('This will navigate to the Services tab. Continue?')) {
          // Could implement navigation or service restart logic
          alert('Navigate to the Services tab to restart heavy services.');
        }
        break;

      case 'clear-cache':
        if (confirm('Clear system cache? This is safe but requires administrator privileges.')) {
          alert('💡 To clear cache:\n\n1. Open Command Prompt as Administrator\n2. Run: ipconfig /flushdns\n3. Run: cleanmgr\n4. Select drive and click OK');
        }
        break;

      case 'reload-app':
        if (confirm('Reload the application? Any unsaved work will be lost.')) {
          window.location.reload();
        }
        break;

      case 'review-apps':
        alert('💡 Review Running Applications:\n\n1. Check Task Manager (Ctrl+Shift+Esc)\n2. Identify memory-heavy applications\n3. Close unnecessary background apps\n4. Disable startup programs');
        break;

      case 'optimize-services':
        alert('💡 Service Optimization:\n\n1. Go to Services tab\n2. Stop non-essential services\n3. Change startup type to "Manual" for rarely used services\n4. Monitor service memory usage');
        break;

      case 'close-tabs':
        alert('💡 Reduce Application Memory:\n\n1. Close unused browser tabs\n2. Close unnecessary documents\n3. Exit unused features\n4. Clear application cache');
        break;

      case 'tips':
        setExpanding(!expanding);
        break;

      default:
        break;
    }
  };

  const recommendations = getRecommendations();
  const level = getMemoryLevel();

  if (level === 'normal' && !expanding) {
    return null; // Don't show optimizer when memory is normal
  }

  return (
    <div className={`memory-optimizer memory-optimizer--${level}`}>
      <div className="memory-optimizer__header">
        <h3 className="memory-optimizer__title">
          {level === 'critical' && <><i className="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Memory Optimization Required</>}
          {level === 'warning' && <><i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Memory Optimization Recommended</>}
          {level === 'normal' && <><i className="fa-solid fa-lightbulb" aria-hidden="true"></i> Memory Management</>}
        </h3>
        <div className="memory-optimizer__status">
          <span className="memory-optimizer__status-label">Current Usage:</span>
          <span className={`memory-optimizer__status-value memory-optimizer__status-value--${level}`}>
            {memoryPercent}%
          </span>
        </div>
      </div>

      <div className="memory-optimizer__recommendations">
        {recommendations.map((rec) => (
          <div 
            key={rec.id} 
            className={`memory-optimizer__card memory-optimizer__card--${rec.priority}`}
          >
            <div className="memory-optimizer__card-header">
              <i className={`fa-solid ${rec.icon} memory-optimizer__card-icon`} aria-hidden="true"></i>
              <div className="memory-optimizer__card-info">
                <h4 className="memory-optimizer__card-title">{rec.title}</h4>
                <p className="memory-optimizer__card-description">{rec.description}</p>
              </div>
            </div>

            {(rec.id !== 4 || expanding) && (
              <div className="memory-optimizer__card-actions">
                {rec.actions.map((action) => (
                  <button
                    key={action.id}
                    className={`memory-optimizer__action memory-optimizer__action--${action.type}`}
                    onClick={() => handleAction(action.id, rec)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {rec.id === 4 && expanding && (
              <div className="memory-optimizer__tips">
                <div className="memory-optimizer__tip">
                  <span className="memory-optimizer__tip-num">1</span>
                  <div className="memory-optimizer__tip-content">
                    <strong>Monitor Regularly</strong>
                    <p>Check memory usage periodically to catch issues early.</p>
                  </div>
                </div>
                <div className="memory-optimizer__tip">
                  <span className="memory-optimizer__tip-num">2</span>
                  <div className="memory-optimizer__tip-content">
                    <strong>Close Unused Applications</strong>
                    <p>Applications running in the background consume memory even when not in use.</p>
                  </div>
                </div>
                <div className="memory-optimizer__tip">
                  <span className="memory-optimizer__tip-num">3</span>
                  <div className="memory-optimizer__tip-content">
                    <strong>Restart Services</strong>
                    <p>Some services accumulate memory over time. Restarting can free up memory.</p>
                  </div>
                </div>
                <div className="memory-optimizer__tip">
                  <span className="memory-optimizer__tip-num">4</span>
                  <div className="memory-optimizer__tip-content">
                    <strong>Upgrade RAM</strong>
                    <p>If memory usage is consistently high, consider adding more physical RAM.</p>
                  </div>
                </div>
                <div className="memory-optimizer__tip">
                  <span className="memory-optimizer__tip-num">5</span>
                  <div className="memory-optimizer__tip-content">
                    <strong>Use Task Manager</strong>
                    <p>Windows Task Manager (Ctrl+Shift+Esc) shows which apps use the most memory.</p>
                  </div>
                </div>
                <div className="memory-optimizer__tip">
                  <span className="memory-optimizer__tip-num">6</span>
                  <div className="memory-optimizer__tip-content">
                    <strong>Disable Startup Programs</strong>
                    <p>Reduce memory load by preventing unnecessary programs from starting with Windows.</p>
                  </div>
                </div>
                <div className="memory-optimizer__tip">
                  <span className="memory-optimizer__tip-num">7</span>
                  <div className="memory-optimizer__tip-content">
                    <strong>Clear Cache Regularly</strong>
                    <p>Browser cache, temp files, and system cache can accumulate and use memory.</p>
                  </div>
                </div>
                <div className="memory-optimizer__tip">
                  <span className="memory-optimizer__tip-num">8</span>
                  <div className="memory-optimizer__tip-content">
                    <strong>Update Software</strong>
                    <p>Software updates often include memory optimization and leak fixes.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {level === 'normal' && (
        <button
          className="memory-optimizer__close"
          onClick={() => setExpanding(false)}
        >
          Close Tips
        </button>
      )}
    </div>
  );
}

export default MemoryOptimizer;
