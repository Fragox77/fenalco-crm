const mongoose = require('mongoose');

const eventoSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre del evento es obligatorio'],
      trim: true,
    },
    nombreNorm: { type: String, trim: true }, // sin tildes, para búsqueda
    tipo: {
      type: String,
      enum: [
        'rueda_negocio', 'congreso', 'feria', 'seminario',
        'diplomado', 'taller', 'bootcamp', 'networking', 'otro',
      ],
      default: 'otro',
    },
    descripcion: { type: String, trim: true },
    fechaInicio: {
      type: Date,
      required: [true, 'La fecha de inicio es obligatoria'],
    },
    fechaFin: { type: Date },
    lugar: { type: String, trim: true },
    modalidad: {
      type: String,
      enum: ['presencial', 'virtual', 'hibrido'],
      default: 'presencial',
    },
    cupoMaximo:     { type: Number, default: 0, min: 0 }, // 0 = sin límite
    cupoPorEmpresa: { type: Number, default: 0, min: 0 }, // 0 = sin límite por empresa
    estado: {
      type: String,
      enum: ['borrador', 'publicado', 'en_curso', 'finalizado', 'cancelado'],
      default: 'borrador',
    },
    responsable: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notas: { type: String, trim: true },
  },
  { timestamps: true }
);

// nombreNorm sincronizado automáticamente (búsqueda sin tildes), igual que Afiliado
eventoSchema.pre('save', function () {
  if (this.isModified('nombre') || !this.nombreNorm) {
    this.nombreNorm = this.nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
});

eventoSchema.index({ nombreNorm: 1 });
eventoSchema.index({ fechaInicio: -1 });

module.exports = mongoose.model('Evento', eventoSchema);
