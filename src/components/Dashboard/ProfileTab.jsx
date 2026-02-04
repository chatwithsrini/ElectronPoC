import React from 'react';

function ProfileTab({ user, sessionInfo, onLogout }) {
  return (
    <div className="tab-content">
      <div className="profile-section">
        <div className="profile-header">
          <div className="profile-avatar">
            <i className="fa-solid fa-user profile-avatar__icon" aria-hidden="true"></i>
          </div>
          <div className="profile-info">
            <h2 className="profile-info__name">{user.username}</h2>
            <p className="profile-info__role">{user.authMethod || 'User'}</p>
          </div>
        </div>

        <div className="profile-details">
          <div className="profile-detail-item">
            <span className="profile-detail-item__label">Username</span>
            <span className="profile-detail-item__value">{user.username}</span>
          </div>
          
          {user.domain && (
            <div className="profile-detail-item">
              <span className="profile-detail-item__label">Domain</span>
              <span className="profile-detail-item__value">{user.domain}</span>
            </div>
          )}
          
          <div className="profile-detail-item">
            <span className="profile-detail-item__label">Authentication Method</span>
            <span className="profile-detail-item__value">{user.authMethod || 'Local'}</span>
          </div>
          
          {sessionInfo && (
            <>
              <div className="profile-detail-item">
                <span className="profile-detail-item__label">Session Started</span>
                <span className="profile-detail-item__value">
                  {new Date(sessionInfo.authenticatedAt).toLocaleString()}
                </span>
              </div>
              
              <div className="profile-detail-item">
                <span className="profile-detail-item__label">Session Duration</span>
                <span className="profile-detail-item__value">
                  {Math.floor((Date.now() - new Date(sessionInfo.authenticatedAt)) / 60000)} minutes
                </span>
              </div>
            </>
          )}
        </div>

        <div className="profile-actions">
          <button className="profile-action-btn profile-action-btn--logout" onClick={onLogout}>
            <i className="fa-solid fa-right-from-bracket profile-action-btn__icon" aria-hidden="true"></i>
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProfileTab;
