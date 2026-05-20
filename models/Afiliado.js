const mongoose = require('mongoose');

const contactoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  cargo: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  telefono: { type: String, trim: true },
  esPrincipal: { type: Boolean, default: false },
});

const interaccionSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ['llamada', 'email', 'reunion', 'visita', 'otro'],
      required: true,
    },
    fecha: { type: Date, default: Date.now },
    descripcion: { type: String, required: true },
    resultado: { type: String },
    ejecutivo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const afiliadoSchema = new mongoose.Schema(
  {
    razonSocial: {
      type: String,
      required: [true, 'La razón social es obligatoria'],
      trim: true,
    },
    nit: {
      type: String,
      required: [true, 'El NIT es obligatorio'],
      unique: true,
      trim: true,
    },
    sector: {
      type: String,
      trim: true,
    },
    subsector: {
      type: String,
      trim: true,
    },
    tamano: {
      type: String,
      enum: ['micro', 'pequeña', 'mediana', 'grande'],
    },
    estado: {
      type: String,
      enum: ['activo', 'inactivo', 'prospecto', 'retirado'],
      default: 'activo',
    },
    fechaAfiliacion: {
      type: Date,
    },
    fechaVencimiento: {
      type: Date,
    },
    direccion: {
      ciudad: { type: String, trim: true },
      departamento: { type: String, trim: true },
      direccion: { type: String, trim: true },
    },
    contactos: [contactoSchema],
    interacciones: [interaccionSchema],
    ejecutivoAsignado: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    estadoCartera: {
      type: String,
      enum: ['al_dia', 'en_mora', 'acuerdo_pago'],
      default: 'al_dia',
    },
    diasMora: {
      type: Number,
      default: 0,
    },
    notas: {
      type: String,
    },
    tags: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

afiliadoSchema.index({ razonSocial: 'text', nit: 'text' });

module.exports = mongoose.model('Afiliado', afiliadoSchema);
