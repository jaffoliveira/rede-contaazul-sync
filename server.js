require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const uploadRouter = require('./routes/upload');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/upload', uploadRouter);
app.use('/api/auth', authRouter);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
