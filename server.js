require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const afiliadosRoutes = require('./routes/afiliados');
const notificacionesRoutes = require('./routes/notificaciones');
const eventosRoutes = require('./routes/eventos');
const publicFormsRoutes = require('./routes/publicForms');
const { iniciarJob } = require('./services/notificationJob');

const path = require('path');

const app = express();

connectDB();

app.use(express.static(path.join(__dirname, 'public')));

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/afiliados', afiliadosRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api/eventos', eventosRoutes);
app.use('/api/public-forms', publicFormsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  if (req.accepts('html')) return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  res.status(404).json({ message: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Error interno del servidor',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  iniciarJob();
});
