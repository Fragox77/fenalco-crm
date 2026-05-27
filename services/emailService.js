const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

function createTransporter() {
  if (!process.env.SMTP_USER || process.env.SMTP_USER === 'tu_correo@gmail.com') {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function htmlBase(contenido) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body { margin:0; padding:0; background:#f5f5f5; font-family:Arial,sans-serif; }
  .wrap { max-width:600px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.08); }
  .header { background:#280071; padding:24px 32px; }
  .header img { height:36px; }
  .header h1 { color:#fff; margin:8px 0 0; font-size:18px; font-weight:600; }
  .body { padding:32px; }
  .body p { color:#484954; font-size:14px; line-height:1.6; margin:0 0 16px; }
  table { width:100%; border-collapse:collapse; margin:16px 0; }
  th { background:#f3f0ff; color:#280071; font-size:12px; font-weight:700; text-align:left; padding:8px 12px; text-transform:uppercase; letter-spacing:.05em; }
  td { padding:10px 12px; font-size:13px; border-bottom:1px solid #f0f0f0; color:#333; }
  tr:last-child td { border-bottom:none; }
  .badge-red { display:inline-block; background:#fee2e2; color:#b91c1c; font-size:11px; font-weight:700; padding:2px 8px; border-radius:99px; }
  .btn { display:inline-block; background:#280071; color:#fff!important; text-decoration:none; padding:10px 24px; border-radius:8px; font-size:14px; font-weight:600; margin-top:8px; }
  .footer { padding:16px 32px; background:#f9f9f9; font-size:11px; color:#9ca3af; border-top:1px solid #f0f0f0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>CRM Fenalco — Notificaciones</h1>
  </div>
  <div class="body">${contenido}</div>
  <div class="footer">Este es un mensaje automático. No responda este correo.</div>
</div>
</body>
</html>`;
}

async function enviarAlertaMora(destinatario, afiliados) {
  const transporter = createTransporter();
  if (!transporter) return false;

  const filas = afiliados
    .map(
      a => `<tr>
        <td>${a.razonSocial}</td>
        <td>${a.nit}</td>
        <td><span class="badge-red">${a.diasMora} días</span></td>
        <td>$ ${Number(a.saldoPendiente || 0).toLocaleString('es-CO')}</td>
      </tr>`
    )
    .join('');

  const contenido = `
    <p>Hola <strong>${destinatario.nombre}</strong>,</p>
    <p>Los siguientes afiliados a tu cargo tienen <strong>mora crítica (más de 60 días)</strong> y requieren gestión inmediata:</p>
    <table>
      <thead><tr><th>Razón social</th><th>NIT</th><th>Días mora</th><th>Saldo pendiente</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p>Ingresa al CRM para registrar interacciones y compromisos de pago.</p>
    <a class="btn" href="${process.env.CLIENT_URL || 'http://localhost:5000'}/cartera.html">Ver cartera →</a>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'CRM Fenalco <noreply@fenalco.com>',
      to: destinatario.email,
      subject: `⚠️ Alerta mora crítica — ${afiliados.length} afiliado${afiliados.length !== 1 ? 's' : ''} sin pago`,
      html: htmlBase(contenido),
    });
    return true;
  } catch (err) {
    console.error('[Email] Error al enviar alerta mora:', err.message);
    return false;
  }
}

async function enviarAlertaCompromisosVencidos(destinatario, compromisos) {
  const transporter = createTransporter();
  if (!transporter) return false;

  const filas = compromisos
    .map(
      c => `<tr>
        <td>${c.razonSocial}</td>
        <td>${new Date(c.fechaCompromiso).toLocaleDateString('es-CO')}</td>
        <td>$ ${Number(c.monto || 0).toLocaleString('es-CO')}</td>
        <td>${c.descripcion || '—'}</td>
      </tr>`
    )
    .join('');

  const contenido = `
    <p>Hola <strong>${destinatario.nombre}</strong>,</p>
    <p>Los siguientes compromisos de pago <strong>vencieron sin cumplirse</strong>:</p>
    <table>
      <thead><tr><th>Afiliado</th><th>Fecha compromiso</th><th>Monto</th><th>Descripción</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p>Gestiona el seguimiento de estos acuerdos en el CRM.</p>
    <a class="btn" href="${process.env.CLIENT_URL || 'http://localhost:5000'}/cartera.html">Ver cartera →</a>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'CRM Fenalco <noreply@fenalco.com>',
      to: destinatario.email,
      subject: `📋 Compromisos vencidos — ${compromisos.length} acuerdo${compromisos.length !== 1 ? 's' : ''} sin cumplir`,
      html: htmlBase(contenido),
    });
    return true;
  } catch (err) {
    console.error('[Email] Error al enviar alerta compromisos:', err.message);
    return false;
  }
}

async function enviarAlertaVencimiento(destinatario, afiliados) {
  const transporter = createTransporter();
  if (!transporter) return false;

  const filas = afiliados
    .map(
      a => `<tr>
        <td>${a.razonSocial}</td>
        <td>${a.nit}</td>
        <td>${new Date(a.fechaVencimiento).toLocaleDateString('es-CO')}</td>
        <td><span class="badge-red">${a.diasParaVencer} día${a.diasParaVencer !== 1 ? 's' : ''}</span></td>
      </tr>`
    )
    .join('');

  const contenido = `
    <p>Hola <strong>${destinatario.nombre}</strong>,</p>
    <p>Las siguientes afiliaciones a tu cargo están <strong>próximas a vencer</strong>. Gestiona la renovación antes de la fecha límite:</p>
    <table>
      <thead><tr><th>Razón social</th><th>NIT</th><th>Vence</th><th>Faltan</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p>Ingresa al CRM para registrar la gestión y confirmar la renovación.</p>
    <a class="btn" href="${process.env.CLIENT_URL || 'http://localhost:5000'}/afiliados.html">Ver afiliados →</a>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'CRM Fenalco <noreply@fenalco.com>',
      to: destinatario.email,
      subject: `🔔 Renovaciones próximas — ${afiliados.length} afiliado${afiliados.length !== 1 ? 's' : ''} por vencer`,
      html: htmlBase(contenido),
    });
    return true;
  } catch (err) {
    console.error('[Email] Error al enviar alerta vencimiento:', err.message);
    return false;
  }
}

async function enviarConfirmacionInscripcion(inscrito, evento) {
  const transporter = createTransporter();
  if (!transporter || !inscrito.email) return false;

  let qrBuffer = null;
  try { qrBuffer = await QRCode.toBuffer(String(inscrito.codigo || ''), { width: 220, margin: 1 }); } catch (_e) {}

  const fecha = evento.fechaInicio ? new Date(evento.fechaInicio).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const contenido = `
    <p>Hola <strong>${inscrito.nombre} ${inscrito.apellido || ''}</strong>,</p>
    <p>${evento.formularioConfig?.mensajeConfirmacion || 'Tu inscripción ha sido registrada.'}</p>
    <table>
      <tbody>
        <tr><th>Evento</th><td>${evento.nombre}</td></tr>
        <tr><th>Fecha</th><td>${fecha}</td></tr>
        <tr><th>Lugar</th><td>${evento.lugar || '—'}</td></tr>
        <tr><th>Tu código</th><td><strong>${inscrito.codigo}</strong></td></tr>
      </tbody>
    </table>
    ${qrBuffer ? '<p>Presenta este código QR el día del evento:</p><p><img src="cid:qrcarnet" alt="QR" style="width:180px;height:180px"/></p>' : ''}
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'CRM Fenalco <noreply@fenalco.com>',
      to: inscrito.email,
      subject: `✅ Inscripción confirmada — ${evento.nombre}`,
      html: htmlBase(contenido),
      attachments: qrBuffer ? [{ filename: 'qr.png', content: qrBuffer, cid: 'qrcarnet' }] : [],
    });
    return true;
  } catch (err) {
    console.error('[Email] Error al enviar confirmación de inscripción:', err.message);
    return false;
  }
}

module.exports = { enviarAlertaMora, enviarAlertaCompromisosVencidos, enviarAlertaVencimiento, enviarConfirmacionInscripcion };
