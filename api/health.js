module.exports = async (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'IMEI Checker API is running on Vercel!',
    timestamp: new Date().toISOString()
  });
};
