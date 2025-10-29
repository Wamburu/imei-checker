const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios'); // We'll use this instead of Puppeteer

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// Remove ALL Puppeteer code and use simple API
app.post('/api/check-imei', async (req, res) => {
    const { imei } = req.body;

    if (!imei) {
        return res.status(400).json({ error: 'IMEI is required' });
    }

    // Clean IMEI
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
        // SIMULATE IMEI check (replace this with actual API calls if available)
        // For now, we'll return mock data to test the mobile interface
        const mockResults = [
            { status: 'ACTIVE', days: 5, model: 'Samsung Galaxy S23' },
            { status: 'NOT_ACTIVE', days: 0, model: 'iPhone 15' },
            { status: 'NOT_EXIST', days: null, model: null }
        ];
        
        const randomResult = mockResults[Math.floor(Math.random() * mockResults.length)];
        
        res.json({
            imei: cleanImei,
            status: randomResult.status,
            model: randomResult.model,
            daysActive: randomResult.days,
            output: `${cleanImei} - ${randomResult.status}`,
            category: randomResult.status.toLowerCase().replace('_', '-'),
            timestamp: new Date().toISOString()
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

// Batch check (simplified)
app.post('/api/check-batch-imei', async (req, res) => {
    const { imeis } = req.body;

    if (!imeis || !Array.isArray(imeis)) {
        return res.status(400).json({ error: 'IMEI array required' });
    }

    const validImeis = imeis
        .map(imei => imei.replace(/[^\d]/g, ''))
        .filter(imei => imei.length === 15)
        .slice(0, 10); // Limit to 10 for mobile

    const results = [];

    for (const imei of validImeis) {
        try {
            // Use single check logic for each IMEI
            const mockReq = { body: { imei } };
            const mockResult = {
                imei: imei,
                status: Math.random() > 0.3 ? 'ACTIVE' : 'NOT_ACTIVE',
                model: `Device ${Math.floor(Math.random() * 1000)}`,
                daysActive: Math.floor(Math.random() * 30),
                category: Math.random() > 0.3 ? 'active' : 'not-active'
            };
            results.push(mockResult);
        } catch (error) {
            results.push({
                imei: imei,
                status: 'ERROR',
                output: `Failed: ${error.message}`,
                category: 'error'
            });
        }
    }

    res.json({
        success: true,
        processed: results.length,
        results: results,
        summary: {
            active: results.filter(r => r.status === 'ACTIVE').length,
            'not-active': results.filter(r => r.status === 'NOT_ACTIVE').length,
            error: results.filter(r => r.status === 'ERROR').length
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        mobile: true,
        puppeteer: false,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📱 LIGHT IMEI Checker running on port ${PORT}`);
    console.log(`⚡ No Puppeteer - Fast deployment`);
    console.log(`🌐 Access via: http://localhost:${PORT}`);
});
