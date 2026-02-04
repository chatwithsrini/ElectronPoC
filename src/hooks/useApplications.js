import { useState, useCallback } from 'react';

export const useApplications = () => {
  const [applications, setApplications] = useState([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState(null);
  const [applicationActionLoading, setApplicationActionLoading] = useState({});

  const loadApplications = useCallback(async () => {
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
  }, []);

  const handleApplicationAction = useCallback(async (processId, action) => {
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
  }, [loadApplications]);

  return {
    applications,
    applicationsLoading,
    applicationsError,
    applicationActionLoading,
    loadApplications,
    handleApplicationAction,
  };
};
