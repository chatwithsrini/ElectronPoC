import { useState, useCallback } from 'react';

export const useServices = () => {
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});

  const loadServices = useCallback(async () => {
    try {
      if (!window.electronAPI) {
        setServicesError('Electron API not available');
        return;
      }

      setServicesLoading(true);
      setServicesError(null);

      const result = await window.electronAPI.getWindowsServices();

      if (result.success) {
        setServices(result.services || []);
      } else {
        setServicesError(result.error || 'Failed to load services');
      }
    } catch (error) {
      console.error('Error loading services:', error);
      setServicesError(error.message || 'Failed to load services');
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const handleServiceAction = useCallback(async (serviceName, action) => {
    if (!window.electronAPI) {
      return;
    }

    const actionKey = `${serviceName}-${action}`;
    setActionLoading(prev => ({ ...prev, [actionKey]: true }));

    try {
      let result;
      switch (action) {
        case 'start':
          result = await window.electronAPI.startService(serviceName);
          break;
        case 'stop':
          result = await window.electronAPI.stopService(serviceName);
          break;
        case 'restart':
          result = await window.electronAPI.restartService(serviceName);
          break;
        default:
          return;
      }

      if (result.success) {
        await loadServices();
      } else {
        alert(`Failed to ${action} service: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Error ${action}ing service:`, error);
      alert(`Failed to ${action} service: ${error.message || 'Unknown error'}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  }, [loadServices]);

  return {
    services,
    servicesLoading,
    servicesError,
    actionLoading,
    loadServices,
    handleServiceAction,
  };
};
