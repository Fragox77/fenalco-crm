require('dotenv').config();
const mongoose = require('mongoose');
const Inscrito = require('../models/Inscrito');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const docs = await Inscrito.find({ respuestas: { $exists: true, $ne: null } });
  console.log(`Reconstruyendo respuestasTexto en ${docs.length} inscritos...`);
  for (const d of docs) { await d.save(); }
  console.log('Listo.');
  process.exit(0);
})();
