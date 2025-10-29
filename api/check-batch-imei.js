const chromium = require('chrome-aws-lambda');

const LOGIN_CREDENTIALS = {
    username: 'KE007',
    password: 'KE007'
};

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

// Process IMEIs in smaller chunks for Vercel
async function processIMEIChunk(imeiChunk, page) {
    try {
        // Ensure we're on IMEI tool page
        const currentUrl = page.url();
        if (!currentUrl.includes('tool/imei')) {
            await page.goto('https://sellin.oway-ke.com/tool/imei', {
                waitUntil: 'networkidle2'
            });
            await page.waitForTimeout(2000);
        }

        await page.waitForSelector('textarea', { timeout: 10000 });
        
        // Clear textarea
        await page.evaluate(() => {
            const textarea = document.querySelector('textarea');
            if (textarea) textarea.value = '';
        });

        // Type IMEIs
        const bulkImeiText = imeiChunk.join('\n');
        await page.type('textarea', bulkImeiText, { delay: 20 });

        // Click check button
        await page.evaluate(() => {
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

        await page.waitForTimeout(6000);

        // Parse results
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

                        if (model.toLowerCase().includes('not exist') || model === '-' || 
                            (inDate === '-' && outDate === '-' && activationDate === '-')) {
                            isActuallyNotExist = true;
                        }

                        let status, category;
                        let daysActive = '-';
                        
                        if (isActuallyNotExist) {
                            status = 'NOT EXIST';
                            category = 'not-exist';
                        } else if (activationDate === 'n/a' || activationDate === '-' || !activationDate) {
                            status = 'NOT ACTIVE';
                            category = 'not-active';
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
                        }

                        results.push({
                            imei: imei,
                            status: status,
                            output: `${imei} - ${status}`,
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
        console.error('❌ Error processing chunk:', error.message);
        throw error;
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let browser = null;
    try {
        const { imeis } = req.body;

        if (!imeis || !Array.isArray(imeis)) {
            return res.status(400).json({ error: 'IMEI array is required' });
        }

        const cleanedResults = cleanAndValidateIMEIs(imeis);
        const validImeis = cleanedResults.valid;
        const wrongFormatImeis = cleanedResults.wrongFormat;
        const duplicateImeis = cleanedResults.duplicates;

        if (validImeis.length === 0) {
            return res.status(400).json({ error: 'No valid IMEI numbers provided' });
        }

        // Launch browser
        browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);

        // Login
        await page.goto('https://sellin.oway-ke.com/user/login', { 
            waitUntil: 'networkidle2'
        });
        await page.waitForTimeout(2000);
        await page.type('input[type="text"], input[name="username"]', LOGIN_CREDENTIALS.username);
        await page.type('input[type="password"], input[name="password"]', LOGIN_CREDENTIALS.password);
        await page.click('button[type="submit"], input[type="submit"]');
        await page.waitForTimeout(3000);

        // Navigate to IMEI tool
        await page.goto('https://sellin.oway-ke.com/tool/imei', {
            waitUntil: 'networkidle2'
        });
        await page.waitForTimeout(2000);
        await page.waitForSelector('textarea', { timeout: 10000 });

        // Process in smaller chunks for Vercel (5 IMEIs per chunk)
        const chunkSize = 5;
        const chunks = [];
        for (let i = 0; i < validImeis.length; i += chunkSize) {
            chunks.push(validImeis.slice(i, i + chunkSize));
        }

        const allResults = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`🔄 Processing chunk ${i + 1}/${chunks.length}`);

            try {
                const chunkResults = await processIMEIChunk(chunk, page);
                allResults.push(...chunkResults);
                
                if (i < chunks.length - 1) {
                    await page.waitForTimeout(2000);
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

        const finalResults = [...allResults, ...wrongFormatResults, ...duplicateResults];

        const summary = {
            'not-exist': finalResults.filter(r => r.category === 'not-exist').length,
            'not-active': finalResults.filter(r => r.category === 'not-active').length,
            'active-2-days': finalResults.filter(r => r.category === 'active-2-days').length,
            'active-3-15-days': finalResults.filter(r => r.category === 'active-3-15-days').length,
            'active-more-15': finalResults.filter(r => r.category === 'active-more-15').length,
            'error': finalResults.filter(r => r.category === 'error').length,
            'wrong-format': wrongFormatImeis.length,
            'duplicate': duplicateImeis.length
        };

        await browser.close();

        res.json({
            success: true,
            total: imeis.length,
            valid: validImeis.length,
            wrongFormat: wrongFormatImeis.length,
            duplicates: duplicateImeis.length,
            chunks: chunks.length,
            summary: summary,
            results: finalResults,
            processingTime: 'Completed on Vercel'
        });

    } catch (error) {
        console.error('❌ Batch processing error:', error);
        if (browser) await browser.close();
        res.status(500).json({ 
            error: `Batch processing failed: ${error.message}`,
            success: false
        });
    }
};
