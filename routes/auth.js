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

  if (!nombre || !email || !password) {
    return res.status(400).json({ message: 'Nombre, email y contraseña son obligatorios' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'El formato del email no es válido' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'El email ya está registrado' });
    }

    const user = await User.create({ nombre, email, password, role });
    res.status(201).json({
      success: true,
      message: 'Usuario creado correctamente',
      user: { _id: user._id, nombre: user.nombre, email: user.email, role: user.role },
    });
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

// GET /api/auth/admin/usuarios — lista completa (admin)
router.get('/admin/usuarios', protect, authorize('admin'), async (req, res) => {
  try {
    const usuarios = await User.find().select('-password').sort({ createdAt: -1 }).lean();
    res.json({ success: true, usuarios });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/auth/admin/usuarios/:id — actualizar usuario (admin)
router.put('/admin/usuarios/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const { nombre, email, role, activo } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (nombre !== undefined) user.nombre = nombre;
    if (email  !== undefined) user.email  = email;
    if (role   !== undefined) user.role   = role;
    if (activo !== undefined) user.activo = activo;
    await user.save();
    res.json({ success: true, message: 'Usuario actualizado' });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'El email ya está en uso' });
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/auth/admin/usuarios/:id — eliminar usuario (admin)
router.delete('/admin/usuarios/:id', protect, authorize('admin'), async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'No puedes eliminar tu propia cuenta' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json({ success: true, message: 'Usuario eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/auth/admin/usuarios/:id/password — resetear contraseña (admin)
router.patch('/admin/usuarios/:id/password', protect, authorize('admin'), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6)
    return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
  try {
    const user = await User.findById(req.params.id).select('+password');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    user.password = password;
    await user.save();
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/auth/admin/usuarios/:id/estado — activar/desactivar usuario (admin)
router.patch('/admin/usuarios/:id/estado', protect, authorize('admin'), async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ message: 'El campo activo debe ser true o false' });
  }
  if (req.params.id === req.user._id.toString() && activo === false) {
    return res.status(400).json({ message: 'No puedes desactivar tu propia cuenta' });
  }
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { activo },
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json({
      success: true,
      message: activo ? 'Usuario activado' : 'Usuario desactivado',
      user,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
