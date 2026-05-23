/**
 * scripts/inspect-routes.js
 * Lista todas las rutas HTTP montadas en la app sin levantar servidor ni conectar DB.
 * Uso: npm run routes
 */
const express = require('express');

const app = express();
app.use(express.json());

// En Express v5 los layers no exponen el prefijo en layer.path,
// así que capturamos los montajes interceptando app.use antes de que ocurran.
const montajes = []; // [{ prefix, router }]
const _use = app.use.bind(app);
app.use = function (path, ...args) {
  if (typeof path === 'string' && args.length > 0) {
    montajes.push({ prefix: path, router: args[0] });
  }
  return _use(path, ...args);
};

app.use('/api/auth',           require('../routes/auth'));
app.use('/api/afiliados',      require('../routes/afiliados'));
app.use('/api/notificaciones', require('../routes/notificaciones'));

// Restaurar app.use y listar
app.use = _use;

function listarRutas(stack, base = '') {
  for (const layer of stack || []) {
    if (layer.route) {
      const metodos = Object.keys(layer.route.methods || {}).join(',').toUpperCase();
      console.log(`  ${metodos.padEnd(7)} ${base}${layer.route.path}`);
    } else if (layer.handle && layer.handle.stack) {
      // buscar si este handler coincide con algún montaje registrado
      const montaje = montajes.find((m) => m.router === layer.handle);
      const prefijo = montaje ? montaje.prefix : '';
      listarRutas(layer.handle.stack, base + prefijo);
    }
  }
}

console.log('\nRutas montadas en CRM Fenalco:\n');
listarRutas(app.router.stack);
console.log('');
