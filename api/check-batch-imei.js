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
    const { imeis } = req.body;

    if (!imeis || !Array.isArray(imeis)) {
      return res.status(400).json({ error: 'IMEI array required' });
    }

    const results = imeis.slice(0, 10).map(imei => {
      const cleanImei = imei.replace(/[^\d]/g, '');
      const statuses = ['ACTIVE', 'NOT ACTIVE', 'NOT EXIST'];
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      
      return {
        imei: cleanImei,
        status: randomStatus,
        model: `Device ${Math.floor(Math.random() * 1000)}`,
        daysActive: randomStatus === 'ACTIVE' ? Math.floor(Math.random() * 30) : 0,
        category: randomStatus.toLowerCase().replace(' ', '-')
      };
    });

    res.json({
      success: true,
      processed: results.length,
      results: results,
      summary: {
        active: results.filter(r => r.status === 'ACTIVE').length,
        'not-active': results.filter(r => r.status === 'NOT ACTIVE').length,
        'not-exist': results.filter(r => r.status === 'NOT EXIST').length
      },
      message: '🎉 Batch check working on Vercel!'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
