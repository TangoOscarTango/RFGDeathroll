import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import jwtDecode from 'jwt-decode';
import './App.css';

const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001');

const App = () => {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [wager, setWager] = useState('');
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

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

    // Music fade-in
    const audio = new Audio('https://rfgdeathroll-frontend.onrender.com/Deathroll.mp3'); // Update URL as needed
    audio.loop = true;
    audio.volume = 0;
    audio.play().catch(err => console.error('Audio play failed:', err));
    let fade = setInterval(() => {
      if (audio.volume < 1) audio.volume = Math.min(1, audio.volume + 0.01); // 2-second fade (100 * 0.01s)
      else clearInterval(fade);
    }, 10);

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
      if (data.roomId === roomId) {
        console.log('Roll result received:', data);
        setGameState(prev => ({ ...prev, rolls: [...(prev.rolls || []), data], currentMax: data.value, currentPlayer: data.player === prev.player1._id ? prev.player2._id : prev.player1._id }));
      }
    });
    socket.on('gameEnded', (data) => {
      if (data.roomId === roomId) {
        console.log('Game ended received:', data);
        setGameState(prev => {
          console.log('Setting game state to closed with winner:', data.winner);
          return { ...prev, status: 'closed', winner: data.winner };
        });
        console.log('Setting roomId to null');
        setRoomId(null); // Return to home screen
      }
    });
    socket.on('roomsCleared', () => {
      setRooms([]);
      if (!roomId) fetchRooms();
    });
    fetchRooms();
    checkActiveRoom();
    return () => {
      clearInterval(fade);
      audio.pause();
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

  const signup = async () => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/signup`, { email, password });
      const decoded = jwtDecode(response.data.token);
      setUser({ token: response.data.token, foxyPesos: response.data.foxyPesos, _id: decoded.userId });
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
    } catch (error) {
      console.error('Error signing up:', error.message);
    }
  };

  const login = async () => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/login`, { email, password });
      const decoded = jwtDecode(response.data.token);
      setUser({ token: response.data.token, foxyPesos: response.data.foxyPesos, _id: decoded.userId });
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
    } catch (error) {
      console.error('Error logging in:', error.message);
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

  return (
    <div className="container">
      <h1>Death Roll</h1>
      {!user ? (
        <div className="auth-form">
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
          <div className="button-group">
            <button onClick={signup} className="button">Signup</button>
            <button onClick={login} className="button">Login</button>
          </div>
        </div>
      ) : (
        <>
          <p>Foxy Pesos: {user.foxyPesos}</p>
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
                    Room {room.roomId} - Wager: {room.wager} FP - Status: {room.status}
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
                  <p>Current Player: {gameState.currentPlayer && user._id ? (gameState.currentPlayer._id === user._id ? 'You' : 'Opponent') : 'N/A'}</p>
                  {gameState.rolls && gameState.rolls.map((roll, i) => (
                    <p key={i}>{roll.player && user._id ? (roll.player._id === user._id ? 'You' : 'Opponent') : 'Unknown'} rolled: {roll.value}</p>
                  ))}
                  {gameState.status === 'active' && gameState.currentPlayer && user._id && gameState.currentPlayer._id === user._id && (
                    <button onClick={roll} className="button">Roll</button>
                  )}
                  {gameState.status === 'closed' && gameState.winner && (
                    <div>
                      <p>Game Over! Winner: {gameState.winner === user._id ? 'You' : 'Opponent'}</p>
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
        </>
      )}
    </div>
  );
};

export default App;
