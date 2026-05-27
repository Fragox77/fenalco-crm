const Inscrito = require('../models/Inscrito');
const Afiliado = require('../models/Afiliado');

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function resolverAfiliado(nit, empresa) {
  const nitNum = soloDigitos(nit);
  let af = null;
  if (nitNum.length >= 5) af = await Afiliado.findOne({ nit: new RegExp(escapeRegex(nitNum)) }).select('_id').lean();
  if (!af && empresa && empresa.trim()) af = await Afiliado.findOne({ razonSocialNorm: normalizar(empresa) }).select('_id').lean();
  return af ? { afiliado: af._id, tipoAfiliacion: 'afiliado' } : { afiliado: null, tipoAfiliacion: 'no_afiliado' };
}

async function validarCupo(evento, afiliadoId, empresaNombre, nuevos = 1) {
  if (evento.cupoMaximo > 0) {
    const total = await Inscrito.countDocuments({ evento: evento._id, estado: { $ne: 'cancelado' } });
    if (total + nuevos > evento.cupoMaximo) { const e = new Error(`Cupo del evento completo (${evento.cupoMaximo}).`); e.status = 400; throw e; }
  }
  if (evento.cupoPorEmpresa > 0) {
    const filtro = { evento: evento._id, estado: { $ne: 'cancelado' } };
    if (afiliadoId) filtro.afiliado = afiliadoId; else if (empresaNombre) filtro.empresa = empresaNombre; else return;
    const ya = await Inscrito.countDocuments(filtro);
    if (ya + nuevos > evento.cupoPorEmpresa) { const e = new Error(`Cupo por empresa completo (${evento.cupoPorEmpresa}).`); e.status = 400; throw e; }
  }
}

function generarCodigo(prefix = 'EVT') {
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

module.exports = { resolverAfiliado, validarCupo, generarCodigo, normalizar, soloDigitos };
