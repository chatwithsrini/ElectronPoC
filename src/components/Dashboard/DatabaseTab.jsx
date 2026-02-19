import React, { useState } from 'react';
import AddConnectionModal from './AddConnectionModal';
import { getConnectionStatusColor, getConnectionStatusText } from '../../utils/statusHelpers';

function DatabaseTab({ 
  dbConnections,
  dbConnectionsLoading,
  dbConnectionsError,
  testingConnections,
  listingTablesConnections,
  supportedDbTypes,
  onRefresh,
  onTestConnection,
  onListTables,
  onTestAllConnections,
  onRemoveConnection,
  onAddConnection,
}) {
  const [showAddConnectionModal, setShowAddConnectionModal] = useState(false);
  const [tablesModal, setTablesModal] = useState(null); // { connectionName, result }

  const connectedCount = dbConnections.filter(conn => conn.status?.success === true).length;
  const totalCount = dbConnections.length;

  const getDatabaseTypeDisplayName = (type) => {
    if (!supportedDbTypes || !supportedDbTypes.typeInfo) return type;
    return supportedDbTypes.typeInfo[type]?.name || type;
  };

  const handleAddConnectionSubmit = async (connectionData) => {
    const success = await onAddConnection(connectionData);
    if (success) {
      setShowAddConnectionModal(false);
    }
  };

  const handleListTablesClick = async (connection) => {
    const result = await onListTables(connection.id);
    setTablesModal({
      connectionName: connection.name,
      result: result || { success: false, tables: [], error: 'Unknown error' },
    });
  };

  return (
    <div className="tab-content">
      <div className="services-section">
        <div className="services-section__header">
          <h2 className="services-section__title">Database Connections</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {totalCount > 0 && (
              <span style={{ 
                fontSize: '0.875rem', 
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <i className="fa-solid fa-circle-check" aria-hidden="true" style={{ color: '#22c55e' }}></i>
                {connectedCount} / {totalCount} Connected
              </span>
            )}
            <button
              className="services-section__refresh"
              onClick={onRefresh}
              disabled={dbConnectionsLoading}
              title="Refresh connections"
            >
              <i className={`fa-solid fa-rotate ${dbConnectionsLoading ? 'fa-spin' : ''}`} aria-hidden="true"></i>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="service-item__action service-item__action--start"
            onClick={() => setShowAddConnectionModal(true)}
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            <i className="fa-solid fa-plus" aria-hidden="true"></i>
            Add Connection
          </button>
          {totalCount > 0 && (
            <button
              className="service-item__action service-item__action--restart"
              onClick={onTestAllConnections}
              disabled={dbConnectionsLoading}
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              {dbConnectionsLoading ? (
                <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
              ) : (
                <i className="fa-solid fa-plug" aria-hidden="true"></i>
              )}
              Test All Connections
            </button>
          )}
        </div>

        {dbConnectionsError && (
          <div className="services-section__error">
            <span>{dbConnectionsError}</span>
          </div>
        )}

        {dbConnectionsLoading && dbConnections.length === 0 ? (
          <div className="services-section__loading">
            <span>Loading database connections...</span>
          </div>
        ) : (
          <div className="services-list">
            {dbConnections.length === 0 ? (
              <div className="services-list__empty">
                <span>No database connections configured. Click "Add Connection" to add a new connection.</span>
              </div>
            ) : (
              dbConnections.map((connection) => {
                const statusColor = getConnectionStatusColor(connection.status);
                const statusText = getConnectionStatusText(connection.status);
                const isTesting = testingConnections[connection.id];
                const isListingTables = listingTablesConnections[connection.id];

                return (
                  <div key={connection.id} className="service-item">
                    <div className="service-item__info">
                      <div className="service-item__header">
                        <span className="service-item__name">
                          <i className="fa-solid fa-database" aria-hidden="true" style={{ marginRight: '0.5rem', opacity: 0.7 }}></i>
                          {connection.name}
                        </span>
                        <span
                          className="service-item__status"
                          style={{ color: statusColor }}
                        >
                          <span
                            className="service-item__status-dot"
                            style={{ backgroundColor: statusColor }}
                          ></span>
                          {statusText}
                        </span>
                      </div>
                      <div className="service-item__details">
                        <span className="service-item__detail-label">Type:</span>
                        <span className="service-item__detail-value">{getDatabaseTypeDisplayName(connection.type)}</span>
                      </div>
                      {connection.config?.server && (
                        <div className="service-item__details">
                          <span className="service-item__detail-label">Server:</span>
                          <span className="service-item__detail-value">{connection.config.server}</span>
                        </div>
                      )}
                      {connection.config?.host && (
                        <div className="service-item__details">
                          <span className="service-item__detail-label">Host:</span>
                          <span className="service-item__detail-value">
                            {connection.config.host}:{connection.config.port || 'default'}
                          </span>
                        </div>
                      )}
                      {connection.config?.database && (
                        <div className="service-item__details">
                          <span className="service-item__detail-label">Database:</span>
                          <span className="service-item__detail-value">{connection.config.database}</span>
                        </div>
                      )}
                      {connection.status?.success && connection.status.serverInfo && (
                        <>
                          {connection.status.serverInfo.currentUser && (
                            <div className="service-item__details">
                              <span className="service-item__detail-label">User:</span>
                              <span className="service-item__detail-value">{connection.status.serverInfo.currentUser}</span>
                            </div>
                          )}
                          {connection.status.serverInfo.version && (
                            <div className="service-item__details">
                              <span className="service-item__detail-label">Version:</span>
                              <span className="service-item__detail-value" title={connection.status.serverInfo.version}>
                                {connection.status.serverInfo.version.substring(0, 50)}...
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      {connection.status?.success === false && connection.status.error && (
                        <>
                          <div className="service-item__details" style={{ color: '#ef4444' }}>
                            <span className="service-item__detail-label">Error:</span>
                            <span className="service-item__detail-value">{connection.status.error}</span>
                          </div>
                          {connection.status.hint && (
                            <div className="service-item__details" style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '0.375rem', border: '1px solid rgba(251, 191, 36, 0.3)', fontSize: '0.8rem', color: '#92400e' }}>
                              <span className="service-item__detail-label" style={{ display: 'block', marginBottom: '0.35rem', color: '#b45309' }}>
                                <i className="fa-solid fa-lightbulb" aria-hidden="true" style={{ marginRight: '0.25rem' }}></i>
                                Tips:
                              </span>
                              <ul style={{ margin: 0, paddingLeft: '1.25rem', whiteSpace: 'normal', lineHeight: 1.5 }}>
                                {(Array.isArray(connection.status.hint) ? connection.status.hint : [connection.status.hint]).map((line, i) => (
                                  <li key={i} style={{ marginBottom: '0.25rem' }}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                      {connection.lastTested && (
                        <div className="service-item__details">
                          <span className="service-item__detail-label">Last Tested:</span>
                          <span className="service-item__detail-value">
                            {new Date(connection.lastTested).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="service-item__actions">
                      <button
                        className="service-item__action service-item__action--start"
                        onClick={() => onTestConnection(connection.id)}
                        disabled={isTesting}
                        title="Test connection"
                      >
                        {isTesting ? (
                          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                        ) : (
                          <i className="fa-solid fa-plug" aria-hidden="true"></i>
                        )}
                        Test
                      </button>
                      <button
                        className="service-item__action service-item__action--restart"
                        onClick={() => handleListTablesClick(connection)}
                        disabled={isListingTables || connection.status?.success !== true}
                        title={connection.status?.success === true ? "List all user-defined tables" : "Test connection first"}
                      >
                        {isListingTables ? (
                          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                        ) : (
                          <i className="fa-solid fa-list" aria-hidden="true"></i>
                        )}
                        List All Tables
                      </button>
                      <button
                        className="service-item__action service-item__action--stop"
                        onClick={() => onRemoveConnection(connection.id)}
                        title="Remove connection"
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true"></i>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Add Connection Modal */}
      {showAddConnectionModal && (
        <AddConnectionModal
          supportedDbTypes={supportedDbTypes}
          onClose={() => setShowAddConnectionModal(false)}
          onAdd={handleAddConnectionSubmit}
        />
      )}

      {/* Tables List Modal */}
      {tablesModal && (
        <div className="modal-overlay" onClick={() => setTablesModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '32rem', maxHeight: '80vh' }}>
            <div className="modal-header">
              <h3 className="modal-title">User-Defined Tables — {tablesModal.connectionName}</h3>
              <button className="modal-close" onClick={() => setTablesModal(null)}>
                <i className="fa-solid fa-times" aria-hidden="true"></i>
              </button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', maxHeight: '50vh' }}>
              {tablesModal.result.success ? (
                tablesModal.result.tables && tablesModal.result.tables.length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {tablesModal.result.tables.map((t, i) => (
                      <li key={i} style={{ padding: '0.35rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                        {t.schema ? (
                          <span><span style={{ color: '#94a3b8' }}>{t.schema}</span>.<span>{t.name}</span></span>
                        ) : (
                          <span>{t.name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ color: '#94a3b8', margin: 0 }}>No user-defined tables found.</p>
                )
              ) : (
                <p style={{ color: '#ef4444', margin: 0 }}>{tablesModal.result.error || 'Failed to list tables'}</p>
              )}
            </div>
            <div className="modal-footer">
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginRight: 'auto' }}>
                {tablesModal.result.success && tablesModal.result.tables
                  ? `${tablesModal.result.tables.length} table(s)`
                  : ''}
              </span>
              <button type="button" className="modal-btn modal-btn--secondary" onClick={() => setTablesModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DatabaseTab;
