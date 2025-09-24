const express = require('express');
const app = express();
const PORT = 5000;

app.use(require('cors')());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: '✅ Test server is working!', port: PORT });
});

app.listen(PORT, () => {
  console.log('Test server running on port', PORT);
});