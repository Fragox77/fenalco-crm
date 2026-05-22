const express = require('express');
const router = express.Router();
const Notificacion = require('../models/Notificacion');
const { protect, authorize } = require('../middleware/auth');
const { ejecutarCheckNotificaciones } = require('../services/notificationJob');

// GET /api/notificaciones — listar del usuario actual
router.get('/', protect, async (req, res) => {
  const pagina = parseInt(req.query.pagina) || 1;
  const limite = parseInt(req.query.limite) || 20;
  const soloNoLeidas = req.query.soloNoLeidas === 'true';

  const filtro = { ejecutivo: req.user._id };
  if (soloNoLeidas) filtro.leida = false;

  const [notificaciones, total] = await Promise.all([
    Notificacion.find(filtro)
      .sort({ createdAt: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite)
      .populate('afiliado', 'razonSocial nit'),
    Notificacion.countDocuments(filtro),
  ]);

  res.json({ notificaciones, total, paginas: Math.ceil(total / limite), pagina });
});

// GET /api/notificaciones/count — no leídas
router.get('/count', protect, async (req, res) => {
  const count = await Notificacion.countDocuments({
    ejecutivo: req.user._id,
    leida: false,
  });
  res.json({ count });
});

// PATCH /api/notificaciones/leer-todas
router.patch('/leer-todas', protect, async (req, res) => {
  await Notificacion.updateMany(
    { ejecutivo: req.user._id, leida: false },
    { $set: { leida: true } }
  );
  res.json({ ok: true });
});

// PATCH /api/notificaciones/:id/leer
router.patch('/:id/leer', protect, async (req, res) => {
  const notif = await Notificacion.findOne({ _id: req.params.id, ejecutivo: req.user._id });
  if (!notif) return res.status(404).json({ message: 'Notificación no encontrada' });
  notif.leida = true;
  await notif.save();
  res.json(notif);
});

// DELETE /api/notificaciones/:id
router.delete('/:id', protect, async (req, res) => {
  const notif = await Notificacion.findOne({ _id: req.params.id, ejecutivo: req.user._id });
  if (!notif) return res.status(404).json({ message: 'Notificación no encontrada' });
  await notif.deleteOne();
  res.json({ ok: true });
});

// POST /api/notificaciones/ejecutar-check — admin: dispara el job manualmente
router.post('/ejecutar-check', protect, authorize('admin'), async (req, res) => {
  ejecutarCheckNotificaciones().catch(err => console.error('[NotifJob]', err.message));
  res.json({ message: 'Check de notificaciones iniciado' });
});

module.exports = router;
