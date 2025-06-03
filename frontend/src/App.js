import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import jwtDecode from 'jwt-decode';
import './App.css';

const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001', {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

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
  const [authStep, setAuthStep] = useState('initial'); // 'initial', 'newUser', 'login'
  const audioRef = useRef(null);

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

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      socket.emit('join', user ? user._id : null);
    });
    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });
    socket.on('reconnect', (attempt) => {
      console.log('Socket reconnected, attempt:', attempt);
    });
    socket.on('connect_error', (error) => {
      console.log('Socket connect error:', error.message);
    });

    socket.on('roomCreated', (room) => {
      console.log('Room created:', room);
      setRooms([...rooms, room]);
    });
    socket.on('playerJoined', (room) => {
      console.log('Player joined:', room);
      setRooms(rooms.map(r => r.roomId === room.roomId ? room : r));
      if (room.roomId === roomId) {
        console.log('Updating game state:', room);
        setGameState(room);
      }
    });
    socket.on('rollResult', (data) => {
      console.log('Socket event rollResult received for roomId:', data.roomId, 'current roomId:', roomId);
      if (data.roomId === roomId) {
        console.log('Roll result received and matched:', data);
        setGameState(prev => {
          const newRolls = [...(prev.rolls || []), data];
          console.log('New rolls array:', newRolls);
          return { ...prev, rolls: newRolls, currentMax: data.value, currentPlayer: data.player === prev.player1._id ? prev.player2._id : prev.player1._id };
        });
      } else {
        console.log('Roll result ignored, roomId mismatch:', data.roomId, 'vs', roomId);
      }
    });
    socket.on('gameEnded', (data) => {
      console.log('Socket event gameEnded received for roomId:', data.roomId, 'current roomId:', roomId);
      if (data.roomId === roomId) {
        console.log('Game ended received and matched:', data);
        setGameState(prev => {
          console.log('Setting game state to closed with winner:', data.winner);
          return { ...prev, status: 'closed', winner: data.winner };
        });
        console.log('Setting roomId to null');
        setRoomId(null);
      } else {
        console.log('Game ended ignored, roomId mismatch:', data.roomId, 'vs', roomId);
      }
    });
    socket.on('roomsCleared', () => {
      setRooms([]);
      if (!roomId) fetchRooms();
    });
    fetchRooms();
    checkActiveRoom();
    return () => {
      clearInterval(keepAlive);
      socket.disconnect();
    };
  }, [rooms, roomId, gameState, user]);

  const fetchRooms = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/rooms`);
      setRooms(response.data);
    } catch (error) {
      console.error('Error fetching rooms:', error.message);
    }
  };

  const checkCredentials = async () => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/check-email`, { email });
      if (!response.data.exists) {
        setAuthStep('newUser');
      } else {
        const loginResponse = await axios.post(`${process.env.REACT_APP_API_URL}/api/login`, { email, password });
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
      setAuthStep('login'); // Stay on login for retry
    }
  };

  const signup = async () => {
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/signup`, { email, password, username });
      const decoded = jwtDecode(response.data.token);
      setUser({ token: response.data.token, foxyPesos: response.data.foxyPesos, _id: decoded.userId, username });
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      if (!isPlaying) toggleAudio();
      setAuthStep('initial');
    } catch (error) {
      console.error('Error signing up:', error.message);
      setErrorMessage(error.response?.data?.error || 'Error signing up');
    }
  };

  const login = async () => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/login`, { email, password });
      const decoded = jwtDecode(response.data.token);
      const userData = await axios.get(`${process.env.REACT_APP_API_URL}/api/user`, {
        headers: { Authorization: `Bearer ${response.data.token}` }
      });
      setUser({ token: response.data.token, foxyPesos: response.data.foxyPesos, _id: decoded.userId, username: userData.data.username });
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
      console.log('Room created:', response.data);
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
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/rooms/${id}/join`);
      console.log('Joined room:', response.data);
      setRoomId(id);
      setGameState(response.data);
    } catch (error) {
      console.error('Error joining room:', error.message);
      if (user) setUser({ ...user, foxyPesos: originalFoxyPesos });
    }
  };

  const roll = async () => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/rooms/${roomId}/roll`);
      console.log('Roll response:', response.data);
      if (response.data.rollValue === 1) {
        console.log('Roll value is 1, manually checking game state');
        const updatedRoom = await axios.get(`${process.env.REACT_APP_API_URL}/api/rooms`);
        const currentRoom = updatedRoom.data.find(r => r.roomId === roomId);
        if (currentRoom && currentRoom.status === 'closed') {
          console.log('Game ended detected via fallback:', currentRoom);
          setGameState(prev => ({ ...prev, status: 'closed', winner: currentRoom.winner }));
          setRoomId(null);
        }
      }
    } catch (error) {
      console.error('Error rolling:', error.message);
    }
  };

  const clearRooms = async () => {
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/clear-rooms`);
      console.log('Rooms cleared');
    } catch (error) {
      console.error('Error clearing rooms:', error.message);
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
          <button onClick={toggleAudio} className="button">Toggle Music</button>
        </div>
      ) : (
        <>
          <p>Foxy Pesos: {user.foxyPesos} (Username: {user.username})</p>
          {errorMessage && <p className="error">{errorMessage}</p>}
          {!roomId ? (
            <>
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
            </>
          ) : (
            <div>
              <h2>Room {roomId}</h2>
              {gameState && (
                <>
                  <p>Status: {gameState.status}</p>
                  <p>Current Max: {gameState.currentMax || 'N/A'}</p>
                  <p>Current Player: {gameState.currentPlayer && user._id ? (gameState.currentPlayer._id === user._id ? 'You' : gameState.currentPlayer.username) : 'N/A'}</p>
                  {gameState.rolls && gameState.rolls.map((roll, i) => (
                    <p key={i}>{roll.player && user._id ? (roll.player._id === user._id ? 'You' : roll.player.username) : 'Unknown'} rolled: {roll.value}</p>
                  ))}
                  {gameState.status === 'active' && gameState.currentPlayer && user._id && gameState.currentPlayer._id === user._id && (
                    <button onClick={roll} className="button">Roll</button>
                  )}
                  {gameState.status === 'closed' && gameState.winner && (
                    <div>
                      <p>Game Over! Winner: {gameState.winner === user._id ? 'You' : gameState.winner.username}</p>
                      <button onClick={() => setRoomId(null)} className="button">Back to Home</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
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
              opacity: 0,
              transition: 'opacity 0.3s',
            }}
            onMouseEnter={(e) => (e.target.style.opacity = 1)}
            onMouseLeave={(e) => (e.target.style.opacity = 0)}
          >
            Clear Rooms
          </button>
          <button
            onClick={toggleAudio}
            style={{
              position: 'fixed',
              bottom: '10px',
              left: '10px',
              width: '40px',
              height: '40px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              opacity: 0,
              transition: 'opacity 0.3s',
            }}
            onMouseEnter={(e) => (e.target.style.opacity = 1)}
            onMouseLeave={(e) => (e.target.style.opacity = 0)}
          >
            {isPlaying ? '🔇' : '🎵'}
          </button>
        </>
      )}
    </div>
  );
};

export default App;
