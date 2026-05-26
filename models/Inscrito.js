const mongoose = require('mongoose');

const inscritoSchema = new mongoose.Schema(
  {
    evento: { type: mongoose.Schema.Types.ObjectId, ref: 'Evento', required: true, index: true },

    nombre:   { type: String, required: [true, 'El nombre es obligatorio'], trim: true },
    apellido: { type: String, trim: true },
    cedula:   { type: String, trim: true },
    cedulaNorm: { type: String, trim: true }, // solo dígitos, para dedup y agregación cross-evento
    email:    { type: String, trim: true, lowercase: true },
    telefono: { type: String, trim: true },
    cargo:    { type: String, trim: true },

    empresa:  { type: String, trim: true },
    afiliado: { type: mongoose.Schema.Types.ObjectId, ref: 'Afiliado' },

    tipoAfiliacion: {
      type: String,
      enum: ['afiliado', 'no_afiliado', 'emprendedor', 'mixto'],
      default: 'no_afiliado',
    },

    estado: { type: String, enum: ['inscrito', 'asistio', 'no_asistio', 'cancelado'], default: 'inscrito' },
    horaCheckin: { type: Date },
    codigo: { type: String, trim: true },
    origen: { type: String, enum: ['manual', 'importacion', 'registro_qr'], default: 'manual' },
    referenciaGrupo: { type: String, trim: true },

    pago: {
      requiere:   { type: Boolean, default: false },
      estado:     { type: String, enum: ['pendiente', 'pagado', 'exento', 'cortesia'], default: 'pendiente' },
      medio:      { type: String, enum: ['en_sitio', 'payu', 'mercadopago', 'transferencia', 'wix', 'otro'] },
      monto:      { type: Number, default: 0 },
      referencia: { type: String, trim: true },
      fechaPago:  { type: Date },
    },

    certificado: {
      elegible: { type: Boolean, default: false },
      emitido:  { type: Boolean, default: false },
      fecha:    { type: Date },
      codigo:   { type: String, trim: true },
    },

    observaciones: { type: String, trim: true },
  },
  { timestamps: true }
);

// cedulaNorm = solo dígitos
inscritoSchema.pre('save', function () {
  this.cedulaNorm = String(this.cedula || '').replace(/\D/g, '');
});

inscritoSchema.index({ evento: 1, cedulaNorm: 1 });
inscritoSchema.index({ afiliado: 1 });

module.exports = mongoose.model('Inscrito', inscritoSchema);
