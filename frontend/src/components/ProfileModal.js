// Handles profile image selection, border selection, username editing

import React, { useState, useEffect } from 'react';
import './ProfileModal.css'; // You'll style spacing here
import blipSound from '../assets/sounds/blip.mp3';
import saveSound from '../assets/sounds/save.mp3';

const ProfileModal = ({ userData, setUserData, onClose }) => {
  const [selectedPic, setSelectedPic] = useState(userData.profilePic);
  const [selectedBorder, setSelectedBorder] = useState(userData.borderPic);
  const [username, setUsername] = useState(userData.username);
  const [editMode, setEditMode] = useState(false);
  const [usernameChanged, setUsernameChanged] = useState(false);

  const handlePicClick = (index) => {
    if (userData.unlockedProfilePics[index] === '1') {
      playBlip();
      setSelectedPic(index);
    }
  };

  const handleBorderClick = (index) => {
    if (userData.unlockedBorderPics[index] === '1') {
      playBlip();
      setSelectedBorder(index);
    }
  };

  const handleEditUsername = () => {
    setEditMode(true);
    alert('Changing your username will cost 50 Foxy Pesos when you click Save.');
  };

  const handleSave = async () => {
    const payload = {
      profilePic: selectedPic,
      borderPic: selectedBorder,
      username: username,
      deductFoxyPesos: usernameChanged ? 50 : 0,
    };

    try {
      const res = await fetch('/api/saveProfile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        playSave();
        const updated = await res.json();
        setUserData(updated);
        onClose();
      } else {
        alert('Failed to save.');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving profile.');
    }
  };

  const playBlip = () => {
    if (userData.soundOn) new Audio(blipSound).play();
  };

  const playSave = () => {
    if (userData.soundOn) new Audio(saveSound).play();
  };

  return (
    <div className="profile-modal">
      <div className="profile-header">
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setUsernameChanged(true);
          }}
          disabled={!editMode}
        />
        <button onClick={handleEditUsername}>Edit Username</button>
      </div>

      <div className="profile-selection">
        <div className="pics">
          <p>PROFILE PICS</p>
          <div className="grid">
            {[...Array(7)].map((_, i) => (
              <img
                key={i}
                src={`/assets/profile_pics/${i + 1}.png`}
                onClick={() => handlePicClick(i)}
                className={selectedPic === i ? 'selected' : ''}
                title={userData.unlockedProfilePics[i] === '1' ? '' : 'Unlock this by...'}
              />
            ))}
          </div>
        </div>
        <div className="borders">
          <p>BORDER PICS</p>
          <div className="grid">
            {[...Array(3)].map((_, i) => (
              <img
                key={i}
                src={`/assets/border_pics/${i + 1}.png`}
                onClick={() => handleBorderClick(i)}
                className={selectedBorder === i ? 'selected' : ''}
                title={userData.unlockedBorderPics[i] === '1' ? '' : 'Unlock this by...'}
              />
            ))}
          </div>
        </div>
      </div>

      <button className="save-btn" onClick={handleSave}>SAVE</button>
    </div>
  );
};

export default ProfileModal;
