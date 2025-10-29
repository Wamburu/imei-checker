module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ 
        status: 'OK', 
        message: 'IMEI Checker API is running on Vercel',
        timestamp: new Date().toISOString(),
        features: ['Single IMEI Check', 'Batch IMEI Check', 'Categorization']
    });
};
