import { useState, useCallback } from 'react';

export const useTestServices = () => {
  const [testServices, setTestServices] = useState([]);
  const [testServicesLoading, setTestServicesLoading] = useState(false);
  const [testServicesError, setTestServicesError] = useState(null);
  const [testServicesActionLoading, setTestServicesActionLoading] = useState({});
  const [testServicesTotalSize, setTestServicesTotalSize] = useState(null);

  const loadTestServices = useCallback(async () => {
    try {
      if (!window.electronAPI) {
        setTestServicesError('Electron API not available. Please restart the application.');
        return;
      }

      if (typeof window.electronAPI.getTestServices !== 'function' || 
          typeof window.electronAPI.getTestServicesTotalSize !== 'function') {
        setTestServicesError('Test services API not available. Please restart the Electron application.');
        return;
      }

      setTestServicesLoading(true);
      setTestServicesError(null);

      const [servicesResult, sizeResult] = await Promise.all([
        window.electronAPI.getTestServices(),
        window.electronAPI.getTestServicesTotalSize(),
      ]);

      if (servicesResult.success) {
        setTestServices(servicesResult.services || []);
      } else {
        setTestServicesError(servicesResult.error || 'Failed to load test services');
      }

      if (sizeResult.success) {
        setTestServicesTotalSize(sizeResult);
      }
    } catch (error) {
      console.error('Error loading test services:', error);
      setTestServicesError(error.message || 'Failed to load test services');
    } finally {
      setTestServicesLoading(false);
    }
  }, []);

  const handleCreateTestServices = useCallback(async () => {
    if (!window.electronAPI) {
      alert('Electron API is not available. Please restart the application.');
      return;
    }

    if (typeof window.electronAPI.createTestService !== 'function') {
      alert('Test services API is not available. Please restart the Electron application to load the updated preload script.');
      return;
    }

    setTestServicesActionLoading(prev => ({ ...prev, 'create-all': true }));

    try {
      const serviceNames = ['TestService1', 'TestService2', 'TestService3', 'TestService4', 'TestService5'];
      const sizeMB = 10;
      
      const results = await Promise.all(
        serviceNames.map(name => 
          window.electronAPI.createTestService(name, sizeMB)
        )
      );

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      if (successCount > 0) {
        await loadTestServices();
        alert(`Successfully created ${successCount} test service(s)${failCount > 0 ? `, ${failCount} failed` : ''}`);
      } else {
        alert(`Failed to create test services: ${results[0]?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating test services:', error);
      alert(`Failed to create test services: ${error.message || 'Unknown error'}`);
    } finally {
      setTestServicesActionLoading(prev => ({ ...prev, 'create-all': false }));
    }
  }, [loadTestServices]);

  const handleStopTestService = useCallback(async (serviceName) => {
    if (!window.electronAPI) {
      alert('Electron API is not available. Please restart the application.');
      return;
    }

    if (typeof window.electronAPI.stopTestService !== 'function') {
      alert('Test services API is not available. Please restart the Electron application.');
      return;
    }

    setTestServicesActionLoading(prev => ({ ...prev, [serviceName]: true }));

    try {
      const result = await window.electronAPI.stopTestService(serviceName);

      if (result.success) {
        await loadTestServices();
      } else {
        alert(`Failed to stop test service: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error stopping test service:', error);
      alert(`Failed to stop test service: ${error.message || 'Unknown error'}`);
    } finally {
      setTestServicesActionLoading(prev => ({ ...prev, [serviceName]: false }));
    }
  }, [loadTestServices]);

  const handleStopAllTestServices = useCallback(async () => {
    if (!window.electronAPI) {
      alert('Electron API is not available. Please restart the application.');
      return;
    }

    if (typeof window.electronAPI.stopAllTestServices !== 'function') {
      alert('Test services API is not available. Please restart the Electron application.');
      return;
    }

    if (!confirm('Are you sure you want to stop all test services? This will remove all test service files.')) {
      return;
    }

    setTestServicesActionLoading(prev => ({ ...prev, 'stop-all': true }));

    try {
      const result = await window.electronAPI.stopAllTestServices();

      if (result.success) {
        await loadTestServices();
        alert(result.message || 'All test services stopped successfully');
      } else {
        alert(`Failed to stop all test services: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error stopping all test services:', error);
      alert(`Failed to stop all test services: ${error.message || 'Unknown error'}`);
    } finally {
      setTestServicesActionLoading(prev => ({ ...prev, 'stop-all': false }));
    }
  }, [loadTestServices]);

  return {
    testServices,
    testServicesLoading,
    testServicesError,
    testServicesActionLoading,
    testServicesTotalSize,
    loadTestServices,
    handleCreateTestServices,
    handleStopTestService,
    handleStopAllTestServices,
  };
};
