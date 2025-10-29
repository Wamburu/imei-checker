const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// ⚠️ CHANGE THESE TO YOUR REAL OWAY LOGIN CREDENTIALS!
const LOGIN_CREDENTIALS = {
    username: 'KE007',
    password: 'KE007'
};

let browserInstance = null;
let isInitializing = false;

// IMEI cleaning and validation function
function cleanAndValidateIMEIs(imeis) {
    const results = {
        valid: [],
        wrongFormat: [],
        duplicates: []
    };
    
    const seen = new Set();
    
    imeis.forEach(imei => {
        if (!imei || typeof imei !== 'string') {
            results.wrongFormat.push(imei);
            return;
        }
        
        const cleanedImei = imei.replace(/[^\d]/g, '');
        
        if (/^\d{15}$/.test(cleanedImei)) {
            if (seen.has(cleanedImei)) {
                results.duplicates.push(imei);
            } else {
                results.valid.push(cleanedImei);
                seen.add(cleanedImei);
            }
        } else {
            results.wrongFormat.push(imei);
        }
    });
    
    return results;
}

// Initialize browser
async function initializeBrowser() {
    if (browserInstance) {
        try {
            const pages = await browserInstance.pages();
            if (pages.length > 0) {
                console.log('✅ Reusing existing browser session');
                return browserInstance;
            }
        } catch (error) {
            console.log('🔄 Browser disconnected, creating new session...');
            browserInstance = null;
        }
    }

    if (isInitializing) {
        console.log('⏳ Browser already initializing, waiting...');
        while (isInitializing) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return browserInstance;
    }

    isInitializing = true;
    console.log('🚀 Starting browser...');
    
    try {
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ],
            timeout: 30000
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(30000);
        await page.setDefaultTimeout(15000);

        console.log('📝 Going to login page...');
        await page.goto('https://sellin.oway-ke.com/user/login', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await page.waitForTimeout(2000);

        console.log('🔐 Logging in...');
        await page.type('input[type="text"], input[name="username"]', LOGIN_CREDENTIALS.username, { delay: 50 });
        await page.type('input[type="password"], input[name="password"]', LOGIN_CREDENTIALS.password, { delay: 50 });
        await page.click('button[type="submit"], input[type="submit"]');

        await page.waitForTimeout(3000);

        console.log('🎯 Navigating to IMEI tool...');
        await page.goto('https://sellin.oway-ke.com/tool/imei', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await page.waitForTimeout(2000);
        
        try {
            await page.waitForSelector('textarea', { timeout: 5000 });
            console.log('✅ IMEI tool ready!');
        } catch (error) {
            console.log('❌ IMEI tool not loading');
            throw new Error('IMEI tool page not loading correctly');
        }

        browserInstance = browser;
        isInitializing = false;
        return browser;

    } catch (error) {
        isInitializing = false;
        console.error('❌ Browser initialization failed:', error.message);
        if (browserInstance) {
            await browserInstance.close();
            browserInstance = null;
        }
        throw error;
    }
}

// Process IMEI chunk
async function processIMEIChunk(imeiChunk, page) {
    try {
        const currentUrl = page.url();
        if (!currentUrl.includes('tool/imei')) {
            await page.goto('https://sellin.oway-ke.com/tool/imei', {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            await page.waitForTimeout(1000);
        }

        await page.waitForSelector('textarea', { timeout: 5000 });
        await page.evaluate(() => {
            const textarea = document.querySelector('textarea');
            if (textarea) {
                textarea.value = '';
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        const bulkImeiText = imeiChunk.join('\n');
        await page.type('textarea', bulkImeiText, { delay: 10 });

        const buttonClicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button, input[type="submit"]');
            for (let button of buttons) {
                const buttonText = button.textContent || button.value || '';
                if (buttonText.includes('Check') || buttonText.includes('Search') || button.type === 'submit') {
                    button.click();
                    return true;
                }
            }
            return false;
        });

        if (!buttonClicked) {
            await page.keyboard.press('Enter');
        }

        await page.waitForTimeout(5000);

        const results = await page.evaluate((imeis) => {
            const results = [];
            const rows = document.querySelectorAll('tr');
            
            imeis.forEach(imei => {
                let found = false;
                
                for (let row of rows) {
                    const cells = Array.from(row.querySelectorAll('td, th')).map(cell => 
                        cell.textContent.trim()
                    );
                    
                    if (cells.some(cell => cell.includes(imei))) {
                        found = true;
                        const model = cells[3] || '-';
                        const color = cells[4] || '-';
                        const inDate = cells[5] || '-';
                        const outDate = cells[6] || '-';
                        const activationDate = cells[7] || '-';

                        let status, output, category;
                        let daysActive = '-';
                        
                        if (model.toLowerCase().includes('not exist') || model === '-' || (inDate === '-' && outDate === '-' && activationDate === '-')) {
                            status = 'NOT EXIST';
                            category = 'not-exist';
                            output = `${imei} - not exists`;
                        } else if (activationDate === 'n/a' || activationDate === '-' || !activationDate) {
                            status = 'NOT ACTIVE';
                            category = 'not-active';
                            output = `${imei} - ${model} ${color} ${inDate} n/a n/a`;
                        } else {
                            try {
                                const activationTime = new Date(activationDate);
                                const now = new Date();
                                daysActive = Math.floor((now - activationTime) / (1000 * 60 * 60 * 24));
                                
                                if (daysActive <= 2) {
                                    status = 'ACTIVE ≤2 DAYS';
                                    category = 'active-2-days';
                                } else if (daysActive <= 15) {
                                    status = 'ACTIVE 3-15 DAYS';
                                    category = 'active-3-15-days';
                                } else {
                                    status = 'EXPIRED >15 DAYS';
                                    category = 'active-more-15';
                                }
                            } catch (e) {
                                status = 'ACTIVE';
                                category = 'active';
                                daysActive = 'error';
                            }

                            if (outDate === 'n/a' || outDate === '-' || !outDate) {
                                output = `${imei} - ${model} ${color} ${inDate} n/a ${activationDate}`;
                            } else {
                                output = `${imei} - ${model} ${color} ${inDate} ${outDate} ${activationDate}`;
                            }
                        }

                        results.push({
                            imei: imei,
                            status: status,
                            output: output,
                            model: model,
                            color: color,
                            inDate: inDate,
                            outDate: outDate,
                            activationDate: activationDate,
                            daysActive: daysActive,
                            category: category
                        });
                        break;
                    }
                }

                if (!found) {
                    results.push({
                        imei: imei,
                        status: 'NOT EXIST',
                        output: `${imei} - not exists`,
                        model: 'not exists',
                        color: '-',
                        inDate: '-',
                        outDate: '-',
                        activationDate: '-',
                        daysActive: '-',
                        category: 'not-exist'
                    });
                }
            });

            return results;
        }, imeiChunk);

        return results;

    } catch (error) {
        console.error(`❌ Error processing chunk:`, error.message);
        throw error;
    }
}

// Process IMEIs in batches
async function checkBulkIMEIs(imeiList, page) {
    console.log(`🔍 Checking ${imeiList.length} IMEIs...`);
    
    const chunkSize = 50;
    const chunks = [];
    for (let i = 0; i < imeiList.length; i += chunkSize) {
        chunks.push(imeiList.slice(i, i + chunkSize));
    }

    const allResults = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`🔄 Processing chunk ${i + 1}/${chunks.length}...`);

        try {
            const chunkResults = await processIMEIChunk(chunk, page);
            allResults.push(...chunkResults);
            
            if (i < chunks.length - 1) {
                await page.waitForTimeout(1000);
            }
        } catch (error) {
            console.error(`❌ Error processing chunk ${i + 1}:`, error.message);
            const errorResults = chunk.map(imei => ({
                imei: imei,
                status: 'ERROR',
                output: `${imei} - processing error`,
                model: '-',
                color: '-',
                inDate: '-',
                outDate: '-',
                activationDate: '-',
                daysActive: '-',
                category: 'error'
            }));
            allResults.push(...errorResults);
        }
    }

    console.log(`✅ Processed ${allResults.length} IMEIs`);
    return allResults;
}

// Single IMEI endpoint
app.post('/api/check-imei', async (req, res) => {
    const { imei } = req.body;

    if (!imei) {
        return res.status(400).json({ error: 'IMEI is required' });
    }

    const cleanedResults = cleanAndValidateIMEIs([imei]);
    
    if (cleanedResults.wrongFormat.length > 0) {
        return res.json({
            imei: imei,
            status: 'WRONG FORMAT',
            output: `${imei} - wrong format`,
            category: 'wrong-format'
        });
    }

    try {
        const browser = await initializeBrowser();
        const page = (await browser.pages())[0];
        const results = await checkBulkIMEIs(cleanedResults.valid, page);
        res.json(results[0]);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        res.status(500).json({ 
            error: `Check failed: ${error.message}`,
            success: false
        });
    }
});

// Batch IMEI check endpoint
app.post('/api/check-batch-imei', async (req, res) => {
    const { imeis } = req.body;

    if (!imeis || !Array.isArray(imeis)) {
        return res.status(400).json({ error: 'IMEI array is required' });
    }

    const cleanedResults = cleanAndValidateIMEIs(imeis);
    const validImeis = cleanedResults.valid;

    if (validImeis.length === 0) {
        return res.status(400).json({ error: 'No valid IMEI numbers provided' });
    }

    const startTime = Date.now();

    try {
        const browser = await initializeBrowser();
        const page = (await browser.pages())[0];
        const checkResults = await checkBulkIMEIs(validImeis, page);

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        const summary = {
            'not-exist': checkResults.filter(r => r.category === 'not-exist').length,
            'not-active': checkResults.filter(r => r.category === 'not-active').length,
            'active-2-days': checkResults.filter(r => r.category === 'active-2-days').length,
            'active-3-15-days': checkResults.filter(r => r.category === 'active-3-15-days').length,
            'active-more-15': checkResults.filter(r => r.category === 'active-more-15').length,
            'error': checkResults.filter(r => r.category === 'error').length
        };

        res.json({
            success: true,
            total: imeis.length,
            valid: validImeis.length,
            summary: summary,
            results: checkResults,
            processingTime: `${totalTime} seconds`
        });

    } catch (error) {
        console.error('❌ Batch processing error:', error);
        return res.status(500).json({ 
            error: `Batch processing failed: ${error.message}`,
            success: false
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'IMEI Checker is running',
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

process.on('SIGINT', async () => {
    console.log('🛑 Shutting down...');
    if (browserInstance) {
        await browserInstance.close();
    }
    process.exit();
});
