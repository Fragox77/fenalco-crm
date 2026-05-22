const cron = require('node-cron');
const Afiliado = require('../models/Afiliado');
const User = require('../models/User');
const Notificacion = require('../models/Notificacion');
const { enviarAlertaMora, enviarAlertaCompromisosVencidos } = require('./emailService');

async function ejecutarCheckNotificaciones() {
  console.log('[NotifJob] Ejecutando check de notificaciones:', new Date().toLocaleString('es-CO'));

  try {
    await checkMoraCritica();
    await checkCompromisosVencidos();
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

function iniciarJob() {
  // Ejecutar todos los días a las 8:00 AM
  cron.schedule('0 8 * * *', ejecutarCheckNotificaciones, {
    timezone: 'America/Bogota',
  });
  console.log('[NotifJob] Job programado: todos los días a las 8:00 AM (Bogotá)');
}

module.exports = { iniciarJob, ejecutarCheckNotificaciones };
