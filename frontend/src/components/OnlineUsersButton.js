import React, { useState, useEffect } from 'react';
import axios from 'axios';

const OnlineUsersButton = () => {
  const [users, setUsers] = useState([]);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (hovered) {
      axios.get(`${process.env.REACT_APP_API_URL}/api/online-users`)
        .then(res => setUsers(res.data))
        .catch(err => console.error('Failed to load online users:', err));
    }
  }, [hovered]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        marginLeft: '10px',
        padding: '8px',
        background: '#333',
        color: 'white',
        borderRadius: '5px',
        position: 'relative',
        cursor: 'pointer',
        whiteSpace: 'nowrap'
      }}
    >
      👥 Online

      {hovered && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          background: '#222',
          border: '1px solid #555',
          padding: '10px',
          borderRadius: '5px',
          zIndex: 100,
        }}>
          <strong>Online Players:</strong>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            {users.length > 0
              ? users.map(u => <li key={u._id}>{u.username}</li>)
              : <li>No one online</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

export default OnlineUsersButton;
