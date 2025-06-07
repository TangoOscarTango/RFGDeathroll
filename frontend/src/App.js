import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import jwtDecode from 'jwt-decode';
import './App.css';

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
  const audioRef = useRef(null);

const socket = useRef(null);

  useEffect(() => {
    socket.current = io(process.env.REACT_APP_API_URL);

    socket.current.on('room_update', (data) => {
      console.log('Room update received:', data);
      setGameState((prev) => ({ ...prev, ...data }));
    });

    socket.current.on('game_over', (data) => {
      console.log('Game over received:', data);
      setGameState((prev) => ({ ...prev, winner: data.winner, rolls: data.rolls }));
    });

    return () => {
      socket.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (roomId && socket.current) {
      socket.current.emit('join_room', { roomId });
    }
  }, [roomId]);

  const handleRoll = () => {
    console.log("ROLL BUTTON CLICKED");
    if (roomId && user?._id) {
      console.log("Emitting 'roll' with", { roomId, userId: user._id });
      socket.current.emit('roll', { roomId, userId: user._id });
    } else {
      console.log("Roll failed: Missing roomId or user._id", { roomId, user });
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
      setUser({ token: response.data.token, foxyPesos: response.data.foxyPesos, _id: decoded.userId, username });
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

  const roll = async () => {
    try {
      const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001');
      socket.on('connect', () => {
        console.log('Socket connected for roll:', socket.id);
        socket.emit('join', user._id);
      });
      socket.on('rollResult', (data) => {
        console.log('Roll result signal received:', data);
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
        console.log('Game ended signal received:', data);
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
        socket.disconnect();
      });
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/rooms/${roomId}/roll`);
      console.log('Roll response received:', response.data);
      if (response.data.rollValue === 1) {
        console.log('Rolled a 1, manually fetching game state');
        const currentRoom = await fetchRoomStateWithRetry(roomId);
        if (currentRoom) {
          console.log('Updated room state fetched:', currentRoom);
          setGameState(currentRoom);
          if (currentRoom.status === 'closed') {
            console.log('Game ended detected via fallback:', currentRoom);
            setTimeout(() => setRoomId(null), 100);
          }
        } else {
          console.error('Failed to fetch updated room state after retries');
        }
        socket.disconnect();
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
                  {gameState.status === 'active' && gameState.currentPlayer && user._id && (
                    (() => {
                      const currentPlayerId = typeof gameState.currentPlayer === 'object'
                        ? gameState.currentPlayer._id
                        : gameState.currentPlayer;

                        //console.log("DEBUG: user._id =", user._id);
                        //console.log("DEBUG: currentPlayer =", gameState.currentPlayer);
                        //console.log("DEBUG: interpreted currentPlayerId =", currentPlayerId);
                        //console.log("DEBUG: currentPlayerId === user._id ?", currentPlayerId === user._id);
                      
                      return currentPlayerId === user._id ? (
                        <button onClick={handleRoll} className="button">Roll</button>
                      ) : null;
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
