const cron = require('node-cron');
const Afiliado = require('../models/Afiliado');
const User = require('../models/User');
const Notificacion = require('../models/Notificacion');
const { enviarAlertaMora, enviarAlertaCompromisosVencidos, enviarAlertaVencimiento } = require('./emailService');

// Umbrales (en días) para alertar afiliaciones próximas a vencer
const UMBRALES_VENCIMIENTO = [30, 15, 7];

async function ejecutarCheckNotificaciones() {
  console.log('[NotifJob] Ejecutando check de notificaciones:', new Date().toLocaleString('es-CO'));

  try {
    await checkMoraCritica();
    await checkCompromisosVencidos();
    await checkVencimientosProximos();
    console.log('[NotifJob] Check completado.');
  } catch (err) {
    console.error('[NotifJob] Error en check:', err.message);
  }
}

async function checkMoraCritica() {
  const afiliados = await Afiliado.find({
    estadoCartera: 'en_mora',
    diasMora: { $gt: 60 },
    ejecutivoAsignado: { $exists: true },
  }).populate('ejecutivoAsignado', 'nombre email');

  if (!afiliados.length) return;

  // Agrupar por ejecutivo
  const porEjecutivo = {};
  for (const af of afiliados) {
    const ejId = af.ejecutivoAsignado._id.toString();
    if (!porEjecutivo[ejId]) {
      porEjecutivo[ejId] = { ejecutivo: af.ejecutivoAsignado, items: [] };
    }
    porEjecutivo[ejId].items.push(af);
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  for (const ejId of Object.keys(porEjecutivo)) {
    const { ejecutivo, items } = porEjecutivo[ejId];

    for (const af of items) {
      // Evitar duplicar notificación del mismo día
      const existe = await Notificacion.findOne({
        tipo: 'mora_critica',
        afiliado: af._id,
        ejecutivo: ejecutivo._id,
        createdAt: { $gte: hoy },
      });
      if (existe) continue;

      const notif = await Notificacion.create({
        tipo: 'mora_critica',
        titulo: `Mora crítica: ${af.razonSocial}`,
        mensaje: `${af.razonSocial} lleva ${af.diasMora} días en mora con saldo de $${Number(af.saldoPendiente || 0).toLocaleString('es-CO')}.`,
        afiliado: af._id,
        ejecutivo: ejecutivo._id,
      });

      // Enviar email
      const emailOk = await enviarAlertaMora(ejecutivo, [af]);
      if (emailOk) {
        notif.emailEnviado = true;
        await notif.save();
      }
    }
  }
}

async function checkCompromisosVencidos() {
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);

  const afiliados = await Afiliado.find({
    'compromisos.cumplido': false,
    'compromisos.fechaCompromiso': { $lt: hoy },
  }).populate('ejecutivoAsignado', 'nombre email');

  for (const af of afiliados) {
    if (!af.ejecutivoAsignado) continue;

    const compromisoVencidos = af.compromisos.filter(
      c => !c.cumplido && new Date(c.fechaCompromiso) < hoyInicio
    );

    for (const comp of compromisoVencidos) {
      const ejId = (comp.ejecutivo || af.ejecutivoAsignado._id).toString();
      const ejecutivo = await User.findById(ejId).select('nombre email');
      if (!ejecutivo) continue;

      const existe = await Notificacion.findOne({
        tipo: 'compromiso_vencido',
        afiliado: af._id,
        ejecutivo: ejecutivo._id,
        createdAt: { $gte: hoyInicio },
      });
      if (existe) continue;

      const notif = await Notificacion.create({
        tipo: 'compromiso_vencido',
        titulo: `Compromiso vencido: ${af.razonSocial}`,
        mensaje: `El compromiso de pago de $${Number(comp.monto || 0).toLocaleString('es-CO')} del ${new Date(comp.fechaCompromiso).toLocaleDateString('es-CO')} venció sin cumplirse.`,
        afiliado: af._id,
        ejecutivo: ejecutivo._id,
      });

      const emailOk = await enviarAlertaCompromisosVencidos(ejecutivo, [
        {
          razonSocial: af.razonSocial,
          fechaCompromiso: comp.fechaCompromiso,
          monto: comp.monto,
          descripcion: comp.descripcion,
        },
      ]);
      if (emailOk) {
        notif.emailEnviado = true;
        await notif.save();
      }
    }
  }
}

async function checkVencimientosProximos() {
  const hoy = new Date();
  hoy.setUTCHours(0, 0, 0, 0);

  // Construye los rangos [inicio, fin] de cada umbral en una sola consulta
  // Se usa UTC para que coincida con cómo MongoDB almacena las fechas (UTC midnight)
  const rangos = UMBRALES_VENCIMIENTO.map((dias) => {
    const inicio = new Date(hoy);
    inicio.setUTCDate(inicio.getUTCDate() + dias);
    const fin = new Date(inicio);
    fin.setUTCHours(23, 59, 59, 999);
    return { dias, inicio, fin };
  });

  const limiteSuperior = new Date(Math.max(...rangos.map((r) => r.fin.getTime())));

  const afiliados = await Afiliado.find({
    estado: 'activo',
    fechaVencimiento: { $gte: hoy, $lte: limiteSuperior },
    ejecutivoAsignado: { $exists: true, $ne: null },
  }).populate('ejecutivoAsignado', 'nombre email');

  if (!afiliados.length) return;

  // Agrupar por ejecutivo solo los que caen exactamente en uno de los umbrales
  const porEjecutivo = {};

  for (const af of afiliados) {
    const venc = new Date(af.fechaVencimiento);
    const rango = rangos.find((r) => venc >= r.inicio && venc <= r.fin);
    if (!rango) continue;

    const ejId = af.ejecutivoAsignado._id.toString();
    if (!porEjecutivo[ejId]) {
      porEjecutivo[ejId] = { ejecutivo: af.ejecutivoAsignado, items: [] };
    }
    porEjecutivo[ejId].items.push({ af, dias: rango.dias });
  }

  for (const ejId of Object.keys(porEjecutivo)) {
    const { ejecutivo, items } = porEjecutivo[ejId];
    const paraEmail = [];

    for (const { af, dias } of items) {
      // Evitar duplicar la notificación del mismo afiliado el mismo día
      const existe = await Notificacion.findOne({
        tipo: 'vencimiento_proximo',
        afiliado: af._id,
        ejecutivo: ejecutivo._id,
        createdAt: { $gte: hoy },
      });
      if (existe) continue;

      await Notificacion.create({
        tipo: 'vencimiento_proximo',
        titulo: `Renovación próxima: ${af.razonSocial}`,
        mensaje: `La afiliación de ${af.razonSocial} vence el ${new Date(af.fechaVencimiento).toLocaleDateString('es-CO')} (faltan ${dias} días). Gestiona la renovación.`,
        afiliado: af._id,
        ejecutivo: ejecutivo._id,
      });

      paraEmail.push({
        razonSocial: af.razonSocial,
        nit: af.nit,
        fechaVencimiento: af.fechaVencimiento,
        diasParaVencer: dias,
      });
    }

    if (paraEmail.length) {
      const emailOk = await enviarAlertaVencimiento(ejecutivo, paraEmail);
      if (emailOk) {
        await Notificacion.updateMany(
          { tipo: 'vencimiento_proximo', ejecutivo: ejecutivo._id, createdAt: { $gte: hoy } },
          { $set: { emailEnviado: true } }
        );
      }
    }
  }
}

function iniciarJob() {
  // Ejecutar todos los días a las 8:00 AM
  cron.schedule('0 8 * * *', ejecutarCheckNotificaciones, {
    timezone: 'America/Bogota',
  });
  console.log('[NotifJob] Job programado: todos los días a las 8:00 AM (Bogotá)');
}

module.exports = { iniciarJob, ejecutarCheckNotificaciones };
