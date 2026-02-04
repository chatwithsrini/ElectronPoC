import React, { useEffect, useState } from 'react';
import MonitoringPanel from '../MonitoringPanel';
import OverviewTab from './OverviewTab';
import DatabaseTab from './DatabaseTab';
import ServicesTab from './ServicesTab';
import ApplicationsTab from './ApplicationsTab';
import ProfileTab from './ProfileTab';

import { useDatabaseConnections } from '../../hooks/useDatabaseConnections';
import { useServices } from '../../hooks/useServices';
import { useApplications } from '../../hooks/useApplications';

function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [supportedDbTypes, setSupportedDbTypes] = useState(null);

  // Custom hooks for data management
  const {
    dbConnections,
    dbConnectionsLoading,
    dbConnectionsError,
    testingConnections,
    loadDatabaseConnections,
    loadDatabaseConnectionStatuses,
    handleTestConnection,
    handleTestAllConnections,
    handleRemoveConnection,
    handleAddConnection,
  } = useDatabaseConnections();

  const {
    services,
    servicesLoading,
    servicesError,
    actionLoading,
    loadServices,
    handleServiceAction,
  } = useServices();

  const {
    applications,
    applicationsLoading,
    applicationsError,
    applicationActionLoading,
    loadApplications,
    handleApplicationAction,
  } = useApplications();

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
    loadDatabaseConnections();
    loadSupportedDbTypes();
    loadServices();
    loadApplications();
    
    // Check connection every 30 seconds
    const dbInterval = setInterval(() => {
      loadDatabaseConnectionStatuses();
    }, 30000);

    // Refresh services every 10 seconds
    const servicesInterval = setInterval(() => {
      loadServices();
    }, 10000);

    // Refresh applications every 5 seconds
    const appsInterval = setInterval(() => {
      loadApplications();
    }, 5000);

    return () => {
      clearInterval(dbInterval);
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

  const loadSupportedDbTypes = async () => {
    try {
      if (!window.electronAPI || !window.electronAPI.getSupportedDatabaseTypes) {
        return;
      }

      const result = await window.electronAPI.getSupportedDatabaseTypes();
      if (result.success) {
        setSupportedDbTypes(result);
      }
    } catch (error) {
      console.error('Error loading supported database types:', error);
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
      onLogout();
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewTab
            user={user}
            sessionInfo={sessionInfo}
            dbConnections={dbConnections}
            services={services}
            applications={applications}
            onNavigateToTab={setActiveTab}
          />
        );

      case 'database':
        return (
          <DatabaseTab
            dbConnections={dbConnections}
            dbConnectionsLoading={dbConnectionsLoading}
            dbConnectionsError={dbConnectionsError}
            testingConnections={testingConnections}
            supportedDbTypes={supportedDbTypes}
            onRefresh={loadDatabaseConnections}
            onTestConnection={handleTestConnection}
            onTestAllConnections={handleTestAllConnections}
            onRemoveConnection={handleRemoveConnection}
            onAddConnection={handleAddConnection}
          />
        );

      case 'services':
        return (
          <ServicesTab
            services={services}
            servicesLoading={servicesLoading}
            servicesError={servicesError}
            actionLoading={actionLoading}
            onRefreshServices={loadServices}
            onServiceAction={handleServiceAction}
          />
        );

      case 'applications':
        return (
          <ApplicationsTab
            applications={applications}
            applicationsLoading={applicationsLoading}
            applicationsError={applicationsError}
            applicationActionLoading={applicationActionLoading}
            onRefresh={loadApplications}
            onApplicationAction={handleApplicationAction}
          />
        );

      case 'monitoring':
        return (
          <div className="tab-content">
            <MonitoringPanel />
          </div>
        );

      case 'profile':
        return (
          <ProfileTab
            user={user}
            sessionInfo={sessionInfo}
            onLogout={handleLogout}
          />
        );

      default:
        return null;
    }
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
          {renderTabContent()}
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
