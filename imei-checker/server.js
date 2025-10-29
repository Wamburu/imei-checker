const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// Simple IMEI check endpoint
app.post('/api/check-imei', async (req, res) => {
    const { imei } = req.body;

    if (!imei) {
        return res.status(400).json({ error: 'IMEI is required' });
    }

    const cleanImei = imei.replace(/[^\d]/g, '');
    if (cleanImei.length !== 15) {
        return res.json({
            imei: imei,
            status: 'WRONG FORMAT',
            output: `${imei} - must be 15 digits`,
            category: 'wrong-format'
        });
    }

    try {
        // Mock response for testing (replace with real logic later)
        const statuses = ['ACTIVE', 'NOT ACTIVE', 'NOT EXIST'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        res.json({
            imei: cleanImei,
            status: randomStatus,
            model: `Device ${Math.floor(Math.random() * 1000)}`,
            color: 'Black',
            inDate: '2024-01-15',
            outDate: 'n/a',
            activationDate: randomStatus === 'ACTIVE' ? '2024-01-20' : 'n/a',
            daysActive: randomStatus === 'ACTIVE' ? Math.floor(Math.random() * 30) : 0,
            output: `${cleanImei} - ${randomStatus}`,
            category: randomStatus.toLowerCase().replace(' ', '-')
        });

    } catch (error) {
        res.status(500).json({
            imei: imei,
            status: 'ERROR',
            output: `Check failed: ${error.message}`,
            category: 'error'
        });
    }
});

// Batch check endpoint
app.post('/api/check-batch-imei', async (req, res) => {
    const { imeis } = req.body;

    if (!imeis || !Array.isArray(imeis)) {
        return res.status(400).json({ error: 'IMEI array required' });
    }

    const validImeis = imeis
        .map(imei => imei.replace(/[^\d]/g, ''))
        .filter(imei => imei.length === 15)
        .slice(0, 10);

    const results = [];

    for (const imei of validImeis) {
        const statuses = ['ACTIVE', 'NOT ACTIVE', 'NOT EXIST'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        results.push({
            imei: imei,
            status: randomStatus,
            model: `Device ${Math.floor(Math.random() * 1000)}`,
            color: 'Black',
            inDate: '2024-01-15',
            outDate: 'n/a',
            activationDate: randomStatus === 'ACTIVE' ? '2024-01-20' : 'n/a',
            daysActive: randomStatus === 'ACTIVE' ? Math.floor(Math.random() * 30) : 0,
            output: `${imei} - ${randomStatus}`,
            category: randomStatus.toLowerCase().replace(' ', '-')
        });
    }

    res.json({
        success: true,
        processed: results.length,
        results: results,
        summary: {
            active: results.filter(r => r.status === 'ACTIVE').length,
            'not-active': results.filter(r => r.status === 'NOT ACTIVE').length,
            'not-exist': results.filter(r => r.status === 'NOT EXIST').length
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        mobile: true,
        vercel: true,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`📱 IMEI Checker running on Vercel - Port ${PORT}`);
});
