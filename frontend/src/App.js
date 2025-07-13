// frontend - App.js — Main React component for DeathRoll frontend

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import jwtDecode from 'jwt-decode';
import './App.css';
import ProfileModal from './components/ProfileModal';
import ChatPanel from './components/ChatPanel';
import OnlineUsersButton from './components/OnlineUsersButton';

const App = () => {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [wager, setWager] = useState('');
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [authStep, setAuthStep] = useState('initial');
  const [TESTING, setTESTING] = useState(true); // TESTING toggle set to true
  const [showProfileModal, setShowProfileModal] = useState(false);
  const audioRef = useRef(null);

  const socket = useRef(null);

  useEffect(() => {
    if (!user) return;

    socket.current = io(process.env.REACT_APP_API_URL, {
      auth: {
        token: user.token
      }
    });

    socket.current.on('connect', () => {
      console.log('[Socket] Connected:', socket.current.id);
    });

    socket.current.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    socket.current.on('roomCreated', (newRoom) => {
      console.log('[Socket] New room created:', newRoom);
      setRooms((prev) => {
        const exists = prev.some((room) => room.roomId === newRoom.roomId);
        return exists ? prev : [...prev, newRoom];
      });
    });

    socket.current.on('room_update', (data) => {
      console.log('Room update received:', data);
      setGameState(data); // Do not merge
    });

    socket.current.on('game_over', async (data) => {
      console.log('Game over received:', data);
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/rooms`);
        const closedRoom = response.data.find((r) => r.roomId === roomId);
        if (closedRoom) setGameState(closedRoom);
      } catch (err) {
        console.error('Error fetching room state after game_over:', err.message);
      }
    });


    return () => {
      socket.current.disconnect();
    };
  }, [user]); // <== KEY: depends on user, not []

  useEffect(() => {
    if (roomId && socket.current) {
      socket.current.emit('join_room', { roomId });
  
      // Fetch latest room state after joining
      (async () => {
        try {
          const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/rooms`);
          const joinedRoom = response.data.find((room) => room.roomId === roomId);
          if (joinedRoom) setGameState(joinedRoom);
        } catch (err) {
          console.error('Failed to fetch room after joining:', err.message);
        }
      })();
    }
  }, [roomId]);


  const handleRoll = async () => {
    try {
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/rooms/${roomId}/roll`
      );
      // Update local state immediately for snappier UX
      setGameState((prev) => ({
        ...prev,
        rolls: [...prev.rolls, { player: user._id, value: response.data.rollValue }],
        currentMax: response.data.rollValue - 1, // Reflect -1 adjustment
      }));
    } catch (err) {
      setErrorMessage('Roll failed: ' + err.message);
    }
  };

  const handleBackToHome = () => {
    if (roomId) {
      socket.current.emit('end_game', { roomId });
    }
    setIsPlaying(false);
    setRoomId(null);
    setGameState(null);
  };

  useEffect(() => {
    const checkActiveRoom = async () => {
      if (user) {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/rooms`);
        const activeRoom = response.data.find(room => room.status === 'active' && (room.player1._id === user._id || (room.player2 && room.player2._id === user._id)));
        if (activeRoom) {
          setRoomId(activeRoom.roomId);
          setGameState(activeRoom);
        }
      }
    };

    const keepAlive = setInterval(async () => {
      try {
        await axios.get(`${process.env.REACT_APP_API_URL}/api/rooms`);
        console.log('Keep-alive ping sent');
      } catch (error) {
        console.error('Keep-alive ping failed:', error.message);
      }
    }, 30000);

    fetchRooms();
    checkActiveRoom();
    return () => clearInterval(keepAlive);
  }, [user]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchRooms();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/rooms`);
      const now = new Date();
      const filtered = response.data.filter(room => {
        if (room.status !== 'closed') return true;
        const updatedAt = new Date(room.updatedAt);
        return (now - updatedAt) < 10000; // keep if under 10s old
      });
      setRooms(filtered);
    } catch (error) {
      console.error('Error fetching rooms:', error.message);
    }
  };


  const checkCredentials = async () => {
    try {
      setErrorMessage('');
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/check-email`, { email });
      console.log('Check email response received:', response.data);
      if (!response.data.exists) {
        setAuthStep('newUser');
      } else {
        const loginResponse = await axios.post(`${process.env.REACT_APP_API_URL}/api/login`, { email, password });
        console.log('Login response received:', loginResponse.data);
        const decoded = jwtDecode(loginResponse.data.token);
        const userData = await axios.get(`${process.env.REACT_APP_API_URL}/api/user`, {
          headers: { Authorization: `Bearer ${loginResponse.data.token}` }
        });
        setUser({ token: loginResponse.data.token, foxyPesos: loginResponse.data.foxyPesos, _id: decoded.userId, username: userData.data.username });
        axios.defaults.headers.common['Authorization'] = `Bearer ${loginResponse.data.token}`;
        if (!isPlaying) toggleAudio();
        setAuthStep('initial');
      }
    } catch (error) {
      console.error('Error checking credentials:', error.message);
      setErrorMessage(error.response?.data?.error || 'Error checking credentials');
      setAuthStep('login');
    }
  };

  const signup = async () => {
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }
    try {
      setErrorMessage('');
      console.log('Sending signup request:', { email, password, username });
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/signup`, { email, password, username });
      console.log('Signup response received:', response.data);
      const decoded = jwtDecode(response.data.token);
      localStorage.setItem('token', response.data.token);
      setUser({ token: response.data.token, _id: decoded.userId, username, foxyPesos: 1000, profilePic: 0, borderPic: 0, unlockedProfilePics: '1000000', unlockedBorderPics: '100', soundOn: true, musicOn: true, });
      console.log('[Auth] Setting user with token:', response.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      if (!isPlaying) toggleAudio();
      setAuthStep('initial');
    } catch (error) {
      console.error('Error during signup:', error.message);
      const errorMsg = error.response?.data?.error || 'Error signing up';
      console.log('Signup error response:', errorMsg);
      if (errorMsg.includes('Username')) {
        setErrorMessage('Username already taken, please choose another');
        setUsername('');
      } else {
        setErrorMessage(errorMsg);
      }
    }
  };

  const login = async () => {
    try {
      setErrorMessage('');
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/login`, { email, password });
      console.log('Login response received:', response.data);
      const decoded = jwtDecode(response.data.token);
      const userData = await axios.get(`${process.env.REACT_APP_API_URL}/api/user`, {
        headers: { Authorization: `Bearer ${response.data.token}` }
      });
      localStorage.setItem('token', response.data.token);
      setUser({ token: response.data.token, _id: decoded.userId, username: userData.data.username, foxyPesos: userData.data.foxyPesos, profilePic: userData.data.profilePic, borderPic: userData.data.borderPic, unlockedProfilePics: userData.data.unlockedProfilePics, unlockedBorderPics: userData.data.unlockedBorderPics, soundOn: userData.data.soundOn, musicOn: userData.data.musicOn, });
      console.log('[Auth] Setting user with token:', response.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      if (!isPlaying) toggleAudio();
      setAuthStep('initial');
    } catch (error) {
      console.error('Error logging in:', error.message);
      setErrorMessage(error.response?.data?.error || 'Error logging in');
    }
  };

  const createRoom = async () => {
    const wagerValue = parseInt(wager);
    if (isNaN(wagerValue) || wagerValue < 20) {
      setErrorMessage('Wager must be at least 20 Foxy Pesos');
      return;
    }
    const originalFoxyPesos = user ? user.foxyPesos : 0;
    try {
      console.log('Attempting to create room with wager:', wagerValue);
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/rooms`, { wager: wagerValue });
      console.log('Room created response received:', response.data);
      setRoomId(response.data.roomId);
      setGameState(response.data);
      fetchRooms();
      setErrorMessage('');
    } catch (error) {
      console.error('Error creating room:', error.message);
      setErrorMessage(error.response?.data?.error || 'Error creating room');
      if (user) setUser({ ...user, foxyPesos: originalFoxyPesos });
    }
  };

  const joinRoom = async (id) => {
    const originalFoxyPesos = user ? user.foxyPesos : 0;
    try {
      const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001');
      socket.on('connect', () => {
        console.log('Socket connected for join:', socket.id);
        socket.emit('join', user._id);
      });
      socket.on('playerJoined', (room) => {
        console.log('Player joined signal received:', room);
        setRooms(rooms.map(r => r.roomId === room.roomId ? room : r));
        if (room.roomId === id) {
          console.log('Updating game state:', room);
          setGameState(room);
        }
        socket.disconnect();
      });
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/rooms/${id}/join`);
      console.log('Join room response received:', response.data);
      setRoomId(id);
      if (socket.current && roomId) {
        socket.current.emit('join_room', { roomId });
      }
      setGameState(response.data);
    } catch (error) {
      console.error('Error joining room:', error.message);
      if (user) setUser({ ...user, foxyPesos: originalFoxyPesos });
    }
  };

  const fetchRoomStateWithRetry = async (roomId, retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/rooms`);
        const currentRoom = response.data.find(r => r.roomId === roomId);
        if (currentRoom && currentRoom.rolls && currentRoom.rolls.length > 0) {
          return currentRoom;
        }
        console.log(`Roll not found in room state, retrying (${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error) {
        console.error('Error fetching room state:', error.message);
      }
    }
    return null;
  };

  const clearRooms = async () => {
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/clear-rooms`);
      console.log('Rooms cleared');
    } catch (error) {
      console.error('Error clearing rooms:', error.message);
    }
  };

  const updateGameState = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/rooms`);
      const updatedRoom = response.data.find(r => r.roomId === roomId);
      if (updatedRoom) setGameState(updatedRoom);
    } catch (error) {
      console.error('Error updating game state:', error.message);
    }
  };
  
  const toggleAudio = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio('https://rfgdeathroll-frontend.onrender.com/Deathroll.mp3');
      audioRef.current.loop = true;
      audioRef.current.volume = 0;
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().then(() => {
        let fade = setInterval(() => {
          if (audioRef.current.volume < 1) audioRef.current.volume = Math.min(1, audioRef.current.volume + 0.01);
          else clearInterval(fade);
        }, 10);
      }).catch(err => console.error('Audio play failed:', err));
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="container">
      <h1>Death Roll</h1>
      {!user ? (
        <div className="auth-form">
          {authStep === 'initial' && (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="input"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="input"
              />
              <button onClick={checkCredentials} className="button">Submit</button>
            </>
          )}
          {authStep === 'newUser' && (
            <>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="input"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="input"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                className="input"
              />
              <div className="button-group">
                <button onClick={signup} className="button">Signup</button>
                <button onClick={() => setAuthStep('initial')} className="button">Back</button>
              </div>
            </>
          )}
          {authStep === 'login' && (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="input"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="input"
              />
              <button onClick={login} className="button">Login</button>
            </>
          )}
          {errorMessage && <p className="error">{errorMessage}</p>}
        </div>
      ) : (
        <div>
          <p>Foxy Pesos: {user.foxyPesos} (Username: {user.username})</p>
          <button className="button" onClick={() => setShowProfileModal(true)}>Edit Profile</button>
          {errorMessage && <p className="error">{errorMessage}</p>}
          {!roomId ? (
            <div>
              <div className="room-form">
                <input
                  type="number"
                  value={wager}
                  onChange={(e) => setWager(e.target.value)}
                  placeholder="Wager (min 20 FP)"
                  className="input"
                  min="20"
                />
                <button onClick={() => { console.log('Create button clicked'); createRoom(); }} className="button">Create Room</button>
              </div>
              <h2>Open Rooms</h2>
              <ul>
                {rooms.map(room => (
                  <li key={room.roomId} className="room-item">
                    Room {room.roomId} - Wager: {room.wager} FP - Status: {room.status} - Player 1: {room.player1.username}
                    {room.status === 'open' && (
                      <button onClick={() => joinRoom(room.roomId)} className="button join-button">Join</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <h2>Room {roomId}</h2>
              {gameState && (
                <div>
                  <p>Status: {gameState.status}</p>
                  <p>Current Max: {gameState.currentMax || 'N/A'}</p>
                  <p>
                    Current Player:{' '}
                    {(() => {
                      if (!gameState.currentPlayer || !user?._id) return 'N/A';
                      const playerId = typeof gameState.currentPlayer === 'object' ? gameState.currentPlayer._id : gameState.currentPlayer;
                      if (playerId === user._id) return 'You';
                      if (gameState.player1 && gameState.player1._id === playerId) return gameState.player1.username;
                      if (gameState.player2 && gameState.player2._id === playerId) return gameState.player2.username;
                      return 'Unknown';
                    })()}
                  </p>
                  {gameState.rolls && gameState.rolls.map((roll, i) => (
                    <p key={i}>{roll.player && user._id ? (roll.player._id === user._id ? 'You' : roll.player.username) : 'Unknown'} rolled: {roll.value}</p>
                  ))}
                  {gameState.status === 'active' && gameState.currentPlayer && user._id && (
                    (() => {
                      const currentPlayerId = typeof gameState.currentPlayer === 'object'
                        ? gameState.currentPlayer._id
                        : gameState.currentPlayer;
                      return (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px' }}>
                          {currentPlayerId === user._id && (
                            <button onClick={handleRoll} className="button">Roll</button>
                          )}
                          <button onClick={updateGameState} className="button">Update</button>
                        </div>

                      );
                    })()
                  )}
                  {gameState.status === 'closed' && gameState.winner && (
                    <div>
                      <p>
                        Game Over! Winner: {gameState.winner === user._id
                          ? 'You'
                          : (typeof gameState.winner === 'object' ? gameState.winner.username : 'Opponent')}
                      </p>
                      <button onClick={handleBackToHome} className="button">
                        Back to Home
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Always visible Toggle Music button */}
          <button
            onClick={toggleAudio}
            style={{
              position: 'fixed',
              bottom: '10px',
              left: '10px',
              width: '120px', // 3x the original 40px
              height: '120px', // 3x the original 40px
              background: 'linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet, red)', // Rainbow circle
              borderRadius: '25%', // Circular shape
              border: 'none',
              cursor: 'pointer',
              color: 'white',
              fontSize: '24px', // Larger text for visibility
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isPlaying ? '🔇' : '🎵'}
          </button>
          {/* Clear Rooms button, visible only if TESTING is true */}
          {TESTING && (
            <button
              onClick={clearRooms}
              style={{
                position: 'fixed',
                bottom: '10px',
                right: '10px',
                width: '40px',
                height: '40px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                opacity: 0.7,
                transition: 'opacity 0.3s',
              }}
              onMouseEnter={(e) => (e.target.style.opacity = 1)}
              onMouseLeave={(e) => (e.target.style.opacity = 0.7)}
            >
              Clear Rooms
            </button>
          )}
        </div>
      )}
      {showProfileModal && (
        <ProfileModal
          user={user}
          onClose={() => setShowProfileModal(false)}
          updateUser={(updated) => setUser((prev) => ({ ...prev, ...updated }))}
        />
      )}
      {user && socket.current && (
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <ChatPanel user={user} socket={socket.current} />
          <OnlineUsersButton />
        </div>
      )}
    </div>
  );
};

export default App;
