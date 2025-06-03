# RFGDeathroll
Below is a comprehensive README file tailored for your Death Roll game project. It describes the purpose, setup instructions, usage, and other relevant details typically included in a README for a project like this. The content assumes the current state of your project, including the frontend (React-based) and backend (Node.js with Socket.IO and MongoDB), as discussed.

Death Roll Game
Overview
The Death Roll game is an online multiplayer game where two players compete by rolling dice, starting from a maximum value (set to 25 for testing, typically 5000), with the goal of avoiding rolling a 1. Each player takes turns rolling a number between 1 and the current maximum. The maximum decreases with each roll (unless a 1 is rolled), and the player who rolls a 1 loses, awarding the winner double the wager in virtual currency ("Foxy Pesos"). The game is built using a React frontend and a Node.js backend with real-time updates via Socket.IO, persisting data in MongoDB.

Features
User Authentication: Signup and login with email and password.
Room Creation and Joining: Create a room with a minimum 20 Foxy Pesos wager or join an existing open room.
Real-Time Gameplay: Players roll dice, with results and game state updated in real-time.
Background Music: Toggleable music with a 2-second fade-in, controlled via a persistent button.
Game End Detection: Automatically detects and displays the winner when a 1 is rolled.
Debugging Support: Includes console logging for troubleshooting.
Prerequisites
Node.js: v14.x or higher
npm: v6.x or higher
MongoDB: A running instance (local or remote, e.g., MongoDB Atlas)
Render: For hosting the frontend and backend (or equivalent hosting service)
Setup Instructions
Environment Variables
Create a .env file in the backend directory with the following:

text

Copy
PORT=3001
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
REACT_APP_API_URL=https://your-backend-url.onrender.com
Backend Setup
Navigate to the backend directory:
bash

Copy
cd backend
Install dependencies:
bash

Copy
npm install
Start the server:
bash

Copy
npm start
For local testing, ensure MongoDB is running locally or the MONGODB_URI points to a remote instance.
Frontend Setup
Navigate to the frontend directory:
bash

Copy
cd frontend
Install dependencies:
bash

Copy
npm install
Start the development server:
bash

Copy
npm start
This runs the app at http://localhost:3000 by default. Adjust REACT_APP_API_URL in .env to match your backend URL for production.
Deployment
Render: Deploy the backend as a Web Service and the frontend as a Static Site.
Set environment variables in Render’s dashboard.
Ensure the backend URL is updated in REACT_APP_API_URL for the frontend.
Audio File: Upload Deathroll.mp3 (1.36MB) to a static hosting service (e.g., AWS S3) or the frontend/public folder, and update the Audio URL in App.js.
Usage
Signup/Login: Enter an email and password to create an account or log in.
Create Room: Set a wager (minimum 20 Foxy Pesos) and create a room.
Join Room: Select an open room from the list and join it.
Play: Take turns rolling the dice. The game ends when a player rolls a 1, declaring the other player the winner.
Music Control: Toggle music using the button in the bottom-left corner (hover to reveal).
Clear Rooms: Use the bottom-right button (hover to reveal) to clear all rooms (admin action).
Troubleshooting
WebSocket Issues: If real-time updates fail (e.g., no roll or game end notifications), check for "Socket disconnected" or "Socket connect error" in the console. The app includes a 30-second keep-alive ping to prevent Render’s free tier from sleeping, but upgrading to a paid plan may be necessary for persistent connections.
Roll of 1 Not Displaying: Ensure backend logs show "Emitting rollResult" and "Emitting gameEnded". If missing, verify MongoDB connectivity and Socket.IO client count.
Audio Not Playing: Confirm the Deathroll.mp3 URL is correct and user interaction (e.g., button click) initiates playback.
Known Limitations
Free Tier Constraints: Render’s free tier may sleep the backend, causing WebSocket disconnections. A paid plan or alternative hosting (e.g., Heroku) is recommended for stability.
Single Audio File: Only one music file (Deathroll.mp3) is supported; additional files require URL updates.
Testing Mode: The starting roll is temporarily set to 25 for faster testing and should be reverted to 5000 for production.
Contributing
Fork the repository.
Create a feature branch: git checkout -b feature-name.
Commit changes: git commit -m "Add feature-name".
Push to the branch: git push origin feature-name.
Submit a pull request.
License
This project is licensed under the MIT License - see the LICENSE file for details.
