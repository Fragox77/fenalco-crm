const express = require('express');
const router = express.Router({ mergeParams: true });
const Inscrito = require('../models/Inscrito');
const Evento = require('../models/Evento');
const Afiliado = require('../models/Afiliado');
const { protect, authorize } = require('../middleware/auth');

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Intenta vincular a un Afiliado por NIT (dígitos) o por razón social normalizada exacta.
// Devuelve { afiliado, tipoAfiliacion }.
async function resolverAfiliado(nit, empresa) {
  const nitNum = soloDigitos(nit);
  let af = null;
  if (nitNum.length >= 5) {
    af = await Afiliado.findOne({ nit: new RegExp(escapeRegex(nitNum)) }).select('_id').lean();
  }
  if (!af && empresa && empresa.trim()) {
    af = await Afiliado.findOne({ razonSocialNorm: normalizar(empresa) }).select('_id').lean();
  }
  return af
    ? { afiliado: af._id, tipoAfiliacion: 'afiliado' }
    : { afiliado: null, tipoAfiliacion: 'no_afiliado' };
}

// Valida cupo total y cupo por empresa. nuevos = cuántos se quieren agregar (>=1).
// Lanza Error con .status si no hay cupo.
async function validarCupo(evento, afiliadoId, empresaNombre, nuevos = 1) {
  if (evento.cupoMaximo && evento.cupoMaximo > 0) {
    const total = await Inscrito.countDocuments({ evento: evento._id, estado: { $ne: 'cancelado' } });
    if (total + nuevos > evento.cupoMaximo) {
      const e = new Error(`Cupo del evento completo (${evento.cupoMaximo}).`); e.status = 400; throw e;
    }
  }
  if (evento.cupoPorEmpresa && evento.cupoPorEmpresa > 0) {
    const filtro = { evento: evento._id, estado: { $ne: 'cancelado' } };
    if (afiliadoId) filtro.afiliado = afiliadoId;
    else if (empresaNombre) filtro.empresa = empresaNombre;
    else return; // sin empresa identificable no se aplica el límite por empresa
    const ya = await Inscrito.countDocuments(filtro);
    if (ya + nuevos > evento.cupoPorEmpresa) {
      const e = new Error(`Cupo por empresa completo (${evento.cupoPorEmpresa} por empresa).`); e.status = 400; throw e;
    }
  }
}

async function getEvento(req) {
  const ev = await Evento.findById(req.params.eventoId).lean();
  if (!ev) { const e = new Error('Evento no encontrado.'); e.status = 404; throw e; }
  return ev;
}

// GET  lista con búsqueda, filtro de estado y paginación
router.get('/', protect, async (req, res) => {
  try {
    const { search, estado, page = 1, limit = 50 } = req.query;
    const cond = { evento: req.params.eventoId };
    if (estado) cond.estado = estado;
    if (search) {
      const q = escapeRegex(normalizar(search));
      const num = soloDigitos(search);
      cond.$or = [
        { nombre:   new RegExp(q, 'i') },
        { apellido: new RegExp(q, 'i') },
        { empresa:  new RegExp(q, 'i') },
        { codigo:   new RegExp(q, 'i') },
        ...(num.length >= 4 ? [{ cedulaNorm: new RegExp(num) }] : []),
      ];
    }
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const [inscritos, total] = await Promise.all([
      Inscrito.find(cond)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('afiliado', 'razonSocial nit')
        .lean(),
      Inscrito.countDocuments(cond),
    ]);
    res.json({ inscritos, total, page: pageNum, totalPages: Math.ceil(total / limitNum) || 1 });
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'No se pudieron cargar los inscritos.' }); }
});

// GET  resumen (conteos para el encabezado del detalle)
router.get('/resumen', protect, async (req, res) => {
  try {
    const eventoId = req.params.eventoId;
    const [total, asistio, porEmpresa] = await Promise.all([
      Inscrito.countDocuments({ evento: eventoId, estado: { $ne: 'cancelado' } }),
      Inscrito.countDocuments({ evento: eventoId, estado: 'asistio' }),
      Inscrito.distinct('empresa', { evento: eventoId, estado: { $ne: 'cancelado' } }),
    ]);
    res.json({ total, asistio, pendientes: total - asistio, empresas: porEmpresa.filter(Boolean).length });
  } catch (e) { res.status(500).json({ message: 'No se pudo cargar el resumen.' }); }
});

// POST  crear un inscrito
router.post('/', protect, authorize('admin', 'ejecutivo'), async (req, res) => {
  try {
    const evento = await getEvento(req);
    const b = req.body || {};
    if (!b.nombre || !b.nombre.trim()) return res.status(400).json({ message: 'El nombre es obligatorio.' });

    const { afiliado, tipoAfiliacion } = await resolverAfiliado(b.nit || b.cedulaAfiliado, b.empresa);
    await validarCupo(evento, afiliado, b.empresa, 1);

    const insc = new Inscrito({
      evento: evento._id,
      nombre: b.nombre, apellido: b.apellido, cedula: b.cedula, email: b.email,
      telefono: b.telefono, cargo: b.cargo, empresa: b.empresa,
      afiliado,
      tipoAfiliacion: b.tipoAfiliacion || tipoAfiliacion,
      estado: b.estado || 'inscrito',
      codigo: b.codigo, origen: 'manual', referenciaGrupo: b.referenciaGrupo,
      observaciones: b.observaciones,
      pago: b.pago, certificado: b.certificado,
    });
    await insc.save();
    res.status(201).json(insc);
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'No se pudo crear el inscrito.' }); }
});

// POST  alta en lote (una empresa inscribe a varias personas)
// body: { empresa, nit, personas: [{ nombre, apellido, cedula, cargo, email, telefono }], referenciaGrupo }
router.post('/lote', protect, authorize('admin', 'ejecutivo'), async (req, res) => {
  try {
    const evento = await getEvento(req);
    const b = req.body || {};
    const personas = Array.isArray(b.personas) ? b.personas.filter(p => p && p.nombre && p.nombre.trim()) : [];
    if (!personas.length) return res.status(400).json({ message: 'Agrega al menos una persona con nombre.' });

    const { afiliado, tipoAfiliacion } = await resolverAfiliado(b.nit, b.empresa);
    await validarCupo(evento, afiliado, b.empresa, personas.length);

    const grupo = b.referenciaGrupo || ('LOTE-' + Date.now());
    const creados = [];
    for (const p of personas) {
      const insc = new Inscrito({
        evento: evento._id, empresa: b.empresa, afiliado, tipoAfiliacion,
        nombre: p.nombre, apellido: p.apellido, cedula: p.cedula, cargo: p.cargo,
        email: p.email, telefono: p.telefono,
        origen: 'manual', referenciaGrupo: grupo,
      });
      await insc.save();
      creados.push(insc);
    }
    res.status(201).json({ creados: creados.length, referenciaGrupo: grupo });
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'No se pudo inscribir el lote.' }); }
});

// PUT  editar un inscrito
router.put('/:id', protect, authorize('admin', 'ejecutivo'), async (req, res) => {
  try {
    const insc = await Inscrito.findOne({ _id: req.params.id, evento: req.params.eventoId });
    if (!insc) return res.status(404).json({ message: 'Inscrito no encontrado.' });
    const campos = ['nombre', 'apellido', 'cedula', 'email', 'telefono', 'cargo', 'empresa', 'afiliado',
      'tipoAfiliacion', 'estado', 'horaCheckin', 'codigo', 'observaciones', 'pago', 'certificado'];
    campos.forEach((c) => { if (req.body[c] !== undefined) insc[c] = req.body[c]; });
    await insc.save(); // dispara hook → cedulaNorm
    res.json(insc);
  } catch (e) { res.status(500).json({ message: 'No se pudo actualizar el inscrito.' }); }
});

// PATCH  check-in (marca asistió + hora)
router.patch('/:id/checkin', protect, authorize('admin', 'ejecutivo'), async (req, res) => {
  try {
    const insc = await Inscrito.findOneAndUpdate(
      { _id: req.params.id, evento: req.params.eventoId },
      { estado: 'asistio', horaCheckin: new Date() },
      { new: true }
    );
    if (!insc) return res.status(404).json({ message: 'Inscrito no encontrado.' });
    res.json(insc);
  } catch (e) { res.status(500).json({ message: 'No se pudo registrar el check-in.' }); }
});

// DELETE  eliminar
router.delete('/:id', protect, authorize('admin', 'ejecutivo'), async (req, res) => {
  try {
    const insc = await Inscrito.findOneAndDelete({ _id: req.params.id, evento: req.params.eventoId });
    if (!insc) return res.status(404).json({ message: 'Inscrito no encontrado.' });
    res.json({ message: 'Inscrito eliminado.' });
  } catch (e) { res.status(500).json({ message: 'No se pudo eliminar el inscrito.' }); }
});

// ── Importación CSV ──────────────────────────────────────────────────────────
const xlsx = require('xlsx');

// Normaliza encabezados del CSV a las llaves internas conocidas.
const MAPEO_COL = {
  nombre:'nombre', nombres:'nombre', apellido:'apellido', apellidos:'apellido',
  empresa:'empresa', razonsocial:'empresa', 'razon social':'empresa',
  cargo:'cargo', cedula:'cedula', documento:'cedula', cc:'cedula',
  nit:'nit', telefono:'telefono', celular:'telefono', email:'email', correo:'email',
  codigo:'codigo', estado:'estado', hora:'horaCheckin', horacheckin:'horaCheckin', observaciones:'observaciones',
};
const normCol = (h) => String(h || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// POST  importar  body: { csv: "<texto>" }
router.post('/importar', protect, authorize('admin', 'ejecutivo'), async (req, res) => {
  try {
    const evento = await getEvento(req);
    const csv = req.body && req.body.csv;
    if (!csv || !String(csv).trim()) return res.status(400).json({ message: 'No se recibió contenido CSV.' });

    const wb = xlsx.read(String(csv), { type: 'string' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filasRaw = xlsx.utils.sheet_to_json(hoja, { defval: '' });
    if (!filasRaw.length) return res.status(400).json({ message: 'El CSV no tiene filas.' });

    // Renombrar columnas según MAPEO_COL
    const filas = filasRaw.map((r) => {
      const o = {};
      Object.keys(r).forEach((k) => { const dest = MAPEO_COL[normCol(k)]; if (dest) o[dest] = r[k]; });
      return o;
    }).filter((r) => r.nombre && String(r.nombre).trim());

    let creados = 0, actualizados = 0;
    const errores = [];
    for (let idx = 0; idx < filas.length; idx++) {
      const f = filas[idx];
      try {
        const cedulaNorm = soloDigitos(f.cedula);
        const { afiliado, tipoAfiliacion } = await resolverAfiliado(f.nit, f.empresa);
        const estado = normalizar(f.estado) === 'asistio' ? 'asistio' : 'inscrito';
        const datos = {
          evento: evento._id,
          nombre: f.nombre, apellido: f.apellido, cedula: f.cedula, cargo: f.cargo,
          empresa: f.empresa, email: f.email, telefono: f.telefono, codigo: f.codigo,
          afiliado, tipoAfiliacion, estado, origen: 'importacion',
          horaCheckin: estado === 'asistio' ? (f.horaCheckin ? new Date(f.horaCheckin) : new Date()) : undefined,
          observaciones: f.observaciones,
        };
        // dedup por cédula dentro del evento (si hay cédula)
        let existente = null;
        if (cedulaNorm) existente = await Inscrito.findOne({ evento: evento._id, cedulaNorm });
        if (existente) {
          Object.assign(existente, datos);
          await existente.save();
          actualizados++;
        } else {
          await new Inscrito(datos).save();
          creados++;
        }
      } catch (e) { errores.push({ fila: idx + 2, motivo: e.message }); }
    }
    res.json({ creados, actualizados, errores, totalFilas: filas.length });
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'No se pudo importar el CSV.' }); }
});

module.exports = router;
