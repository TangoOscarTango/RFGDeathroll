import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
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

  useEffect(() => {
    socket.on('roomCreated', (room) => {
      console.log('Room created:', room);
      setRooms([...rooms, room]);
    });
    socket.on('playerJoined', (room) => {
      setRooms(rooms.map(r => r.roomId === room.roomId ? room : r));
      if (room.roomId === roomId) setGameState(room);
    });
    socket.on('rollResult', (data) => {
      if (data.roomId === roomId) setGameState({ ...gameState, rolls: [...(gameState.rolls || []), data] });
    });
    socket.on('gameEnded', (data) => {
      if (data.roomId === roomId) {
        setGameState({ ...gameState, status: 'closed', winner: data.winner });
        setRoomId(null);
      }
    });
    fetchRooms();
    return () => socket.disconnect();
  }, [rooms, roomId, gameState]);

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
      setUser({ token: response.data.token, foxyPesos: response.data.foxyPesos });
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
    } catch (error) {
      console.error('Error signing up:', error.message);
    }
  };

  const login = async () => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/login`, { email, password });
      setUser({ token: response.data.token, foxyPesos: response.data.foxyPesos });
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
    } catch (error) {
      console.error('Error logging in:', error.message);
    }
  };

const createRoom = async () => {
  try {
    console.log('Attempting to create room with wager:', wager);
    const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/rooms`, { wager: parseInt(wager) });
    console.log('Room created:', response.data);
    setRoomId(response.data.roomId);
    setGameState(response.data);
    fetchRooms();
  } catch (error) {
    console.error('Error creating room:', error.message);
    // Rollback wager if API fails (though this requires backend support)
    if (user) {
      setUser({ ...user, foxyPesos: user.foxyPesos + parseInt(wager) }); // Temporary client-side rollback
    }
  }
};

const joinRoom = async (id) => {
  try {
    const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/rooms/${id}/join`);
    setRoomId(id);
    setGameState(response.data);
  } catch (error) {
    console.error('Error joining room:', error.message);
    if (user) {
      setUser({ ...user, foxyPesos: user.foxyPesos + parseInt(wager) }); // Temporary client-side rollback
    }
  }
};

  const roll = async () => {
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/rooms/${roomId}/roll`);
      setGameState({ ...gameState, rolls: [...gameState.rolls, { player: user._id, value: response.data.rollValue }] });
    } catch (error) {
      console.error('Error rolling:', error.message);
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
          {!roomId ? (
            <>
              <div className="room-form">
                <input
                  type="number"
                  value={wager}
                  onChange={(e) => setWager(e.target.value)}
                  placeholder="Wager (Foxy Pesos)"
                  className="input"
                />
                <button onClick={() => { console.log('Create button clicked'); createRoom(); }} className="button">Create Room</button>
              </div>
              <h2>Open Rooms</h2>
              <ul>
                {rooms.map(room => (
                  <li key={room.roomId} className="room-item">
                    Room {room.roomId} - Wager: {room.wager} FP
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
                  <p>Current Max: {gameState.currentMax}</p>
                  <p>Current Player: {gameState.currentPlayer === user._id ? 'You' : 'Opponent'}</p>
                  {gameState.rolls && gameState.rolls.map((roll, i) => (
                    <p key={i}>{roll.player === user._id ? 'You' : 'Opponent'} rolled: {roll.value}</p>
                  ))}
                  {gameState.status === 'active' && gameState.currentPlayer === user._id && (
                    <button onClick={roll} className="button">Roll</button>
                  )}
                  {gameState.status === 'closed' && (
                    <p>Winner: {gameState.winner === user._id ? 'You' : 'Opponent'}</p>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default App;
