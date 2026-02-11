import { useState, useCallback } from 'react';

export const useDatabaseConnections = () => {
  const [dbConnections, setDbConnections] = useState([]);
  const [dbConnectionsLoading, setDbConnectionsLoading] = useState(false);
  const [dbConnectionsError, setDbConnectionsError] = useState(null);
  const [testingConnections, setTestingConnections] = useState({});

  const loadDatabaseConnections = useCallback(async () => {
    try {
      if (!window.electronAPI || !window.electronAPI.getAllDatabaseConnections) {
        setDbConnectionsError('Database connections API not available');
        return;
      }

      setDbConnectionsLoading(true);
      setDbConnectionsError(null);

      const result = await window.electronAPI.getAllDatabaseConnections();

      if (result.success) {
        setDbConnections(result.connections || []);
        await loadDatabaseConnectionStatuses();
      } else {
        setDbConnectionsError(result.error || 'Failed to load database connections');
      }
    } catch (error) {
      console.error('Error loading database connections:', error);
      setDbConnectionsError(error.message || 'Failed to load database connections');
    } finally {
      setDbConnectionsLoading(false);
    }
  }, []);

  const loadDatabaseConnectionStatuses = useCallback(async () => {
    try {
      if (!window.electronAPI || !window.electronAPI.getDatabaseConnectionStatuses) {
        return;
      }

      const result = await window.electronAPI.getDatabaseConnectionStatuses();

      if (result.success) {
        setDbConnections(prevConnections => {
          return prevConnections.map(conn => {
            const statusInfo = result.statuses.find(s => s.id === conn.id);
            return statusInfo ? { ...conn, status: statusInfo.status } : conn;
          });
        });
      }
    } catch (error) {
      console.error('Error loading database connection statuses:', error);
    }
  }, []);

  const handleTestConnection = useCallback(async (connectionId) => {
    if (!window.electronAPI || !window.electronAPI.testDatabaseConnection) {
      alert('Database connections API not available');
      return;
    }

    setTestingConnections(prev => ({ ...prev, [connectionId]: true }));

    try {
      const result = await window.electronAPI.testDatabaseConnection(connectionId);

      setDbConnections(prevConnections => 
        prevConnections.map(conn => 
          conn.id === connectionId 
            ? { ...conn, status: result }
            : conn
        )
      );

      if (!result.success) {
        alert(`Connection test failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      alert(`Failed to test connection: ${error.message || 'Unknown error'}`);
    } finally {
      setTestingConnections(prev => ({ ...prev, [connectionId]: false }));
    }
  }, []);

  const handleTestAllConnections = useCallback(async () => {
    if (!window.electronAPI || !window.electronAPI.testAllDatabaseConnections) {
      alert('Database connections API not available');
      return;
    }

    setDbConnectionsLoading(true);

    try {
      const result = await window.electronAPI.testAllDatabaseConnections();

      if (result.success) {
        await loadDatabaseConnectionStatuses();
      } else {
        alert(`Failed to test connections: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error testing all connections:', error);
      alert(`Failed to test connections: ${error.message || 'Unknown error'}`);
    } finally {
      setDbConnectionsLoading(false);
    }
  }, [loadDatabaseConnectionStatuses]);

  const handleRemoveConnection = useCallback(async (connectionId) => {
    if (!window.electronAPI || !window.electronAPI.removeDatabaseConnection) {
      alert('Database connections API not available');
      return;
    }

    if (!confirm('Are you sure you want to remove this connection?')) {
      return;
    }

    try {
      const result = await window.electronAPI.removeDatabaseConnection(connectionId);

      if (result.success) {
        await loadDatabaseConnections();
      } else {
        alert(`Failed to remove connection: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error removing connection:', error);
      alert(`Failed to remove connection: ${error.message || 'Unknown error'}`);
    }
  }, [loadDatabaseConnections]);

  const handleAddConnection = useCallback(async (connectionData) => {
    try {
      if (!window.electronAPI || !window.electronAPI.addDatabaseConnection) {
        alert('Database connections API not available');
        return false;
      }

      const result = await window.electronAPI.addDatabaseConnection(connectionData);

      if (result.success) {
        await loadDatabaseConnections();
        return true;
      } else {
        alert(`Failed to add connection: ${result.error || 'Unknown error'}`);
        return false;
      }
    } catch (error) {
      console.error('Error adding connection:', error);
      alert(`Failed to add connection: ${error.message || 'Unknown error'}`);
      return false;
    }
  }, [loadDatabaseConnections]);

  // Eaglesoft-specific functions
  const checkEaglesoftInstalled = useCallback(async () => {
    try {
      if (!window.electronAPI || !window.electronAPI.isEaglesoftInstalled) {
        return { installed: false, error: 'Eaglesoft API not available' };
      }

      const result = await window.electronAPI.isEaglesoftInstalled();
      return result;
    } catch (error) {
      console.error('Error checking Eaglesoft installation:', error);
      return { installed: false, error: error.message || 'Unknown error' };
    }
  }, []);

  const handleAddEaglesoftConnection = useCallback(async (connectionName = 'Eaglesoft Database', usePrimaryDatabase = true) => {
    try {
      if (!window.electronAPI || !window.electronAPI.addEaglesoftConnection) {
        alert('Eaglesoft API not available');
        return false;
      }

      setDbConnectionsLoading(true);
      setDbConnectionsError(null);

      const result = await window.electronAPI.addEaglesoftConnection(connectionName, usePrimaryDatabase);

      if (result.success) {
        await loadDatabaseConnections();
        return { success: true, connection: result.connection };
      } else {
        const errorMsg = result.error || 'Failed to add Eaglesoft connection';
        setDbConnectionsError(errorMsg);
        
        // Return error with hints for UI to display
        return {
          success: false,
          error: errorMsg,
          hint: result.hint || []
        };
      }
    } catch (error) {
      console.error('Error adding Eaglesoft connection:', error);
      const errorMsg = error.message || 'Failed to add Eaglesoft connection';
      setDbConnectionsError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setDbConnectionsLoading(false);
    }
  }, [loadDatabaseConnections]);

  const fetchEaglesoftCredentials = useCallback(async (usePrimaryDatabase = true) => {
    try {
      if (!window.electronAPI || !window.electronAPI.fetchEaglesoftCredentials) {
        return { success: false, error: 'Eaglesoft API not available' };
      }

      const result = await window.electronAPI.fetchEaglesoftCredentials(usePrimaryDatabase);
      return result;
    } catch (error) {
      console.error('Error fetching Eaglesoft credentials:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }, []);

  return {
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
    // Eaglesoft-specific functions
    checkEaglesoftInstalled,
    handleAddEaglesoftConnection,
    fetchEaglesoftCredentials,
  };
};
