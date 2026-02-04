// Windows Service Status Codes:
// 1 = Stopped, 2 = Start Pending, 3 = Stop Pending, 4 = Running,
// 5 = Continue Pending, 6 = Pause Pending, 7 = Paused

export const getStatusString = (status) => {
  if (status === null || status === undefined) return 'unknown';
  
  const statusNum = typeof status === 'number' ? status : parseInt(status, 10);
  
  if (isNaN(statusNum)) {
    const statusStr = String(status).toLowerCase().trim();
    return statusStr;
  }
  
  switch (statusNum) {
    case 1:
      return 'stopped';
    case 2:
      return 'start pending';
    case 3:
      return 'stop pending';
    case 4:
      return 'running';
    case 5:
      return 'continue pending';
    case 6:
      return 'pause pending';
    case 7:
      return 'paused';
    default:
      return 'unknown';
  }
};

export const getStatusDisplayName = (status) => {
  const statusStr = getStatusString(status);
  switch (statusStr) {
    case 'stopped':
      return 'Stopped';
    case 'start pending':
      return 'Start Pending';
    case 'stop pending':
      return 'Stop Pending';
    case 'running':
      return 'Running';
    case 'continue pending':
      return 'Continue Pending';
    case 'pause pending':
      return 'Pause Pending';
    case 'paused':
      return 'Paused';
    default:
      return 'Unknown';
  }
};

export const getStatusColor = (status) => {
  const statusStr = getStatusString(status);
  switch (statusStr) {
    case 'running':
      return '#22c55e';
    case 'stopped':
    case 'stop pending':
      return '#ef4444';
    case 'paused':
      return '#fbbf24';
    case 'start pending':
    case 'continue pending':
    case 'pause pending':
      return '#fbbf24';
    default:
      return '#6b7280';
  }
};

export const getConnectionStatusColor = (status) => {
  if (!status || status.success === null) return '#6b7280';
  return status.success ? '#22c55e' : '#ef4444';
};

export const getConnectionStatusText = (status) => {
  if (!status || status.success === null) return 'Not Tested';
  return status.success ? 'Connected' : 'Disconnected';
};
