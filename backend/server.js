const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DB_FILE = 'db.sqlite';

let SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
  const secretPath = path.join(__dirname, '.secret');
  if (fs.existsSync(secretPath)) {
    SECRET_KEY = fs.readFileSync(secretPath, 'utf8').trim();
  } else {
    SECRET_KEY = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretPath, SECRET_KEY, 'utf8');
  }
}

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS userdata (
      user_id INTEGER PRIMARY KEY,
      bookmarks TEXT,
      history TEXT,
      vault TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
  }
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Register
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  
  const hashedPassword = bcrypt.hashSync(password, 8);
  
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
    if (err) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Initialize empty userdata
    db.run('INSERT INTO userdata (user_id, bookmarks, history, vault) VALUES (?, ?, ?, ?)', [this.lastID, '[]', '[]', '[]']);
    
    res.json({ message: 'User registered successfully' });
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'User not found' });
    
    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid password' });
    
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY);
    res.json({ token, username: user.username });
  });
});

// Pull Data
app.get('/api/sync/data', authenticateToken, (req, res) => {
  db.get('SELECT bookmarks, history, vault FROM userdata WHERE user_id = ?', [req.user.id], (err, row) => {
    if (err || !row) return res.status(500).json({ error: 'Failed to fetch data' });
    
    res.json({
      bookmarks: JSON.parse(row.bookmarks || '[]'),
      history: JSON.parse(row.history || '[]'),
      vault: JSON.parse(row.vault || '[]')
    });
  });
});

// Push Data
app.post('/api/sync/data', authenticateToken, (req, res) => {
  const { bookmarks, history, vault } = req.body;
  
  db.run(
    'UPDATE userdata SET bookmarks = ?, history = ?, vault = ? WHERE user_id = ?',
    [JSON.stringify(bookmarks), JSON.stringify(history), JSON.stringify(vault), req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to save data' });
      res.json({ message: 'Data synced successfully' });
    }
  );
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
