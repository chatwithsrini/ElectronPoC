const os = require('os');

/**
 * Get Windows user information
 * @returns {Object|null} User information or null if not on Windows
 */
function getWindowsUserInfo() {
  // Always return platform info, even on non-Windows
  try {
    const username = os.userInfo().username;
    const hostname = os.hostname();
    const platform = process.platform;

    if (process.platform !== 'win32') {
      // Return platform info but indicate it's not Windows
      return {
        username,
        hostname,
        platform,
        domain: '',
        domainRoamingProfile: '',
        isWindows: false,
      };
    }

    return {
      username,
      hostname,
      platform,
      domain: process.env.USERDOMAIN || '',
      domainRoamingProfile: process.env.USERDOMAIN_ROAMINGPROFILE || '',
      isWindows: true,
    };
  } catch (error) {
    console.error('Error getting user info:', error);
    return {
      platform: process.platform,
      isWindows: false,
    };
  }
}

/**
 * Authenticate using Windows Integrated Authentication (SSO)
 * Requires node-sspi package on Windows
 * @returns {Promise<Object>} Authentication result
 */
async function authenticateWithWindows() {
  if (process.platform !== 'win32') {
    return {
      success: false,
      error: 'Windows authentication is only available on Windows OS. Please use form-based login or switch to a Windows machine.',
    };
  }

  try {
    // Try to use node-sspi if available
    let sspi;
    try {
      sspi = require('node-sspi');
    } catch (err) {
      // node-sspi not available, fall back to basic Windows user info
      console.log('node-sspi not available, using basic Windows user info');
      const userInfo = getWindowsUserInfo();
      if (userInfo) {
        return {
          success: true,
          user: {
            username: userInfo.username,
            domain: userInfo.domain || userInfo.hostname,
            authMethod: 'windows-basic',
          },
        };
      }
      return {
        success: false,
        error: 'Windows authentication module not available. Install node-sspi for full SSO support.',
      };
    }

    // If node-sspi is available, use it for proper Windows authentication
    const userInfo = getWindowsUserInfo();
    if (userInfo) {
      // In a real scenario, you would use sspi to authenticate
      // For now, we'll return the user info
      // You can extend this to use sspi.authenticate() with actual credentials
      return {
        success: true,
        user: {
          username: userInfo.username,
          domain: userInfo.domain || userInfo.hostname,
          authMethod: 'windows-sso',
        },
      };
    }

    return {
      success: false,
      error: 'Unable to get Windows user information',
    };
  } catch (error) {
    console.error('Windows authentication error:', error);
    return {
      success: false,
      error: error.message || 'Windows authentication failed',
    };
  }
}

/**
 * Validate login credentials
 * In a real application, this would connect to your authentication service
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Object>} Authentication result
 */
async function validateCredentials(username, password) {
  // TODO: Replace this with actual authentication logic
  // This could connect to:
  // - Active Directory (LDAP)
  // - Windows Services API
  // - Your custom authentication service
  // - Database

  // For now, this is a placeholder that always succeeds
  // In production, you should:
  // 1. Connect to your authentication service
  // 2. Validate credentials
  // 3. Return user information on success

  return new Promise((resolve) => {
    // Simulate API call
    setTimeout(() => {
      if (username && password) {
        resolve({
          success: true,
          user: {
            username,
            authMethod: 'form',
          },
        });
      } else {
        resolve({
          success: false,
          error: 'Invalid credentials',
        });
      }
    }, 500);
  });
}

module.exports = {
  getWindowsUserInfo,
  authenticateWithWindows,
  validateCredentials,
};

