const express = require('express');
const router = express.Router();
const Evento = require('../models/Evento');
const Inscrito = require('../models/Inscrito');
const { apiKey } = require('../middleware/apiKey');
const { resolverAfiliado, validarCupo, generarCodigo } = require('../services/inscripcionService');
const { enviarConfirmacionInscripcion } = require('../services/emailService');

async function getEventoAbierto(slug) {
  const ev = await Evento.findOne({ slug });
  if (!ev || !ev.formularioConfig?.habilitado) { const e = new Error('Formulario no disponible.'); e.status = 404; throw e; }
  if (!['publicado', 'en_curso'].includes(ev.estado)) {
    const e = new Error('Formulario no disponible.'); e.status = 404; throw e;
  }
  if (ev.formularioConfig.fechaCierre && new Date() > new Date(ev.formularioConfig.fechaCierre)) {
    const e = new Error('El formulario está cerrado.'); e.status = 410; throw e;
  }
  return ev;
}

// GET /api/public-forms/:slug → config para que el satélite renderice (sin PII)
router.get('/:slug', apiKey, async (req, res) => {
  try {
    const ev = await getEventoAbierto(req.params.slug);
    res.json({
      evento: { nombre: ev.nombre, fechaInicio: ev.fechaInicio, fechaFin: ev.fechaFin, lugar: ev.lugar, modalidad: ev.modalidad },
      formularioConfig: ev.formularioConfig,
    });
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'Error al cargar el formulario.' }); }
});

// POST /api/public-forms/:slug/inscripciones → registra una inscripción pública
router.post('/:slug/inscripciones', apiKey, async (req, res) => {
  try {
    const ev = await getEventoAbierto(req.params.slug);
    const b = req.body || {};
    const cfg = ev.formularioConfig || {};

    if (!b.nombre || !b.nombre.trim()) return res.status(400).json({ message: 'El nombre es obligatorio.' });

    for (const k of ['apellido', 'cedula', 'telefono', 'cargo', 'empresa']) {
      if (cfg.campos?.[k]?.visible && cfg.campos[k].requerido && !String(b[k] || '').trim()) {
        return res.status(400).json({ message: `El campo ${k} es obligatorio.` });
      }
    }

    const respuestas = {};
    for (const c of (cfg.camposPersonalizados || [])) {
      const val = (b.respuestas || {})[c.clave];
      if (c.requerido && !String(val || '').trim()) return res.status(400).json({ message: `El campo ${c.etiqueta || c.clave} es obligatorio.` });
      if (val !== undefined) respuestas[c.clave] = String(val);
    }

    if (cfg.habeasData?.requerido && !(b.consentimiento && b.consentimiento.autorizado)) {
      return res.status(400).json({ message: 'Debes autorizar el tratamiento de datos para inscribirte.' });
    }

    const { afiliado, tipoAfiliacion } = await resolverAfiliado(b.nit, b.empresa);
    await validarCupo(ev, afiliado, b.empresa, 1);

    const tipoFinal = afiliado ? 'afiliado' : (['no_afiliado', 'emprendedor', 'mixto', 'afiliado'].includes(b.tipoAfiliacionDeclarada) ? b.tipoAfiliacionDeclarada : tipoAfiliacion);

    const insc = new Inscrito({
      evento: ev._id,
      nombre: b.nombre, apellido: b.apellido, cedula: b.cedula, email: b.email,
      telefono: b.telefono, cargo: b.cargo, empresa: b.empresa,
      afiliado, tipoAfiliacion: tipoFinal,
      estado: 'inscrito', origen: 'formulario_publico',
      codigo: generarCodigo(),
      respuestas,
      consentimiento: b.consentimiento ? {
        autorizado: !!b.consentimiento.autorizado, fecha: new Date(),
        version: b.consentimiento.version || cfg.habeasData?.version,
      } : undefined,
    });
    await insc.save();

    enviarConfirmacionInscripcion(insc, ev).catch(() => {});

    res.status(201).json({ codigo: insc.codigo, mensaje: cfg.mensajeConfirmacion || 'Inscripción registrada.' });
  } catch (e) { res.status(e.status || 500).json({ message: e.message || 'No se pudo registrar la inscripción.' }); }
});

module.exports = router;
