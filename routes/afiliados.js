const express = require('express');
const router = express.Router();
const Afiliado = require('../models/Afiliado');
const { protect } = require('../middleware/auth');

// GET /api/afiliados/stats
router.get('/stats', protect, async (req, res) => {
  try {
    const [totales, recientes] = await Promise.all([
      Afiliado.aggregate([
        {
          $group: {
            _id: '$estadoCartera',
            count: { $sum: 1 },
          },
        },
      ]),
      Afiliado.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('razonSocial nit estado estadoCartera diasMora createdAt')
        .lean(),
    ]);

    const stats = { total: 0, al_dia: 0, en_mora: 0, acuerdo_pago: 0 };
    totales.forEach(({ _id, count }) => {
      stats[_id] = count;
      stats.total += count;
    });

    res.json({ success: true, stats, recientes });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener estadísticas', error: error.message });
  }
});

// GET /api/afiliados
router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, estadoCartera, estado } = req.query;
    const filter = {};
    if (estadoCartera) filter.estadoCartera = estadoCartera;
    if (estado) filter.estado = estado;
    if (search) filter.$text = { $search: search };

    const [afiliados, total] = await Promise.all([
      Afiliado.find(filter)
        .populate('ejecutivoAsignado', 'nombre')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Afiliado.countDocuments(filter),
    ]);

    res.json({ success: true, afiliados, total, page: Number(page) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener afiliados', error: error.message });
  }
});

module.exports = router;
