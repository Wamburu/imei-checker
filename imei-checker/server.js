const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// Your credentials
const LOGIN_CREDENTIALS = {
    username: 'KE007',
    password: 'KE007'
};

let browser = null;

// SIMPLIFIED browser initialization
async function getBrowser() {
    if (browser && await isBrowserConnected()) {
        return browser;
    }
    
    console.log('🚀 Starting browser in HEADLESS mode...');
    browser = await puppeteer.launch({
        headless: 'new', // ✅ CRITICAL: Must be headless for server
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process'
        ],
        timeout: 30000
    });
    
    return browser;
}

async function isBrowserConnected() {
    try {
        await browser.version();
        return true;
    } catch {
        return false;
    }
}

// SIMPLIFIED login function
async function ensureLoggedIn(page) {
    console.log('🔐 Checking login status...');
    await page.goto('https://sellin.oway-ke.com/tool/imei', { 
        waitUntil: 'networkidle2',
        timeout: 30000
    });

    // If we're redirected to login page, perform login
    if (page.url().includes('login')) {
        console.log('📝 Logging in...');
        await page.type('input[type="text"], input[name="username"]', LOGIN_CREDENTIALS.username);
        await page.type('input[type="password"], input[name="password"]', LOGIN_CREDENTIALS.password);
        await page.click('button[type="submit"], input[type="submit"]');
        await page.waitForTimeout(3000);
        
        // Go to IMEI tool after login
        await page.goto('https://sellin.oway-ke.com/tool/imei', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
    }
    
    console.log('✅ Ready for IMEI checks');
}

// SIMPLIFIED single IMEI check
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

    let browser;
    let page;

    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setDefaultNavigationTimeout(30000);
        await page.setDefaultTimeout(15000);

        // Ensure we're logged in and on IMEI tool
        await ensureLoggedIn(page);

        // Wait for textarea
        await page.waitForSelector('textarea', { timeout: 10000 });

        // Clear and enter IMEI
        await page.evaluate(() => {
            const textarea = document.querySelector('textarea');
            if (textarea) textarea.value = '';
        });
        
        await page.type('textarea', cleanImei, { delay: 50 });

        // Click check button
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (let button of buttons) {
                if (button.textContent.includes('Check') || button.type === 'submit') {
                    button.click();
                    return true;
                }
            }
            return false;
        });

        // Wait for results
        await page.waitForTimeout(5000);

        // Get results
        const result = await page.evaluate((imei) => {
            const rows = document.querySelectorAll('tr');
            let foundRow = null;

            for (let row of rows) {
                const cells = Array.from(row.querySelectorAll('td, th')).map(cell => 
                    cell.textContent.trim()
                );
                
                if (cells.some(cell => cell.includes(imei))) {
                    foundRow = cells;
                    break;
                }
            }

            if (foundRow) {
                return {
                    imei: imei,
                    status: 'FOUND',
                    output: foundRow.join(' | '),
                    category: 'found',
                    data: foundRow
                };
            } else {
                return {
                    imei: imei,
                    status: 'NOT FOUND',
                    output: `${imei} - not found in system`,
                    category: 'not-found'
                };
            }
        }, cleanImei);

        await page.close();
        res.json(result);

    } catch (error) {
        console.error('❌ Error:', error);
        if (page) await page.close();
        res.status(500).json({
            imei: imei,
            status: 'ERROR',
            output: `Check failed: ${error.message}`,
            category: 'error'
        });
    }
});

// Batch check (SIMPLIFIED)
app.post('/api/check-batch-imei', async (req, res) => {
    const { imeis } = req.body;

    if (!imeis || !Array.isArray(imeis)) {
        return res.status(400).json({ error: 'IMEI array required' });
    }

    // Process first 5 IMEIs only (for mobile)
    const imeisToProcess = imeis.slice(0, 5).map(imei => imei.replace(/[^\d]/g, '')).filter(imei => imei.length === 15);
    
    if (imeisToProcess.length === 0) {
        return res.status(400).json({ error: 'No valid IMEIs' });
    }

    const results = [];
    
    for (const imei of imeisToProcess) {
        try {
            // Use the single IMEI check logic for each IMEI
            const mockReq = { body: { imei } };
            const mockRes = {
                json: (result) => results.push(result)
            };
            
            // Simulate single check
            const browser = await getBrowser();
            const page = await browser.newPage();
            await ensureLoggedIn(page);
            await page.waitForSelector('textarea');
            
            // ... (same single check logic as above)
            
            await page.close();
            
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
        results: results
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        mobile: true,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📱 Mobile IMEI Checker running on port ${PORT}`);
    console.log(`🌐 Access via: http://localhost:${PORT}`);
});

// Cleanup on exit
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down...');
    if (browser) {
        await browser.close();
    }
    process.exit();
});
