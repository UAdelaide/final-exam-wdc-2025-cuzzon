var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

let db;

(async () => {
  try {
    // Connect to MySQL without specifying database
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '' // Add password if needed
    });

    // Create the database if it doesn't exist
    await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
    await connection.end();

    // Connect to the DogWalkService database
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService'
    });

    // Read and execute your dogwalks.sql file (make sure it's in the same folder)
    const sql = require('fs').readFileSync(path.join(__dirname, 'dogwalks.sql'), 'utf8');
    await db.query(sql);

    // Insert test data if Users table is empty
    const [rows] = await db.execute('SELECT COUNT(*) AS count FROM Users');
    if (rows[0].count === 0) {
      await db.execute(`
        INSERT INTO Users (username, email, password_hash, role) VALUES
          ('alice123', 'alice@example.com', 'hashed123', 'owner'),
          ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
          ('carol123', 'carol@example.com', 'hashed789', 'owner'),
          ('davewalker', 'dave@example.com', 'hashed000', 'walker'),
          ('emilyowner', 'emily@example.com', 'hashed111', 'owner');

        INSERT INTO Dogs (owner_id, name, size)
        SELECT user_id, 'Max', 'medium' FROM Users WHERE username = 'alice123'
        UNION ALL
        SELECT user_id, 'Bella', 'small' FROM Users WHERE username = 'carol123'
        UNION ALL
        SELECT user_id, 'Rocky', 'large' FROM Users WHERE username = 'alice123'
        UNION ALL
        SELECT user_id, 'Luna', 'medium' FROM Users WHERE username = 'emilyowner'
        UNION ALL
        SELECT user_id, 'Daisy', 'small' FROM Users WHERE username = 'carol123';

        INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
        SELECT dog_id, '2025-06-10 08:00:00', 30, 'Parklands', 'open' FROM Dogs WHERE name = 'Max'
        UNION ALL
        SELECT dog_id, '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted' FROM Dogs WHERE name = 'Bella'
        UNION ALL
        SELECT dog_id, '2025-06-11 10:00:00', 60, 'City Park', 'open' FROM Dogs WHERE name = 'Rocky'
        UNION ALL
        SELECT dog_id, '2025-06-12 11:00:00', 40, 'River Walk', 'open' FROM Dogs WHERE name = 'Luna'
        UNION ALL
        SELECT dog_id, '2025-06-13 15:30:00', 30, 'Hilltop Trail', 'cancelled' FROM Dogs WHERE name = 'Daisy';
      `);
    }
  } catch (err) {
    console.error('Error setting up database. Ensure Mysql is running: service mysql start', err);
  }
})();

// Routes

// GET /api/dogs
app.get('/api/dogs', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT d.name AS dog_name, d.size, u.username AS owner_username
      FROM Dogs d
      JOIN Users u ON d.owner_id = u.user_id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs', details: err.message });
  }
});

// GET /api/walkrequests/open
app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT wr.request_id, d.name AS dog_name, wr.requested_time, wr.duration_minutes,
             wr.location, u.username AS owner_username
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      JOIN Users u ON d.owner_id = u.user_id
      WHERE wr.status = 'open'
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch open walk requests', details: err.message });
  }
});

// GET /api/walkers/summary
app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        u.username AS walker_username,
        COUNT(r.rating_id) AS total_ratings,
        ROUND(AVG(r.rating), 1) AS average_rating,
        (
          SELECT COUNT(*)
          FROM WalkApplications a
          JOIN WalkRequests wr ON a.request_id = wr.request_id
          WHERE a.walker_id = u.user_id AND a.status = 'accepted' AND wr.status = 'completed'
        ) AS completed_walks
      FROM Users u
      LEFT JOIN WalkRatings r ON u.user_id = r.walker_id
      WHERE u.role = 'walker'
      GROUP BY u.user_id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch walker summaries', details: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;