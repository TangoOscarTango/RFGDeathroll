import React, { useState, useEffect } from 'react';
import './ProfileModal.css';

const ProfileModal = ({ user, onClose, updateUser }) => {
  const [username, setUsername] = useState(user?.username || '');
  const [editUsername, setEditUsername] = useState(false);
  const [selectedProfilePic, setSelectedProfilePic] = useState(user?.profilePic ?? 0);
  const [selectedBorderPic, setSelectedBorderPic] = useState(user?.borderPic ?? 0);
  const [showUsernameWarning, setShowUsernameWarning] = useState(false);

  const unlockedProfilePics = user?.unlockedProfilePics ?? '1000000';
  const unlockedBorderPics = user?.unlockedBorderPics ?? '100';

  const blipSound = new Audio('/assets/sounds/blip.mp3');
  const saveSound = new Audio('/assets/sounds/save.mp3');

  useEffect(() => {
    if (!user?.soundOn) return;
    const playBlip = (e) => blipSound.play().catch(() => {});
    document.addEventListener('click', playBlip);
    return () => document.removeEventListener('click', playBlip);
  }, [user?.soundOn]);

  // ✅ Safe early return after all hooks
  if (!user) return null;

  const handleSave = async () => {
    try {
      const res = await fetch('/api/saveProfile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          username,
          profilePic: selectedProfilePic,
          borderPic: selectedBorderPic,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error saving');
      if (user.soundOn) saveSound.play().catch(() => {});
      updateUser(data);
      onClose();
    } catch (err) {
      console.error('Save failed:', err.message);
    }
  };

  return (
    <div className="profile-modal-backdrop" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-header">
          <input
            type="text"
            value={username}
            disabled={!editUsername}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button onClick={() => {
            setEditUsername(true);
            setShowUsernameWarning(true);
          }}>
            Edit Username
          </button>
        </div>
        {showUsernameWarning && (
          <p className="warning-text">Changing your username will cost 50 Foxy Pesos when you click Save.</p>
        )}

        <div className="profile-options">
          <div className="profile-column">
            <h3>PROFILE PICS</h3>
            <div className="grid">
              {[...Array(7)].map((_, i) => {
                const isUnlocked = unlockedProfilePics[i] === '1';
                return (
                  <div
                    key={i}
                    className={`pic-option ${selectedProfilePic === i ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`}
                    onClick={() => isUnlocked && setSelectedProfilePic(i)}
                    title={!isUnlocked ? 'Unlock this profile pic by... [TODO]' : ''}
                  >
                    <img src={`/assets/profile_pics/${i + 1}.png`} alt={`Profile ${i + 1}`} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-column">
            <h3>BORDER PICS</h3>
            <div className="grid">
              {[...Array(3)].map((_, i) => {
                const isUnlocked = unlockedBorderPics[i] === '1';
                return (
                  <div
                    key={i}
                    className={`pic-option ${selectedBorderPic === i ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`}
                    onClick={() => isUnlocked && setSelectedBorderPic(i)}
                    title={!isUnlocked ? 'Unlock this border by... [TODO]' : ''}
                  >
                    <img src={`/assets/border_pics/${i + 1}.png`} alt={`Border ${i + 1}`} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <button className="save-button" onClick={handleSave}>SAVE</button>
      </div>
    </div>
  );
};

export default ProfileModal;
