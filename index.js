// server/index.js


import express from 'express';
import pool from './db.js';


const app = express();
const PORT = process.env.PORT || 3000;

// A simple proxy/scrape route
app.get('/', async (req, res) => {
  try {
    res.send('Hello from the API proxy!');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
})  


app.get('/api/member', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers');
    res.json(result.rows);

  } catch (error) {
    console.error('DB error:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, () => {
  console.log(`API proxy listening on http://localhost:${PORT}`);

});
