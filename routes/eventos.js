const express = require('express');
const router = express.Router();
const Evento = require('../models/Evento');
const { protect, authorize } = require('../middleware/auth');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizar = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// GET /api/eventos → listado con búsqueda, filtros y paginación
router.get('/', protect, async (req, res) => {
  try {
    const { search, estado, tipo, page = 1, limit = 50 } = req.query;
    const conditions = [];
    if (estado) conditions.push({ estado });
    if (tipo) conditions.push({ tipo });
    if (search) {
      const norm = escapeRegex(normalizar(search));
      conditions.push({ nombreNorm: new RegExp(norm, 'i') });
    }
    const query = conditions.length ? { $and: conditions } : {};
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const [eventos, total] = await Promise.all([
      Evento.find(query)
        .sort({ fechaInicio: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('responsable', 'nombre')
        .lean(),
      Evento.countDocuments(query),
    ]);

    res.json({
      eventos,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (error) {
    res.status(500).json({ message: 'No se pudieron cargar los eventos.' });
  }
});

// GET /api/eventos/:id → detalle
router.get('/:id', protect, async (req, res) => {
  try {
    const evento = await Evento.findById(req.params.id)
      .populate('responsable', 'nombre email')
      .lean();
    if (!evento) return res.status(404).json({ message: 'Evento no encontrado.' });
    res.json(evento);
  } catch (error) {
    res.status(500).json({ message: 'No se pudo obtener el evento.' });
  }
});

// POST /api/eventos → crear (admin, ejecutivo)
router.post('/', protect, authorize('admin', 'ejecutivo'), async (req, res) => {
  try {
    const {
      nombre, tipo, descripcion, fechaInicio, fechaFin,
      lugar, modalidad, cupoMaximo, estado, responsable, notas,
    } = req.body;

    if (!nombre || !nombre.trim())
      return res.status(400).json({ message: 'El nombre del evento es obligatorio.' });
    if (!fechaInicio)
      return res.status(400).json({ message: 'La fecha de inicio es obligatoria.' });
    if (fechaFin && new Date(fechaFin) < new Date(fechaInicio))
      return res.status(400).json({ message: 'La fecha de fin no puede ser anterior a la de inicio.' });

    const evento = new Evento({
      nombre, tipo, descripcion, fechaInicio, fechaFin,
      lugar, modalidad, cupoMaximo, estado, notas,
      responsable: responsable || req.user._id,
    });
    await evento.save();
    res.status(201).json(evento);
  } catch (error) {
    res.status(500).json({ message: 'No se pudo crear el evento.' });
  }
});

// PUT /api/eventos/:id → editar (admin, ejecutivo)
router.put('/:id', protect, authorize('admin', 'ejecutivo'), async (req, res) => {
  try {
    const evento = await Evento.findById(req.params.id);
    if (!evento) return res.status(404).json({ message: 'Evento no encontrado.' });

    const campos = [
      'nombre', 'tipo', 'descripcion', 'fechaInicio', 'fechaFin',
      'lugar', 'modalidad', 'cupoMaximo', 'estado', 'responsable', 'notas',
    ];
    campos.forEach((c) => {
      if (req.body[c] !== undefined) evento[c] = req.body[c];
    });

    if (evento.fechaFin && evento.fechaFin < evento.fechaInicio)
      return res.status(400).json({ message: 'La fecha de fin no puede ser anterior a la de inicio.' });

    await evento.save(); // dispara hook → nombreNorm sincronizado
    res.json(evento);
  } catch (error) {
    res.status(500).json({ message: 'No se pudo actualizar el evento.' });
  }
});

// DELETE /api/eventos/:id → eliminar (admin)
router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const evento = await Evento.findByIdAndDelete(req.params.id);
    if (!evento) return res.status(404).json({ message: 'Evento no encontrado.' });
    res.json({ message: 'Evento eliminado.' });
  } catch (error) {
    res.status(500).json({ message: 'No se pudo eliminar el evento.' });
  }
});

module.exports = router;
