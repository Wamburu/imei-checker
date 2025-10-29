const chromium = require('chrome-aws-lambda');

// Your credentials
const LOGIN_CREDENTIALS = {
    username: 'KE007',
    password: 'KE007'
};

// IMEI cleaning function
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

module.exports = async (req, res) => {
    // Enable CORS
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
                category: 'wrong-format',
                model: '-',
                color: '-',
                inDate: '-',
                outDate: '-',
                activationDate: '-',
                daysActive: '-'
            });
        }

        // Launch browser for Vercel
        browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);
        await page.setDefaultTimeout(30000);

        console.log('🔐 Logging in...');
        await page.goto('https://sellin.oway-ke.com/user/login', { 
            waitUntil: 'networkidle2'
        });

        await page.waitForTimeout(2000);
        await page.type('input[type="text"], input[name="username"]', LOGIN_CREDENTIALS.username);
        await page.type('input[type="password"], input[name="password"]', LOGIN_CREDENTIALS.password);
        await page.click('button[type="submit"], input[type="submit"]');

        await page.waitForTimeout(3000);

        console.log('🎯 Navigating to IMEI tool...');
        await page.goto('https://sellin.oway-ke.com/tool/imei', {
            waitUntil: 'networkidle2'
        });

        await page.waitForTimeout(2000);
        await page.waitForSelector('textarea', { timeout: 10000 });

        // Process single IMEI
        await page.evaluate(() => {
            const textarea = document.querySelector('textarea');
            if (textarea) textarea.value = '';
        });

        await page.type('textarea', cleanedResults.valid[0], { delay: 50 });

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

        await page.waitForTimeout(5000);

        // Get results
        const result = await page.evaluate((imei) => {
            const results = [];
            const rows = document.querySelectorAll('tr');
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

                    // Check if IMEI actually doesn't exist
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

            return results[0];
        }, cleanedResults.valid[0]);

        await browser.close();
        res.json(result);

    } catch (error) {
        console.error('❌ Error:', error);
        if (browser) await browser.close();
        res.status(500).json({ 
            error: `Check failed: ${error.message}`,
            imei: req.body.imei,
            success: false
        });
    }
};
