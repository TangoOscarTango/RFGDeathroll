// frontend/src/App.js
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import jwtDecode from 'jwt-decode';
import './App.css';

const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

const App = () => {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [wager, setWager] = useState(20);
  const [rooms, setRooms] = useState([]);
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // ─── USER AUTH / FETCH ─────────────────────────────────────────────────────────
  useEffect(() => {
    // If there is a token in localStorage, decode it and fetch the user’s info
    const token = localStorage.getItem('jwtToken');
    if (token) {
      const decoded = jwtDecode(token);
      axios
        .get(`${process.env.REACT_APP_API_URL}/api/user-info`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => setUser(res.data))
        .catch(() => localStorage.removeItem('jwtToken'));
    }
  }, []);

  // ─── SOCKET LISTENERS ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    // Whenever the server tells us which room state, capture it
    socket.on('roomUpdate', (data) => {
      if (data.roomId === roomId) {
        setGameState((prev) => ({
          ...prev,
          currentPlayer: data.currentPlayer,
          maxRoll: data.maxRoll,
          players: data.players,
          status: data.status,
        }));
      }
    });

    // When a roll happens, we update rollValue + switch currentPlayer
    socket.on('rollResult', (data) => {
      if (data.roomId === roomId) {
        setGameState((prev) => ({
          ...prev,
          rollValue: data.rollValue,
          currentPlayer: data.nextPlayer,
        }));
      }
    });

    // ─── NEW: “WE SAW END” HANDLER ───────────────────────────────────────────────
    socket.on('gameEnded', (data) => {
      console.log(
        'Socket event gameEnded received for roomId:',
        data.roomId,
        'current roomId:',
        roomId
      );
      if (data.roomId === roomId) {
        // Instead of immediately setting status:'closed', we set hasEnded:true
        console.log('Game ended received and matched:', data);
        setGameState((prev) => ({
          ...prev,
          hasEnded: true,
          winner: data.winner,
          // leave status alone (or mark it if you want: status:'ended' – but component will use hasEnded)
        }));
      }
    });

    return () => {
      socket.off('roomUpdate');
      socket.off('rollResult');
      socket.off('gameEnded');
    };
  }, [roomId]);

  // ─── LOGIN / SIGNUP FUNCTIONS ─────────────────────────────────────────────────
  const signup = async () => {
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/signup`, {
        email,
        password,
      });
      localStorage.setItem('jwtToken', res.data.token);
      setUser(res.data.user);
    } catch (err) {
      console.error(err);
    }
  };

  const login = async () => {
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/login`, {
        email,
        password,
      });
      localStorage.setItem('jwtToken', res.data.token);
      setUser(res.data.user);
    } catch (err) {
      console.error(err);
    }
  };

  // ─── ROOM LISTING / CREATION ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    // Fetch all open rooms so the user can join
    axios
      .get(`${process.env.REACT_APP_API_URL}/api/rooms`)
      .then((res) => setRooms(res.data))
      .catch((err) => console.error(err));
  }, [user]);

  const createRoom = async () => {
    try {
      const res = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/rooms`,
        { wager },
        { headers: { Authorization: `Bearer ${localStorage.getItem('jwtToken')}` } }
      );
      setRoomId(res.data.roomId);
      setGameState({
        roomId: res.data.roomId,
        players: [user._id],
        currentPlayer: res.data.currentPlayer,
        maxRoll: res.data.maxRoll,
        status: res.data.status,
        wager: res.data.wager,
        hasEnded: false,
        winner: null,
      });
      socket.emit('joinRoom', { roomId: res.data.roomId });
    } catch (err) {
      console.error(err);
    }
  };

  const joinRoom = async (id) => {
    try {
      await axios.post(
        `${process.env.REACT_APP_API_URL}/api/rooms/${id}/join`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('jwtToken')}` } }
      );
      setRoomId(id);
      // Initialize gameState with what the server returns
      const roomRes = await axios.get(`${process.env.REACT_APP_API_URL}/api/rooms/${id}`);
      setGameState({
        roomId: roomRes.data.roomId,
        players: roomRes.data.players,
        currentPlayer: roomRes.data.currentPlayer,
        maxRoll: roomRes.data.maxRoll,
        status: roomRes.data.status,
        wager: roomRes.data.wager,
        hasEnded: false,
        winner: null,
      });
      socket.emit('joinRoom', { roomId: id });
    } catch (err) {
      console.error(err);
    }
  };

  // ─── ROLL FUNCTION ─────────────────────────────────────────────────────────────
  const roll = async () => {
    if (!roomId) return;
    try {
      const res = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/rooms/${roomId}/roll`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('jwtToken')}` } }
      );
      // The server will emit 'rollResult' or 'gameEnded' accordingly
    } catch (err) {
      console.error(err);
    }
  };

  // ─── AUDIO CONTROL ─────────────────────────────────────────────────────────────
  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.volume = 0;
      audioRef.current.play();
      // 2-second fade-in
      let vol = 0;
      const fadeIn = setInterval(() => {
        vol += 0.05;
        if (vol >= 1) {
          vol = 1;
          clearInterval(fadeIn);
        }
        audioRef.current.volume = vol;
      }, 100);
      setIsPlaying(true);
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div className="App">
      {/* ─── AUDIO ELEMENT ─────────────────────────────── */}
      <audio ref={audioRef} loop>
        <source src="/Deathroll.mp3" type="audio/mpeg" />
      </audio>

      {!user && (
        <div className="auth-container">
          <h2>Login / Signup</h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div>
            <button onClick={login} className="button">
              Login
            </button>
            <button onClick={signup} className="button">
              Signup
            </button>
          </div>
        </div>
      )}

      {user && !roomId && (
        <div className="lobby-container">
          <h2>Welcome, {user.email}</h2>
          <p>Your Foxy Pesos: {user.foxyPesos}</p>

          <div className="create-room">
            <h3>Create a new room</h3>
            <input
              type="number"
              min="20"
              value={wager}
              onChange={(e) => setWager(Number(e.target.value))}
            />
            <button onClick={createRoom} className="button">
              Create (min 20)
            </button>
          </div>

          <div className="room-list">
            <h3>Join an existing room</h3>
            {rooms.map((r) => (
              <div key={r.roomId} className="room-item">
                <span>Room {r.roomId} | Wager: {r.wager}</span>
                <button onClick={() => joinRoom(r.roomId)} className="button">
                  Join
                </button>
              </div>
            ))}
          </div>

          {/* Music toggle, bottom-left */}
          <button
            onClick={toggleAudio}
            className="audio-toggle"
            style={{
              position: 'fixed',
              bottom: 20,
              left: 20,
              opacity: 0,
              transition: 'opacity 0.3s',
            }}
            onMouseEnter={(e) => (e.target.style.opacity = 1)}
            onMouseLeave={(e) => (e.target.style.opacity = 0)}
          >
            {isPlaying ? '🔇' : '🎵'}
          </button>
        </div>
      )}

      {user && roomId && gameState && (
        <div className="game-container">
          {/* Display background */}
          <img src="/background.png" alt="Background" className="background-img" />

          {/* Show room info */}
          <div className="room-info">
            <h3>Room {gameState.roomId}</h3>
            <p>Wager: {gameState.wager} Foxy Pesos each</p>
            <p>
              Turn: {gameState.currentPlayer === user._id ? 'Your turn' : 'Opponent’s turn'}
            </p>
            <p>Max roll: {gameState.maxRoll}</p>
          </div>

          {/* If someone has rolled at least once, show the last roll */}
          {typeof gameState.rollValue === 'number' && (
            <div className="last-roll">
              <p>Last roll: {gameState.rollValue}</p>
            </div>
          )}

          {/* Normal Roll button (only if game hasn’t ended AND it’s your turn) */}
          {gameState.currentPlayer === user._id &&
            !gameState.hasEnded &&
            gameState.status === 'open' && (
              <button onClick={roll} className="button">
                Roll
              </button>
            )}

          {/* ─── “GAME OVER” PANEL ──────────────────────────────────────────── */}
          {gameState.hasEnded && gameState.winner && (
            <div className="game-over-panel">
              <p>
                Game Over! Winner:{' '}
                {gameState.winner === user._id ? 'You' : 'Opponent'}
              </p>
              <button
                onClick={async () => {
                  // 1) Clear out the room (back to Lobby)
                  setRoomId(null);
                  setGameState(null);

                  // 2) Refresh the user's Foxy Pesos from backend
                  try {
                    const response = await axios.get(
                      `${process.env.REACT_APP_API_URL}/api/user-info`
                    );
                    setUser((prev) => ({
                      ...prev,
                      foxyPesos: response.data.foxyPesos,
                    }));
                  } catch (err) {
                    console.log('Could not refresh user info');
                  }
                }}
                className="button"
              >
                Back to Home
              </button>
            </div>
          )}

          {/* Music toggle, bottom-left */}
          <button
            onClick={toggleAudio}
            className="audio-toggle"
            style={{
              position: 'fixed',
              bottom: 20,
              left: 20,
              opacity: 0,
              transition: 'opacity 0.3s',
            }}
            onMouseEnter={(e) => (e.target.style.opacity = 1)}
            onMouseLeave={(e) => (e.target.style.opacity = 0)}
          >
            {isPlaying ? '🔇' : '🎵'}
          </button>

          {/* Clear Rooms button (admin) bottom-right */}
          <button
            onClick={async () => {
              try {
                await axios.delete(`${process.env.REACT_APP_API_URL}/api/rooms`);
                setRooms([]);
              } catch (err) {
                console.error(err);
              }
            }}
            className="audio-toggle"
            style={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              opacity: 0,
              transition: 'opacity 0.3s',
            }}
            onMouseEnter={(e) => (e.target.style.opacity = 1)}
            onMouseLeave={(e) => (e.target.style.opacity = 0)}
          >
            Clear Rooms
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
