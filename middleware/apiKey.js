const apiKey = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!process.env.SATELITE_API_KEY || key !== process.env.SATELITE_API_KEY) {
    return res.status(401).json({ message: 'No autorizado.' });
  }
  next();
};
module.exports = { apiKey };
