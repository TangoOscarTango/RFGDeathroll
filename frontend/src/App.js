const { useState, useEffect } = React;

const App = () => {
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [rolls, setRolls] = useState([]);
  const [currentMax, setCurrentMax] = useState(25);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [winner, setWinner] = useState(null);
  const [loser, setLoser] = useState(null); // Added to use enhanced gameEnded payload
  const [finalRoll, setFinalRoll] = useState(null); // Added for gameEnded
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [wager, setWager] = useState(100);
  const [error, setError] = useState('');

  const rollSound = document.getElementById('roll-sound');

  useEffect(() => {
    const newSocket = io('https://rfgdeathroll-backend.onrender.com');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('roomCreated', (room) => {
      setRooms((prev) => [...prev, room]);
    });

    newSocket.on('playerJoined', (room) => {
      if (room.roomId === currentRoom?.roomId) { // Changed _id to roomId
        setCurrentRoom(room);
        setCurrentPlayer(room.currentPlayer);
      }
      setRooms((prev) => prev.map((r) => (r.roomId === room.roomId ? room : r))); // Changed _id to roomId
    });

    newSocket.on('rollResult', (data) => {
      setRolls((prev) => [...prev, { player: data.player, roll: data.roll }]);
      setCurrentMax(data.currentMax);
      setCurrentPlayer(data.currentPlayer);
      rollSound.play();
    });

    newSocket.on('gameEnded', (data) => {
      setWinner(data.winner);
      setLoser(data.loser); // Added to use enhanced payload
      setFinalRoll(data.finalRoll); // Added to use enhanced payload
      setCurrentRoom((prev) => ({ ...prev, status: 'closed' }));
      rollSound.play();
    });

    newSocket.on('playerLeft', (data) => {
      // Handle disconnection scenario
      setWinner(data.winner);
      setLoser(user._id === data.winner ? currentRoom.player1 === user._id ? currentRoom.player2 : currentRoom.player1 : user._id);
      setCurrentRoom((prev) => ({ ...prev, status: 'closed' }));
      rollSound.play();
    });

    newSocket.on('roomsCleared', () => {
      setRooms([]);
      setCurrentRoom(null);
      setRolls([]);
      setCurrentMax(25);
      setCurrentPlayer(null);
      setWinner(null);
      setLoser(null);
      setFinalRoll(null);
    });

    newSocket.on('error', (data) => {
      setError(data.message);
    });

    fetchRooms();

    return () => newSocket.disconnect();
  }, []);

  const fetchRooms = async () => {
    const response = await fetch('https://rfgdeathroll-backend.onrender.com/api/rooms');
    const data = await response.json();
    setRooms(data);
  };

  const login = async () => {
    try {
      const response = await fetch('https://rfgdeathroll-backend.onrender.com/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        setUser(data.user);
        localStorage.setItem('token', data.token);
        socket.emit('join', { userId: data.user._id });
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Login failed');
    }
  };

  const createRoom = async () => {
    try {
      const response = await fetch('https://rfgdeathroll-backend.onrender.com/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ wager }),
      });
      const room = await response.json();
      if (response.ok) {
        setCurrentRoom(room);
        setCurrentMax(25);
        socket.emit('join', { userId: user._id, roomId: room.roomId }); // Join Socket.IO room
      } else {
        setError(room.message);
      }
    } catch (err) {
      setError('Failed to create room');
    }
  };

  const joinRoom = async (roomId) => {
    try {
      const response = await fetch(`https://rfgdeathroll-backend.onrender.com/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const room = await response.json();
      if (response.ok) {
        setCurrentRoom(room);
        setCurrentMax(25);
        socket.emit('join', { userId: user._id, roomId: room.roomId }); // Join Socket.IO room
      } else {
        setError(room.message);
      }
    } catch (err) {
      setError('Failed to join room');
    }
  };

  const roll = async () => {
    try {
      const response = await fetch(`https://rfgdeathroll-backend.onrender.com/api/rooms/${currentRoom.roomId}/roll`, { // Changed _id to roomId
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to roll');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <h1 className="text-2xl mb-4">Login to Play Death Roll</h1>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 mb-4 bg-gray-700 rounded"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 mb-4 bg-gray-700 rounded"
          />
          <button onClick={login} className="w-full p-2 bg-blue-600 rounded hover:bg-blue-700">
            Login
          </button>
          {error && <p className="text-red-500 mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="text-4xl mb-6">Death Roll</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {!currentRoom ? (
        <div className="w-full max-w-md">
          <div className="mb-4">
            <input
              type="number"
              placeholder="Wager (Foxy Pesos)"
              value={wager}
              onChange={(e) => setWager(Number(e.target.value))}
              className="w-full p-2 bg-gray-700 rounded"
            />
            <button onClick={createRoom} className="w-full p-2 mt-2 bg-green-600 rounded hover:bg-green-700">
              Create Room
            </button>
          </div>
          <h2 className="text-xl mb-2">Available Rooms</h2>
          {rooms.map((room) => (
            <div key={room._id} className="bg-gray-800 p-4 mb-2 rounded flex justify-between items-center">
              <span>
                Room {room.roomId} - Wager: {room.wager} - Status: {room.status} </span> {/* Changed _id to roomId */}
              {room.status === 'open' && (
                <button
                  onClick={() => joinRoom(room.roomId)} {/* Changed _id to roomId */}
                  className="p-2 bg-blue-600 rounded hover:bg-blue-700"
                >
                  Join
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
          <div className="w-full max-w-md bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-2 mb-4 h2 text-gray-2">Room {currentRoom.roomId}</h2> {/* Changed _id to roomId */}
            <p>Current Max: {currentMax}</p>
            <p>Current Player: {currentPlayer === user._id ? 'You' : 'Opponent'}</p>
            <p>Status: {currentRoom.status}</p>
            {winner && (
              <p className="text text-xl mt-2">
                <p>
                {winner === user._id ? 'You Win!' : 'You Lose!'} Winner: {winner}, Wager Won: {currentRoom.wager * 2}
                {finalRoll && `, Final Roll: ${finalRoll}`}
              </p>
            )}
            <div className="mt-4 max-h-48 overflow-y-auto">
              <h3 className="text-lg">Rolls:</h3>
              {rolls.map((roll, index) => (
                <p key={index}>
                  {roll.player === user._id ? 'You' : 'Opponent'} rolled: {roll.roll}
                </p>
              ))}
            </div>
            {currentRoom.status === 'active' && currentPlayer === user._id && !winner && (
              <button onClick={roll} className="w-full p-2 mt-4 bg-red-600 rounded hover:bg-red-700">
                Roll
              </button>
            )}
            {currentRoom.status === 'closed' && (
              <button
                onClick={() => {
                  setCurrentRoom(null);
                  setRolls([]);
                  setCurrentMax(25);
                  setCurrentPlayer(null);
                  setWinner(null);
                  setLoser(null);
                  setFinalRoll(null);
                }}
                className="w-full p-2 mt-4 bg-gray-600 rounded hover:bg-gray-700"
              >
                Back to Lobby
              </button>
            )}
          </div>
        )}
    </div>
  );
};
