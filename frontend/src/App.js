// App.js — Main React component for DeathRoll frontend

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import jwtDecode from 'jwt-decode';
import './App.css';
import ProfileModal from './components/ProfileModal';
import ChatPanel from './components/ChatPanel';

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
  const [TESTING, setTESTING] = useState(true);
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
      setGameState((prev) => ({ ...prev, ...data }));
    });

    socket.current.on('game_over', (data) => {
      console.log('Game over received:', data);
      setGameState((prev) => ({
        ...prev,
        status: 'closed',
        winner: data.winner,
        rolls: data.rolls
      }));
    });

    return () => {
      socket.current.disconnect();
    };
  }, [user]);

  useEffect(() => {
    if (roomId && socket.current) {
      console.log('[Socket] Emitting join_room for:', roomId);
      socket.current.emit('join_room', { roomId });
    }
  }, [roomId]);

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

  // All other functions remain unchanged...

  return (
    <div className="container">
      {/* UI content unchanged */}
    </div>
  );
};

export default App;
