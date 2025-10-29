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
        
        // Clean the IMEI - remove spaces, dashes, and other non-digit characters
        const cleanedImei = imei.replace(/[^\d]/g, '');
        
        // Check if it's exactly 15 digits and only numbers
        if (/^\d{15}$/.test(cleanedImei)) {
            // Check for duplicates
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

// Initialize browser with direct navigation to IMEI tool
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
        // RAILWAY-OPTIMIZED PUPPETEER CONFIGURATION - Uses system Chromium
        const browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--no-zygote',
                '--disable-accelerated-2d-canvas',
                '--disable-web-security'
            ],
            timeout: 30000
        });

        const page = await browser.newPage();
        
        await page.setDefaultNavigationTimeout(30000);
        await page.setDefaultTimeout(15000);

        console.log('📝 Going directly to login page...');
        await page.goto('https://sellin.oway-ke.com/user/login', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await page.waitForTimeout(2000);

        console.log('🔐 Attempting login...');
        await page.type('input[type="text"], input[name="username"]', LOGIN_CREDENTIALS.username, { delay: 50 });
        await page.type('input[type="password"], input[name="password"]', LOGIN_CREDENTIALS.password, { delay: 50 });

        console.log('👆 Clicking login button...');
        await page.click('button[type="submit"], input[type="submit"]');

        console.log('⏳ Waiting for login...');
        await page.waitForTimeout(3000);

        console.log('🎯 Navigating to IMEI tool...');
        await page.goto('https://sellin.oway-ke.com/tool/imei', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        const currentUrl = page.url();
        console.log('📍 Current URL:', currentUrl);

        if (currentUrl.includes('tool/imei')) {
            console.log('✅ Successfully reached IMEI tool page!');
        } else if (currentUrl.includes('login')) {
            throw new Error('Login failed - still on login page');
        } else {
            console.log('⚠️ On different page, trying to navigate to IMEI tool again...');
            try {
                await page.goto('https://sellin.oway-ke.com/tool/imei', {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });
            } catch (navError) {
                console.log('❌ Could not navigate to IMEI tool directly');
                throw navError;
            }
        }

        await page.waitForTimeout(2000);
        
        try {
            await page.waitForSelector('textarea', { timeout: 5000 });
            console.log('✅ IMEI tool is ready for use!');
        } catch (error) {
            console.log('❌ IMEI tool not loading properly');
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

// Process a single chunk of IMEIs (max 50)
async function processIMEIChunk(imeiChunk, page) {
    try {
        // Ensure we're on the IMEI tool page
        const currentUrl = page.url();
        if (!currentUrl.includes('tool/imei')) {
            await page.goto('https://sellin.oway-ke.com/tool/imei', {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
            await page.waitForTimeout(1000);
        }

        // Clear textarea
        await page.waitForSelector('textarea', { timeout: 5000 });
        await page.evaluate(() => {
            const textarea = document.querySelector('textarea');
            if (textarea) {
                textarea.value = '';
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // Type IMEIs for this chunk
        const bulkImeiText = imeiChunk.join('\n');
        await page.type('textarea', bulkImeiText, { delay: 10 });

        // Click check button
        const buttonClicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button, input[type="submit"]');
            for (let button of buttons) {
                const buttonText = button.textContent || button.value || '';
                if (buttonText.includes('Check') || buttonText.includes('Search') || buttonText.includes('Get Info') || button.type === 'submit') {
                    button.click();
                    return true;
                }
            }
            return false;
        });

        if (!buttonClicked) {
            await page.keyboard.press('Enter');
        }

        // Wait for results
        await page.waitForTimeout(5000);

        // PARSING LOGIC WITH SUB-CATEGORIES
        const results = await page.evaluate((imeis) => {
            const results = [];
            const rows = document.querySelectorAll('tr');
            
            imeis.forEach(imei => {
                let found = false;
                let isActuallyNotExist = false;
                
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

                        // CHECK IF THE IMEI ACTUALLY DOESN'T EXIST
                        if (model.toLowerCase().includes('not exist') || 
                            model === '-' || 
                            model === 'not exists' ||
                            (inDate === '-' && outDate === '-' && activationDate === '-')) {
                            isActuallyNotExist = true;
                        }

                        let status, output, category;
                        let daysActive = '-';
                        
                        if (isActuallyNotExist) {
                            status = 'NOT EXIST';
                            category = 'not-exist';
                            output = `${imei} - not exists`;
                        } else if (activationDate === 'n/a' || activationDate === '-' || !activationDate) {
                            status = 'NOT ACTIVE';
                            category = 'not-active';
                            output = `${imei} - ${model} ${color} ${inDate} n/a n/a`;
                        } else {
                            // This is an active device - calculate days active and categorize
                            try {
                                const activationTime = new Date(activationDate);
                                const now = new Date();
                                daysActive = Math.floor((now - activationTime) / (1000 * 60 * 60 * 24));
                                
                                // SUB-CATEGORIZATION
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

                            // Set output based on outDate
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
                            model: isActuallyNotExist ? 'not exists' : model,
                            color: isActuallyNotExist ? '-' : color,
                            inDate: isActuallyNotExist ? '-' : inDate,
                            outDate: isActuallyNotExist ? '-' : outDate,
                            activationDate: isActuallyNotExist ? '-' : activationDate,
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

// Process IMEIs in batches of 50 to avoid website limits
async function checkBulkIMEIs(imeiList, page) {
    console.log(`🔍 Checking ${imeiList.length} IMEIs...`);
    
    // Split into chunks of 50
    const chunkSize = 50;
    const chunks = [];
    for (let i = 0; i < imeiList.length; i += chunkSize) {
        chunks.push(imeiList.slice(i, i + chunkSize));
    }

    console.log(`📦 Split into ${chunks.length} chunks of max ${chunkSize} IMEIs each`);

    const allResults = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`🔄 Processing chunk ${i + 1}/${chunks.length} (${chunk.length} IMEIs)...`);

        try {
            const chunkResults = await processIMEIChunk(chunk, page);
            allResults.push(...chunkResults);
            
            // Small delay between chunks to avoid overwhelming the website
            if (i < chunks.length - 1) {
                console.log('⏳ Waiting before next chunk...');
                await page.waitForTimeout(1000);
            }
        } catch (error) {
            console.error(`❌ Error processing chunk ${i + 1}:`, error.message);
            // Add error results for this chunk
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

    console.log(`✅ Successfully processed all ${allResults.length} IMEIs across ${chunks.length} chunks`);
    return allResults;
}

// Single IMEI endpoint
app.post('/api/check-imei', async (req, res) => {
    const { imei } = req.body;

    if (!imei) {
        return res.status(400).json({ error: 'IMEI is required' });
    }

    // Use the cleaning function for single IMEI too
    const cleanedResults = cleanAndValidateIMEIs([imei]);
    
    if (cleanedResults.wrongFormat.length > 0) {
        return res.json({
            imei: imei,
            status: 'WRONG FORMAT',
            output: `${imei} - wrong format`,
            category: 'wrong-format',
            model: '-',
            color: '-',
            inDate: '-',
            outDate: '-',
            activationDate: '-',
            daysActive: '-'
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
            imei: imei,
            success: false
        });
    }
});

// Batch IMEI check endpoint - UPDATED WITH SUB-CATEGORIES
app.post('/api/check-batch-imei', async (req, res) => {
    const { imeis } = req.body;

    if (!imeis || !Array.isArray(imeis)) {
        return res.status(400).json({ error: 'IMEI array is required' });
    }

    // Use the new cleaning function
    const cleanedResults = cleanAndValidateIMEIs(imeis);
    const validImeis = cleanedResults.valid;
    const wrongFormatImeis = cleanedResults.wrongFormat;
    const duplicateImeis = cleanedResults.duplicates;

    if (validImeis.length === 0 && wrongFormatImeis.length === 0) {
        return res.status(400).json({ error: 'No valid IMEI numbers provided' });
    }

    console.log(`🔄 Starting batch check of ${validImeis.length} IMEIs (will process in chunks of 50)...`);
    if (wrongFormatImeis.length > 0) {
        console.log(`⚠️  ${wrongFormatImeis.length} IMEIs in wrong format`);
    }
    if (duplicateImeis.length > 0) {
        console.log(`⚠️  ${duplicateImeis.length} duplicate IMEIs found`);
    }

    const startTime = Date.now();

    let browser;
    let page;
    let checkResults = [];

    try {
        if (validImeis.length > 0) {
            browser = await initializeBrowser();
            page = (await browser.pages())[0];
            checkResults = await checkBulkIMEIs(validImeis, page);
        }

        const wrongFormatResults = wrongFormatImeis.map(imei => ({
            imei: imei,
            status: 'WRONG FORMAT',
            output: `${imei} - wrong format`,
            category: 'wrong-format',
            model: '-',
            color: '-',
            inDate: '-',
            outDate: '-',
            activationDate: '-',
            daysActive: '-'
        }));

        const duplicateResults = duplicateImeis.map(imei => ({
            imei: imei,
            status: 'DUPLICATE',
            output: `${imei} - duplicate`,
            category: 'duplicate',
            model: '-',
            color: '-',
            inDate: '-',
            outDate: '-',
            activationDate: '-',
            daysActive: '-'
        }));

        const allResults = [...checkResults, ...wrongFormatResults, ...duplicateResults];
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        console.log(`✅ Batch check completed in ${totalTime} seconds`);
        console.log(`📊 Processed ${allResults.length} total IMEIs`);

        // UPDATED SUMMARY WITH SUB-CATEGORIES
        const summary = {
            'not-exist': allResults.filter(r => r.category === 'not-exist').length,
            'not-active': allResults.filter(r => r.category === 'not-active').length,
            'active-2-days': allResults.filter(r => r.category === 'active-2-days').length,
            'active-3-15-days': allResults.filter(r => r.category === 'active-3-15-days').length,
            'active-more-15': allResults.filter(r => r.category === 'active-more-15').length,
            'error': allResults.filter(r => r.category === 'error').length,
            'wrong-format': wrongFormatImeis.length,
            'duplicate': duplicateImeis.length
        };

        // Log categorization breakdown
        console.log('📈 Categorization Breakdown:');
        console.log(`   🟢 Active ≤2 days: ${summary['active-2-days']}`);
        console.log(`   🟡 Active 3-15 days: ${summary['active-3-15-days']}`);
        console.log(`   🔴 Expired >15 days: ${summary['active-more-15']}`);
        console.log(`   ⚫ Not Active: ${summary['not-active']}`);
        console.log(`   ❌ Not Exist: ${summary['not-exist']}`);
        console.log(`   ⚠️ Errors: ${summary['error']}`);

        res.json({
            success: true,
            total: imeis.length,
            valid: validImeis.length,
            wrongFormat: wrongFormatImeis.length,
            duplicates: duplicateImeis.length,
            chunks: Math.ceil(validImeis.length / 50),
            summary: summary,
            results: allResults,
            processingTime: `${totalTime} seconds`
        });

    } catch (error) {
        console.error('❌ Batch processing error:', error);
        if (browser) {
            await browser.close();
            browserInstance = null;
        }
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
        timestamp: new Date().toISOString(),
        browserActive: !!browserInstance
    });
});

// Debug endpoint to check current page
app.get('/debug-page', async (req, res) => {
    try {
        if (!browserInstance) {
            return res.json({ error: 'No browser instance' });
        }
        const page = (await browserInstance.pages())[0];
        const url = page.url();
        const title = await page.title();
        res.json({
            url: url,
            title: title,
            onImeiTool: url.includes('tool/imei')
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// RAILWAY PORT CONFIGURATION
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('📱 IMEI Checker - Railway Optimized Version');
    console.log('🔧 Debug: /debug-page');
    console.log('❤️ Health: /health');
    console.log('🌐 Environment:', process.env.NODE_ENV || 'development');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down...');
    if (browserInstance) {
        await browserInstance.close();
    }
    process.exit();
});

process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down...');
    if (browserInstance) {
        await browserInstance.close();
    }
    process.exit();
});
