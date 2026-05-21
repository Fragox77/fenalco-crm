const mongoose = require('mongoose');

const contactoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  cargo: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  telefono: { type: String, trim: true },
  esPrincipal: { type: Boolean, default: false },
});

const compromisoSchema = new mongoose.Schema({
  fechaCompromiso: { type: Date, required: true },
  monto: { type: Number, required: true },
  descripcion: { type: String, trim: true },
  cumplido: { type: Boolean, default: false },
  ejecutivo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const interaccionSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ['llamada', 'email', 'reunion', 'visita', 'whatsapp', 'otro'],
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
    razonSocialNorm: { type: String, trim: true }, // versión sin tildes para búsqueda
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
      enum: ['al_dia', 'en_mora', 'acuerdo_pago', 'suspendido'],
      default: 'al_dia',
    },
    diasMora: {
      type: Number,
      default: 0,
    },
    valorMembresia: { type: Number },
    cuotaMensual: { type: Number },
    saldoPendiente: { type: Number, default: 0 },
    compromisos: [compromisoSchema],
    notas: { type: String },
    tags: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

// razonSocialNorm se mantiene sincronizado automáticamente al guardar
afiliadoSchema.pre('save', function () {
  if (this.isModified('razonSocial') || !this.razonSocialNorm) {
    this.razonSocialNorm = this.razonSocial
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }
});

afiliadoSchema.index({ razonSocialNorm: 1 });

module.exports = mongoose.model('Afiliado', afiliadoSchema);
