const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  const cookieOptions = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  };

  res.cookie('token', token, cookieOptions);

  user.password = undefined;

  res.status(statusCode).json({
    success: true,
    token,
    user,
  });
};

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email y contraseña requeridos' });
  }

  try {
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    if (!user.activo) {
      return res.status(401).json({ message: 'Cuenta desactivada' });
    }

    user.ultimoAcceso = Date.now();
    await user.save({ validateBeforeSave: false });

    sendToken(user, 200, res);
  } catch (error) {
    res.status(500).json({ message: 'Error del servidor', error: error.message });
  }
});

// POST /api/auth/register  (solo admin)
router.post('/register', protect, authorize('admin'), async (req, res) => {
  const { nombre, email, password, role } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'El email ya está registrado' });
    }

    const user = await User.create({ nombre, email, password, role });
    sendToken(user, 201, res);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear usuario', error: error.message });
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// POST /api/auth/logout
router.post('/logout', protect, (req, res) => {
  res.cookie('token', '', { expires: new Date(0), httpOnly: true });
  res.json({ success: true, message: 'Sesión cerrada' });
});

// GET /api/auth/usuarios — lista para selects (requiere auth)
router.get('/usuarios', protect, async (req, res) => {
  try {
    const usuarios = await User.find({ activo: true }).select('nombre email role').lean();
    res.json({ success: true, usuarios });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
});

// PUT /api/auth/cambiar-password
router.put('/cambiar-password', protect, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body;

  try {
    const user = await User.findById(req.user.id).select('+password');

    if (!(await user.matchPassword(passwordActual))) {
      return res.status(401).json({ message: 'Contraseña actual incorrecta' });
    }

    user.password = passwordNueva;
    await user.save();

    sendToken(user, 200, res);
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar contraseña', error: error.message });
  }
});

module.exports = router;
