const express = require('express');
const router = express.Router();
const Afiliado = require('../models/Afiliado');
const { protect } = require('../middleware/auth');

// ── helpers ───────────────────────────────────────────────────
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Construye condiciones $or para búsqueda por nombre (sin tildes) y NIT (sin separadores)
const buildSearch = (search) => {
  const norm       = escapeRegex(search.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  // Intercala [.\-]? entre cada carácter para que "900889" encuentre "900.889.001-0"
  const nitPattern = search.replace(/\./g, '').replace(/-/g, '').split('').map(escapeRegex).join('[.\\-]?');
  return { $or: [
    { razonSocialNorm: new RegExp(norm,       'i') },
    { nit:             new RegExp(nitPattern, 'i') },
  ]};
};

// GET /api/afiliados/stats
router.get('/stats', protect, async (req, res) => {
  try {
    const [totales, recientes] = await Promise.all([
      Afiliado.aggregate([{ $group: { _id: '$estadoCartera', count: { $sum: 1 } } }]),
      Afiliado.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('razonSocial nit estado estadoCartera diasMora createdAt')
        .lean(),
    ]);
    const stats = { total: 0, al_dia: 0, en_mora: 0, acuerdo_pago: 0 };
    totales.forEach(({ _id, count }) => { stats[_id] = count; stats.total += count; });
    res.json({ success: true, stats, recientes });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener estadísticas', error: error.message });
  }
});

// GET /api/afiliados/cartera/resumen   ← debe ir antes de /:id
router.get('/cartera/resumen', protect, async (req, res) => {
  try {
    const [moras, countAcuerdos] = await Promise.all([
      Afiliado.aggregate([
        { $match: { estadoCartera: 'en_mora' } },
        { $group: { _id: null, totalMora: { $sum: '$saldoPendiente' }, countMora: { $sum: 1 } } },
      ]),
      Afiliado.countDocuments({ estadoCartera: 'acuerdo_pago' }),
    ]);
    res.json({
      success: true,
      totalMora: moras[0]?.totalMora || 0,
      countMora: moras[0]?.countMora || 0,
      countAcuerdos,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener resumen', error: error.message });
  }
});

// GET /api/afiliados/cartera/lista     ← debe ir antes de /:id
router.get('/cartera/lista', protect, async (req, res) => {
  try {
    const { search, estadoCartera, rangoDias, page = 1, limit = 50 } = req.query;

    const conditions = [];

    if (estadoCartera) {
      conditions.push({ estadoCartera });
    } else {
      conditions.push({
        $or: [
          { saldoPendiente: { $gt: 0 } },
          { estadoCartera: { $in: ['en_mora', 'acuerdo_pago', 'suspendido'] } },
        ],
      });
    }

    if (rangoDias === '0-30')  conditions.push({ diasMora: { $gte: 1, $lte: 30 } });
    if (rangoDias === '31-60') conditions.push({ diasMora: { $gte: 31, $lte: 60 } });
    if (rangoDias === '61+')   conditions.push({ diasMora: { $gt: 60 } });

    if (search) {
      conditions.push(buildSearch(search));
    }

    const filter = conditions.length > 1 ? { $and: conditions } : conditions[0] || {};

    const [afiliados, total] = await Promise.all([
      Afiliado.find(filter)
        .populate('ejecutivoAsignado', 'nombre')
        .sort({ diasMora: -1, saldoPendiente: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .select('razonSocial nit diasMora saldoPendiente fechaVencimiento estadoCartera ejecutivoAsignado interacciones compromisos')
        .lean(),
      Afiliado.countDocuments(filter),
    ]);

    afiliados.forEach((a) => {
      const sorted = (a.interacciones || []).sort((x, y) => new Date(y.fecha) - new Date(x.fecha));
      a.ultimoContacto = sorted[0] || null;
      a.historialReciente = sorted.slice(0, 5);
      delete a.interacciones;
    });

    res.json({ success: true, afiliados, total, page: Number(page) });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener cartera', error: error.message });
  }
});

// GET /api/afiliados
router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, estadoCartera, estado } = req.query;
    const filter = {};
    if (estadoCartera) filter.estadoCartera = estadoCartera;
    if (estado) filter.estado = estado;
    if (search) {
      Object.assign(filter, buildSearch(search));
    }
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

// GET /api/afiliados/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const afiliado = await Afiliado.findById(req.params.id)
      .populate('ejecutivoAsignado', 'nombre email')
      .populate('interacciones.ejecutivo', 'nombre')
      .populate('compromisos.ejecutivo', 'nombre')
      .lean();
    if (!afiliado) return res.status(404).json({ message: 'Afiliado no encontrado' });
    afiliado.interacciones = (afiliado.interacciones || [])
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 10);
    afiliado.compromisos = (afiliado.compromisos || [])
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
    res.json({ success: true, afiliado });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener afiliado', error: error.message });
  }
});

// POST /api/afiliados/:id/contacto
router.post('/:id/contacto', protect, async (req, res) => {
  const { tipo, descripcion, resultado } = req.body;
  if (!tipo || !descripcion)
    return res.status(400).json({ message: 'Tipo y descripción son obligatorios' });
  try {
    const afiliado = await Afiliado.findByIdAndUpdate(
      req.params.id,
      { $push: { interacciones: { $each: [{ tipo, descripcion, resultado, ejecutivo: req.user._id, fecha: new Date() }], $position: 0 } } },
      { new: true, runValidators: true }
    );
    if (!afiliado) return res.status(404).json({ message: 'Afiliado no encontrado' });
    res.json({ success: true, message: 'Contacto registrado correctamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al registrar contacto', error: error.message });
  }
});

// POST /api/afiliados/:id/compromiso
router.post('/:id/compromiso', protect, async (req, res) => {
  const { fechaCompromiso, monto, descripcion } = req.body;
  if (!fechaCompromiso || !monto)
    return res.status(400).json({ message: 'Fecha y monto son obligatorios' });
  try {
    const afiliado = await Afiliado.findByIdAndUpdate(
      req.params.id,
      {
        estadoCartera: 'acuerdo_pago',
        $push: {
          compromisos: {
            $each: [{ fechaCompromiso: new Date(fechaCompromiso), monto: Number(monto), descripcion, ejecutivo: req.user._id }],
            $position: 0,
          },
        },
      },
      { new: true, runValidators: true }
    );
    if (!afiliado) return res.status(404).json({ message: 'Afiliado no encontrado' });
    res.json({ success: true, message: 'Compromiso registrado. Estado actualizado a acuerdo de pago.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al registrar compromiso', error: error.message });
  }
});

// PUT /api/afiliados/:id
router.put('/:id', protect, async (req, res) => {
  try {
    const {
      razonSocial, nit, sector, subsector, tamano, estado,
      estadoCartera, diasMora, saldoPendiente, valorMembresia, cuotaMensual,
      ejecutivoAsignado, direccion, email, telefono,
    } = req.body;

    const afiliado = await Afiliado.findById(req.params.id);
    if (!afiliado) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const campos = { razonSocial, nit, sector, subsector, tamano, estado, estadoCartera, valorMembresia, cuotaMensual };
    Object.entries(campos).forEach(([k, v]) => { if (v !== undefined) afiliado[k] = v; });

    if (diasMora       !== undefined) afiliado.diasMora       = Number(diasMora);
    if (saldoPendiente !== undefined) afiliado.saldoPendiente = Number(saldoPendiente);
    if (ejecutivoAsignado !== undefined) afiliado.ejecutivoAsignado = ejecutivoAsignado || null;

    if (direccion) {
      afiliado.direccion = {
        ...(afiliado.direccion?.toObject ? afiliado.direccion.toObject() : afiliado.direccion),
        ...direccion,
      };
    }

    // Actualiza email/teléfono del contacto principal
    if (email !== undefined || telefono !== undefined) {
      const idx = afiliado.contactos.findIndex(c => c.esPrincipal);
      const i   = idx >= 0 ? idx : 0;
      if (afiliado.contactos[i]) {
        if (email    !== undefined) afiliado.contactos[i].email    = email;
        if (telefono !== undefined) afiliado.contactos[i].telefono = telefono;
      }
    }

    await afiliado.save();
    res.json({ success: true, message: 'Afiliado actualizado correctamente' });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'El NIT ya está registrado para otro afiliado' });
    res.status(500).json({ message: 'Error al actualizar afiliado', error: error.message });
  }
});

module.exports = router;
