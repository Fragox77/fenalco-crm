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
    const [totales, recientes, moraCritica] = await Promise.all([
      Afiliado.aggregate([{ $group: { _id: '$estadoCartera', count: { $sum: 1 } } }]),
      Afiliado.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('razonSocial nit estado estadoCartera diasMora createdAt')
        .lean(),
      Afiliado.find({ diasMora: { $gt: 60 } })
        .sort({ diasMora: -1, saldoPendiente: -1 })
        .limit(5)
        .select('razonSocial nit diasMora saldoPendiente estadoCartera')
        .lean(),
    ]);
    const stats = { total: 0, al_dia: 0, en_mora: 0, acuerdo_pago: 0 };
    totales.forEach(({ _id, count }) => { stats[_id] = count; stats.total += count; });
    res.json({ success: true, stats, recientes, moraCritica });
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

// GET /api/afiliados/export/excel
router.get('/export/excel', protect, async (req, res) => {
  try {
    const xlsx = require('xlsx');
    const { search, estadoCartera, estado } = req.query;
    const filter = {};
    if (estadoCartera) filter.estadoCartera = estadoCartera;
    if (estado)        filter.estado = estado;
    if (search)        Object.assign(filter, buildSearch(search));

    const afiliados = await Afiliado.find(filter)
      .populate('ejecutivoAsignado', 'nombre')
      .sort({ createdAt: -1 })
      .lean();

    const carteraLabel = { al_dia: 'Al día', en_mora: 'En mora', acuerdo_pago: 'Acuerdo de pago', suspendido: 'Suspendido' };
    const rows = afiliados.map(a => ({
      'Razón social':    a.razonSocial,
      'NIT':             a.nit,
      'Sector':          a.sector || '',
      'Tamaño':          a.tamano ? a.tamano.charAt(0).toUpperCase() + a.tamano.slice(1) : '',
      'Estado':          a.estado,
      'Cartera':         carteraLabel[a.estadoCartera] || a.estadoCartera,
      'Días mora':       a.diasMora || 0,
      'Saldo pendiente': a.saldoPendiente || 0,
      'Ciudad':          a.direccion?.ciudad || '',
      'Ejecutivo':       a.ejecutivoAsignado?.nombre || '',
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, 'Afiliados');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=afiliados.xlsx');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ message: 'Error al exportar', error: err.message });
  }
});

// GET /api/afiliados/cartera/export/excel
router.get('/cartera/export/excel', protect, async (req, res) => {
  try {
    const xlsx = require('xlsx');
    const { search, estadoCartera, rangoDias } = req.query;

    const conditions = [];
    if (estadoCartera) {
      conditions.push({ estadoCartera });
    } else {
      conditions.push({ $or: [{ saldoPendiente: { $gt: 0 } }, { estadoCartera: { $in: ['en_mora', 'acuerdo_pago', 'suspendido'] } }] });
    }
    if (rangoDias === '0-30')  conditions.push({ diasMora: { $gte: 1, $lte: 30 } });
    if (rangoDias === '31-60') conditions.push({ diasMora: { $gte: 31, $lte: 60 } });
    if (rangoDias === '61+')   conditions.push({ diasMora: { $gt: 60 } });
    if (search) conditions.push(buildSearch(search));

    const filter = conditions.length > 1 ? { $and: conditions } : conditions[0] || {};

    const afiliados = await Afiliado.find(filter)
      .populate('ejecutivoAsignado', 'nombre')
      .sort({ diasMora: -1, saldoPendiente: -1 })
      .lean();

    const carteraLabel = { al_dia: 'Al día', en_mora: 'En mora', acuerdo_pago: 'Acuerdo de pago', suspendido: 'Suspendido' };
    const rows = afiliados.map(a => ({
      'Razón social':      a.razonSocial,
      'NIT':               a.nit,
      'Estado cartera':    carteraLabel[a.estadoCartera] || a.estadoCartera,
      'Días mora':         a.diasMora || 0,
      'Saldo pendiente':   a.saldoPendiente || 0,
      'Fecha vencimiento': a.fechaVencimiento ? new Date(a.fechaVencimiento).toLocaleDateString('es-CO') : '',
      'Ejecutivo':         a.ejecutivoAsignado?.nombre || '',
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, 'Cartera');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=cartera.xlsx');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ message: 'Error al exportar', error: err.message });
  }
});

// GET /api/afiliados/reportes
router.get('/reportes', protect, async (req, res) => {
  try {
    const seisAtras = new Date();
    seisAtras.setMonth(seisAtras.getMonth() - 5);
    seisAtras.setDate(1);
    seisAtras.setHours(0, 0, 0, 0);

    const [distribucionCartera, moraRangos, interaccionesPorMes, rankingEjecutivos] = await Promise.all([

      Afiliado.aggregate([
        { $group: { _id: '$estadoCartera', count: { $sum: 1 } } },
      ]),

      Afiliado.aggregate([
        { $match: { diasMora: { $gt: 0 } } },
        { $bucket: {
          groupBy: '$diasMora',
          boundaries: [1, 31, 61, 91],
          default: '91+',
          output: { count: { $sum: 1 }, monto: { $sum: '$saldoPendiente' } },
        }},
      ]),

      Afiliado.aggregate([
        { $unwind: '$interacciones' },
        { $match: { 'interacciones.fecha': { $gte: seisAtras } } },
        { $group: {
          _id: { year: { $year: '$interacciones.fecha' }, month: { $month: '$interacciones.fecha' } },
          count: { $sum: 1 },
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      Afiliado.aggregate([
        { $group: {
          _id: '$ejecutivoAsignado',
          asignados: { $sum: 1 },
          enMora: { $sum: { $cond: [{ $eq: ['$estadoCartera', 'en_mora'] }, 1, 0] } },
          saldoGestionado: { $sum: '$saldoPendiente' },
          totalInteracciones: { $sum: { $size: { $ifNull: ['$interacciones', []] } } },
        }},
        { $match: { _id: { $ne: null } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'ejecutivo' } },
        { $unwind: { path: '$ejecutivo', preserveNullAndEmptyArrays: true } },
        { $project: {
          nombre: { $ifNull: ['$ejecutivo.nombre', 'Sin asignar'] },
          asignados: 1, enMora: 1, saldoGestionado: 1, totalInteracciones: 1,
        }},
        { $sort: { asignados: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.json({ success: true, distribucionCartera, moraRangos, interaccionesPorMes, rankingEjecutivos });
  } catch (error) {
    res.status(500).json({ message: 'Error al generar reportes', error: error.message });
  }
});

// GET /api/afiliados/ejecutivos/rendimiento
router.get('/ejecutivos/rendimiento', protect, async (req, res) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const rendimiento = await Afiliado.aggregate([
      {
        $group: {
          _id: '$ejecutivoAsignado',
          asignados: { $sum: 1 },
          enMora: { $sum: { $cond: [{ $eq: ['$estadoCartera', 'en_mora'] }, 1, 0] } },
          acuerdoPago: { $sum: { $cond: [{ $eq: ['$estadoCartera', 'acuerdo_pago'] }, 1, 0] } },
          saldoGestionado: { $sum: '$saldoPendiente' },
          totalInteracciones: { $sum: { $size: { $ifNull: ['$interacciones', []] } } },
          interaccionesLlamada: { $sum: { $size: { $filter: { input: { $ifNull: ['$interacciones', []] }, as: 'i', cond: { $eq: ['$$i.tipo', 'llamada'] } } } } },
          interaccionesEmail: { $sum: { $size: { $filter: { input: { $ifNull: ['$interacciones', []] }, as: 'i', cond: { $eq: ['$$i.tipo', 'email'] } } } } },
          interaccionesReunion: { $sum: { $size: { $filter: { input: { $ifNull: ['$interacciones', []] }, as: 'i', cond: { $eq: ['$$i.tipo', 'reunion'] } } } } },
          interaccionesWhatsapp: { $sum: { $size: { $filter: { input: { $ifNull: ['$interacciones', []] }, as: 'i', cond: { $eq: ['$$i.tipo', 'whatsapp'] } } } } },
          interaccionesVisita: { $sum: { $size: { $filter: { input: { $ifNull: ['$interacciones', []] }, as: 'i', cond: { $eq: ['$$i.tipo', 'visita'] } } } } },
          totalCompromisos: { $sum: { $size: { $ifNull: ['$compromisos', []] } } },
          compromisosCumplidos: { $sum: { $size: { $filter: { input: { $ifNull: ['$compromisos', []] }, as: 'c', cond: { $eq: ['$$c.cumplido', true] } } } } },
          compromisosVencidos: { $sum: { $size: { $filter: { input: { $ifNull: ['$compromisos', []] }, as: 'c', cond: { $and: [{ $eq: ['$$c.cumplido', false] }, { $lt: ['$$c.fechaCompromiso', hoy] }] } } } } },
          compromisosPendientes: { $sum: { $size: { $filter: { input: { $ifNull: ['$compromisos', []] }, as: 'c', cond: { $and: [{ $eq: ['$$c.cumplido', false] }, { $gte: ['$$c.fechaCompromiso', hoy] }] } } } } },
        },
      },
      { $match: { _id: { $ne: null } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'ejecutivo' } },
      { $unwind: { path: '$ejecutivo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          nombre: { $ifNull: ['$ejecutivo.nombre', 'Sin asignar'] },
          email: { $ifNull: ['$ejecutivo.email', ''] },
          role: { $ifNull: ['$ejecutivo.role', ''] },
          asignados: 1, enMora: 1, acuerdoPago: 1, saldoGestionado: 1,
          totalInteracciones: 1,
          interaccionesLlamada: 1, interaccionesEmail: 1, interaccionesReunion: 1,
          interaccionesWhatsapp: 1, interaccionesVisita: 1,
          totalCompromisos: 1, compromisosCumplidos: 1, compromisosVencidos: 1, compromisosPendientes: 1,
        },
      },
      { $sort: { totalInteracciones: -1 } },
    ]);

    res.json({ rendimiento });
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener rendimiento', error: err.message });
  }
});

// POST /api/afiliados — Crear nuevo afiliado
router.post('/', protect, async (req, res) => {
  const {
    razonSocial, nit, sector, subsector, tamano,
    estado, estadoCartera, fechaAfiliacion, fechaVencimiento,
    valorMembresia, cuotaMensual, saldoPendiente, diasMora,
    ejecutivoAsignado, direccion, email, telefono, notas,
  } = req.body;

  if (!razonSocial || !nit)
    return res.status(400).json({ message: 'Razón social y NIT son obligatorios' });

  try {
    const existe = await Afiliado.findOne({ nit });
    if (existe)
      return res.status(400).json({ message: 'El NIT ya está registrado' });

    const contactos = (email || telefono)
      ? [{ nombre: razonSocial, email: email || '', telefono: telefono || '', esPrincipal: true }]
      : [];

    const afiliado = await Afiliado.create({
      razonSocial,
      nit,
      sector,
      subsector,
      tamano,
      estado:           estado           || 'activo',
      estadoCartera:    estadoCartera    || 'al_dia',
      fechaAfiliacion:  fechaAfiliacion  ? new Date(fechaAfiliacion) : undefined,
      fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : undefined,
      valorMembresia:   valorMembresia   ? Number(valorMembresia)   : undefined,
      cuotaMensual:     cuotaMensual     ? Number(cuotaMensual)     : undefined,
      saldoPendiente:   saldoPendiente   ? Number(saldoPendiente)   : 0,
      diasMora:         diasMora         ? Number(diasMora)         : 0,
      ejecutivoAsignado: ejecutivoAsignado || undefined,
      direccion,
      contactos,
      notas,
    });

    res.status(201).json({ success: true, message: 'Afiliado creado correctamente', afiliado });
  } catch (error) {
    if (error.code === 11000)
      return res.status(400).json({ message: 'El NIT ya está registrado' });
    res.status(500).json({ message: 'Error al crear afiliado', error: error.message });
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

// PATCH /api/afiliados/:id/compromisos/:compromisoId
router.patch('/:id/compromisos/:compromisoId', protect, async (req, res) => {
  try {
    const result = await Afiliado.updateOne(
      { _id: req.params.id, 'compromisos._id': req.params.compromisoId },
      { $set: { 'compromisos.$.cumplido': true } }
    );
    if (result.matchedCount === 0)
      return res.status(404).json({ message: 'Compromiso no encontrado' });
    res.json({ success: true, message: 'Compromiso marcado como cumplido' });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar', error: err.message });
  }
});

// GET /api/afiliados/:id/interacciones — historial completo sin límite de 10
router.get('/:id/interacciones', protect, async (req, res) => {
  try {
    const afiliado = await Afiliado.findById(req.params.id)
      .select('razonSocial interacciones')
      .populate('interacciones.ejecutivo', 'nombre')
      .lean();
    if (!afiliado) return res.status(404).json({ message: 'Afiliado no encontrado' });
    const interacciones = (afiliado.interacciones || [])
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    res.json({ success: true, razonSocial: afiliado.razonSocial, interacciones });
  } catch (err) {
    res.status(500).json({ message: err.message });
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

// ── GESTIÓN DE CONTACTOS ─────────────────────────────────────

// POST /api/afiliados/:id/contactos
router.post('/:id/contactos', protect, async (req, res) => {
  const { nombre, cargo, email, telefono, esPrincipal } = req.body;
  if (!nombre) return res.status(400).json({ message: 'El nombre es obligatorio' });
  try {
    const afiliado = await Afiliado.findById(req.params.id);
    if (!afiliado) return res.status(404).json({ message: 'Afiliado no encontrado' });
    if (esPrincipal) afiliado.contactos.forEach(c => { c.esPrincipal = false; });
    afiliado.contactos.push({ nombre, cargo, email, telefono, esPrincipal: !!esPrincipal });
    await afiliado.save();
    const nuevo = afiliado.contactos[afiliado.contactos.length - 1];
    res.status(201).json({ success: true, message: 'Contacto añadido', contacto: nuevo });
  } catch (error) {
    res.status(500).json({ message: 'Error al añadir contacto', error: error.message });
  }
});

// PUT /api/afiliados/:id/contactos/:cid
router.put('/:id/contactos/:cid', protect, async (req, res) => {
  const { nombre, cargo, email, telefono, esPrincipal } = req.body;
  if (!nombre) return res.status(400).json({ message: 'El nombre es obligatorio' });
  try {
    const afiliado = await Afiliado.findById(req.params.id);
    if (!afiliado) return res.status(404).json({ message: 'Afiliado no encontrado' });
    const contacto = afiliado.contactos.id(req.params.cid);
    if (!contacto) return res.status(404).json({ message: 'Contacto no encontrado' });
    if (esPrincipal) afiliado.contactos.forEach(c => { c.esPrincipal = false; });
    Object.assign(contacto, { nombre, cargo, email, telefono, esPrincipal: !!esPrincipal });
    await afiliado.save();
    res.json({ success: true, message: 'Contacto actualizado', contacto });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar contacto', error: error.message });
  }
});

// DELETE /api/afiliados/:id/contactos/:cid
router.delete('/:id/contactos/:cid', protect, async (req, res) => {
  try {
    const afiliado = await Afiliado.findById(req.params.id);
    if (!afiliado) return res.status(404).json({ message: 'Afiliado no encontrado' });
    const contacto = afiliado.contactos.id(req.params.cid);
    if (!contacto) return res.status(404).json({ message: 'Contacto no encontrado' });
    const eraPrincipal = contacto.esPrincipal;
    afiliado.contactos.pull({ _id: req.params.cid });
    if (eraPrincipal && afiliado.contactos.length > 0) afiliado.contactos[0].esPrincipal = true;
    await afiliado.save();
    res.json({ success: true, message: 'Contacto eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar contacto', error: error.message });
  }
});

// PATCH /api/afiliados/:id/contactos/:cid/principal
router.patch('/:id/contactos/:cid/principal', protect, async (req, res) => {
  try {
    const afiliado = await Afiliado.findById(req.params.id);
    if (!afiliado) return res.status(404).json({ message: 'Afiliado no encontrado' });
    const contacto = afiliado.contactos.id(req.params.cid);
    if (!contacto) return res.status(404).json({ message: 'Contacto no encontrado' });
    afiliado.contactos.forEach(c => { c.esPrincipal = false; });
    contacto.esPrincipal = true;
    await afiliado.save();
    res.json({ success: true, message: 'Contacto principal actualizado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar contacto principal', error: error.message });
  }
});

module.exports = router;
