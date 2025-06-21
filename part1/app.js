const express = require('express');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 8080;

const dbConfig = {
  host: 'localhost',
  user: 'root',
  multipleStatements: true
};

let pool;

async function initializeDatabase() {
  try {
    const sqlFilePath = path.join(__dirname, 'dogwalks.sql');
    const sqlScript = fs.readFileSync(sqlFilePath, 'utf-8');

    const connection = await mysql.createConnection(dbConfig);
    await connection.query(sqlScript);
    await connection.end();

    console.log('✅ Database initialized from dogwalks.sql');
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    throw err;
  }
}

async function setupPool() {
  pool = await mysql.createPool({
    ...dbConfig,
    database: 'DogWalkService',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
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
    res.status(500).json({ error: 'Failed to fetch walk requests', details: err.message });
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
    res.status(500).json({ error: 'Failed to fetch summary', details: err.message });
  }
});

app.listen(port, async () => {
  try {
    await initializeDatabase();
    await setupPool();
    console.log(`🚀 Server running on http://localhost:${port}`);
  } catch (err) {
    console.error('Server failed to start:', err.message);
  }
});