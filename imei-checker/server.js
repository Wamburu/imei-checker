const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Serve HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.post('/api/check-imei', (req, res) => {
  const { imei } = req.body;
  
  if (!imei) {
    return res.status(400).json({ error: 'IMEI is required' });
  }

  const cleanImei = imei.replace(/[^\d]/g, '');
  if (cleanImei.length !== 15) {
    return res.json({
      imei: imei,
      status: 'WRONG FORMAT',
      category: 'wrong-format'
    });
  }

  // Mock response for testing
  const statuses = ['ACTIVE', 'NOT ACTIVE', 'NOT EXIST'];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
  
  res.json({
    imei: cleanImei,
    status: randomStatus,
    model: `Device ${Math.floor(Math.random() * 1000)}`,
    daysActive: randomStatus === 'ACTIVE' ? Math.floor(Math.random() * 30) : 0,
    category: randomStatus.toLowerCase().replace(' ', '-'),
    message: 'This is a demo response. Add real IMEI checking later.'
  });
});

app.post('/api/check-batch-imei', (req, res) => {
  const { imeis } = req.body;

  if (!imeis || !Array.isArray(imeis)) {
    return res.status(400).json({ error: 'IMEI array required' });
  }

  const results = imeis.slice(0, 5).map(imei => {
    const cleanImei = imei.replace(/[^\d]/g, '');
    const statuses = ['ACTIVE', 'NOT ACTIVE', 'NOT EXIST'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    return {
      imei: cleanImei,
      status: randomStatus,
      category: randomStatus.toLowerCase().replace(' ', '-')
    };
  });

  res.json({
    success: true,
    results: results,
    message: 'Batch check demo - working!'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'IMEI Checker is running on Vercel!',
    timestamp: new Date().toISOString()
  });
});

// Handle all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
