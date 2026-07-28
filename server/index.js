require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Storage = require('./models/Storage');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support large objects if necessary

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes

// Get data by key
app.get('/api/storage/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const data = await Storage.findOne({ key });
    if (!data) {
      return res.status(404).json({ error: 'Key not found' });
    }
    res.json({ value: data.value });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set data by key
app.post('/api/storage/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    // Update or insert (upsert)
    const data = await Storage.findOneAndUpdate(
      { key },
      { value },
      { returnDocument: 'after', upsert: true }
    );
    
    res.json({ success: true, value: data.value });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
