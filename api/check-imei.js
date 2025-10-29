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
        category: 'wrong-format',
        message: 'IMEI must be 15 digits'
      });
    }

    // Mock response
    const statuses = ['ACTIVE', 'NOT ACTIVE', 'NOT EXIST'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    res.json({
      imei: cleanImei,
      status: randomStatus,
      model: `Device ${Math.floor(Math.random() * 1000)}`,
      color: 'Black',
      daysActive: randomStatus === 'ACTIVE' ? Math.floor(Math.random() * 30) : 0,
      category: randomStatus.toLowerCase().replace(' ', '-'),
      message: '✅ Demo response - Working on Vercel!'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
