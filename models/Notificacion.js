const mongoose = require('mongoose');

const notificacionSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ['mora_critica', 'compromiso_vencido', 'cuota_vencida'],
      required: true,
    },
    titulo: { type: String, required: true, trim: true },
    mensaje: { type: String, required: true, trim: true },
    afiliado: { type: mongoose.Schema.Types.ObjectId, ref: 'Afiliado' },
    ejecutivo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    leida: { type: Boolean, default: false },
    emailEnviado: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificacionSchema.index({ ejecutivo: 1, leida: 1, createdAt: -1 });

module.exports = mongoose.model('Notificacion', notificacionSchema);
