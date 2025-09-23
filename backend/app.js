const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json()); // This allows us to parse JSON in request bodies

// Basic test route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Nairobi Booking System API!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});