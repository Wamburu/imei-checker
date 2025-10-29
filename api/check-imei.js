const chromium = require('chrome-aws-lambda');

const LOGIN_CREDENTIALS = {
    username: 'KE007', 
    password: 'KE007'
};

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

        const cleanImei = imei.replace(/[^\d]/g, '');
        if (cleanImei.length !== 15) {
            return res.json({
                imei: imei,
                status: 'WRONG FORMAT',
                category: 'wrong-format'
            });
        }

        console.log('🚀 Launching browser for real Oway check...');
        
        // FIXED: Proper Vercel Chrome setup
        browser = await chromium.puppeteer.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: true,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);
        await page.setDefaultTimeout(30000);

        console.log('🔐 Logging into Oway...');
        await page.goto('https://sellin.oway-ke.com/user/login', { 
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Wait for page to load
        await page.waitForTimeout(3000);

        // Fill login form
        await page.type('input[type="text"], input[name="username"]', LOGIN_CREDENTIALS.username, { delay: 100 });
        await page.type('input[type="password"], input[name="password"]', LOGIN_CREDENTIALS.password, { delay: 100 });
        
        // Click login button
        await page.click('button[type="submit"], input[type="submit"]');
        
        // Wait for login to complete
        await page.waitForTimeout(5000);

        console.log('🎯 Navigating to IMEI tool...');
        await page.goto('https://sellin.oway-ke.com/tool/imei', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        // Wait for IMEI tool to load
        await page.waitForTimeout(3000);

        // Check if we're on the right page
        const currentUrl = page.url();
        if (!currentUrl.includes('tool/imei')) {
            throw new Error('Not on IMEI tool page. Current URL: ' + currentUrl);
        }

        console.log('✅ On IMEI tool page, entering IMEI...');
        
        // Wait for and clear textarea
        await page.waitForSelector('textarea', { timeout: 10000 });
        await page.evaluate(() => {
            const textarea = document.querySelector('textarea');
            if (textarea) {
                textarea.value = '';
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // Type IMEI
        await page.type('textarea', cleanImei, { delay: 100 });

        // Find and click check button
        const buttonClicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (let button of buttons) {
                const buttonText = (button.textContent || '').toLowerCase();
                if (buttonText.includes('check') || buttonText.includes('search') || button.type === 'submit') {
                    button.click();
                    return true;
                }
            }
            return false;
        });

        if (!buttonClicked) {
            // Fallback: press Enter
            await page.keyboard.press('Enter');
        }

        console.log('⏳ Waiting for results...');
        await page.waitForTimeout(8000);

        // Get REAL results from Oway system
        const result = await page.evaluate((imei) => {
            const results = [];
            const rows = document.querySelectorAll('tr');
            
            console.log('Found', rows.length, 'rows to check');
            
            for (let row of rows) {
                const cells = Array.from(row.querySelectorAll('td, th')).map(cell => 
                    cell.textContent.trim()
                );
                
                // Check if any cell contains the IMEI
                const hasImei = cells.some(cell => cell.includes(imei));
                
                if (hasImei) {
                    console.log('Found IMEI in row:', cells);
                    
                    const model = cells[1] || cells[2] || cells[3] || '-';
                    const color = cells[2] || cells[3] || cells[4] || '-';
                    const status = cells[cells.length - 1] || 'UNKNOWN';
                    
                    // Determine category based on status and data
                    let category = 'active';
                    if (model.toLowerCase().includes('not exist') || status.toLowerCase().includes('not exist')) {
                        category = 'not-exist';
                    } else if (status.toLowerCase().includes('not active') || status.toLowerCase().includes('inactive')) {
                        category = 'not-active';
                    } else if (status.toLowerCase().includes('active')) {
                        // Try to determine active days from dates if available
                        const hasDate = cells.some(cell => cell.match(/\d{4}-\d{2}-\d{2}/));
                        if (hasDate) {
                            category = 'active-2-days'; // Default, you can add date calculation
                        } else {
                            category = 'active';
                        }
                    }
                    
                    return {
                        imei: imei,
                        status: status,
                        model: model,
                        color: color,
                        inDate: '-',
                        outDate: '-', 
                        activationDate: '-',
                        daysActive: '-',
                        category: category,
                        output: `${imei} - ${status} - ${model}`,
                        message: '✅ REAL data from Oway system',
                        rawData: cells // For debugging
                    };
                }
            }
            
            // IMEI not found in any row
            return {
                imei: imei,
                status: 'NOT EXIST',
                model: 'not exists',
                color: '-',
                inDate: '-',
                outDate: '-',
                activationDate: '-', 
                daysActive: '-',
                category: 'not-exist',
                output: `${imei} - not exists`,
                message: 'IMEI not found in Oway system'
            };
            
        }, cleanImei);

        console.log('✅ Real Oway check completed:', result.status);
        await browser.close();
        
        res.json(result);

    } catch (error) {
        console.error('❌ Real Oway check failed:', error.message);
        if (browser) await browser.close();
        
        res.status(500).json({ 
            error: `Real Oway check failed: ${error.message}`,
            imei: req.body.imei,
            success: false,
            message: 'Try again or check Oway system status'
        });
    }
};
