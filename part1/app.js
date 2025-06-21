const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const port = 3000;

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '', // use your actual MySQL root password
  database: 'DogWalkService'
};

let pool;

async function insertTestData() {
  const conn = await pool.getConnection();
  try {
    // Insert users
    await conn.query(`
      INSERT IGNORE INTO Users (username, email, password_hash, role) VALUES
      ('alice123', 'alice@example.com', 'hashed123', 'owner'),
      ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
      ('carol123', 'carol@example.com', 'hashed789', 'owner'),
      ('davewalker', 'dave@example.com', 'hashed000', 'walker'),
      ('emilyowner', 'emily@example.com', 'hashed111', 'owner')
    `);

    // Insert dogs
    await conn.query(`
      INSERT IGNORE INTO Dogs (owner_id, name, size)
      SELECT user_id, 'Max', 'medium' FROM Users WHERE username = 'alice123'
      UNION
      SELECT user_id, 'Bella', 'small' FROM Users WHERE username = 'carol123'
      UNION
      SELECT user_id, 'Rocky', 'large' FROM Users WHERE username = 'alice123'
      UNION
      SELECT user_id, 'Luna', 'medium' FROM Users WHERE username = 'emilyowner'
      UNION
      SELECT user_id, 'Daisy', 'small' FROM Users WHERE username = 'carol123'
    `);

    // Insert walk requests
    await conn.query(`
      INSERT IGNORE INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
      SELECT dog_id, '2025-06-10 08:00:00', 30, 'Parklands', 'open'
      FROM Dogs WHERE name = 'Max'
      UNION
      SELECT dog_id, '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'
      FROM Dogs WHERE name = 'Bella'
      UNION
      SELECT dog_id, '2025-06-11 10:00:00', 60, 'City Park', 'open'
      FROM Dogs WHERE name = 'Rocky'
      UNION
      SELECT dog_id, '2025-06-12 11:00:00', 40, 'River Walk', 'open'
      FROM Dogs WHERE name = 'Luna'
      UNION
      SELECT dog_id, '2025-06-13 15:30:00', 30, 'Hilltop Trail', 'cancelled'
      FROM Dogs WHERE name = 'Daisy'
    `);
  } finally {
    conn.release();
  }
}

app.get('/api/dogs', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.name AS dog_name, d.size, u.username AS owner_username
      FROM Dogs d
      JOIN Users u ON d.owner_id = u.user_id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs', details: err.message });
  }
});

app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [rows] = await pool.query(`
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

app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [rows] = await pool.query(`
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

// Start the server and initialize DB
app.listen(port, async () => {
  try {
    pool = await mysql.createPool(dbConfig);
    await insertTestData();
    console.log(`Server running on http://localhost:${port}`);
  } catch (err) {
    console.error('Database initialization failed:', err.message);
  }
});