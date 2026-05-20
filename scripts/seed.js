require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');

const SALT_ROUNDS = 10;

const seed = async () => {
  await connectDB();

  try {
    const db = mongoose.connection;

    await db.collection('users').deleteMany({});
    await db.collection('afiliados').deleteMany({});
    console.log('Colecciones limpiadas...');

    const now = new Date();
    const users = [
      {
        nombre: 'Administrador Fenalco',
        email: 'admin@fenalco.com',
        password: await bcrypt.hash('Admin123!', SALT_ROUNDS),
        role: 'admin', activo: true, createdAt: now, updatedAt: now,
      },
      {
        nombre: 'Ejecutivo Comercial',
        email: 'ejecutivo@fenalco.com',
        password: await bcrypt.hash('Ejecutivo123!', SALT_ROUNDS),
        role: 'ejecutivo', activo: true, createdAt: now, updatedAt: now,
      },
    ];

    const result = await db.collection('users').insertMany(users);
    console.log(`${result.insertedCount} usuarios creados`);

    const ejecutivoId = result.insertedIds[1];

    const afiliados = [
      {
        razonSocial: 'Comercializadora La 14 S.A.',
        nit: '890.300.001-5',
        sector: 'Comercio', subsector: 'Retail', tamano: 'grande', estado: 'activo',
        estadoCartera: 'al_dia', diasMora: 0, saldoPendiente: 0,
        cuotaMensual: 850000, valorMembresia: 2500000,
        fechaAfiliacion: new Date('2020-01-15'), fechaVencimiento: new Date('2026-01-15'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Calle 1 # 1-01' },
        contactos: [{ nombre: 'Carlos Pérez', cargo: 'Gerente General', email: 'cperez@la14.com', telefono: '3001234567', esPrincipal: true }],
        ejecutivoAsignado: ejecutivoId, createdAt: now, updatedAt: now,
      },
      {
        razonSocial: 'Distribuidora El Éxito Ltda.',
        nit: '800.123.456-7',
        sector: 'Comercio', subsector: 'Distribución', tamano: 'mediana', estado: 'activo',
        estadoCartera: 'en_mora', diasMora: 45, saldoPendiente: 1275000,
        cuotaMensual: 620000, valorMembresia: 1800000,
        fechaAfiliacion: new Date('2019-03-10'), fechaVencimiento: new Date('2026-03-10'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Carrera 15 # 90-12' },
        contactos: [{ nombre: 'María López', cargo: 'Directora Comercial', email: 'mlopez@exito.com', telefono: '3107654321', esPrincipal: true }],
        ejecutivoAsignado: ejecutivoId, createdAt: now, updatedAt: now,
      },
      {
        razonSocial: 'Ferretería San Martín S.A.S.',
        nit: '900.456.789-3',
        sector: 'Comercio', subsector: 'Ferretería', tamano: 'pequeña', estado: 'activo',
        estadoCartera: 'acuerdo_pago', diasMora: 90, saldoPendiente: 960000,
        cuotaMensual: 320000, valorMembresia: 950000,
        fechaVencimiento: new Date('2025-12-31'),
        direccion: { ciudad: 'Floridablanca', departamento: 'Santander', direccion: 'Avenida El Poblado # 1-15' },
        contactos: [{ nombre: 'Luis Ramírez', cargo: 'Propietario', email: 'lramirez@ferreteriamartin.com', telefono: '3209876543', esPrincipal: true }],
        createdAt: now, updatedAt: now,
      },
      {
        razonSocial: 'Supermercado Los Andes S.A.S.',
        nit: '901.234.567-8',
        sector: 'Comercio', subsector: 'Supermercados', tamano: 'mediana', estado: 'activo',
        estadoCartera: 'al_dia', diasMora: 0, saldoPendiente: 0,
        cuotaMensual: 490000, valorMembresia: 1400000,
        fechaAfiliacion: new Date('2021-06-01'), fechaVencimiento: new Date('2026-06-01'),
        direccion: { ciudad: 'Piedecuesta', departamento: 'Santander', direccion: 'Carrera 5 # 10-20' },
        contactos: [{ nombre: 'Ana Gómez', cargo: 'Administradora', email: 'agomez@losandes.com', telefono: '3154567890', esPrincipal: true }],
        ejecutivoAsignado: ejecutivoId, createdAt: now, updatedAt: now,
      },
      {
        razonSocial: 'Textiles Bucaramanga Ltda.',
        nit: '802.345.678-1',
        sector: 'Industria', subsector: 'Textil', tamano: 'grande', estado: 'activo',
        estadoCartera: 'en_mora', diasMora: 120, saldoPendiente: 3840000,
        cuotaMensual: 980000, valorMembresia: 3200000,
        fechaAfiliacion: new Date('2018-09-15'), fechaVencimiento: new Date('2025-09-15'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Zona Industrial # 5-40' },
        contactos: [{ nombre: 'Jorge Vargas', cargo: 'Gerente Financiero', email: 'jvargas@textbga.com', telefono: '3201234567', esPrincipal: true }],
        ejecutivoAsignado: ejecutivoId, createdAt: now, updatedAt: now,
      },
    ];

    const afiliadosResult = await db.collection('afiliados').insertMany(afiliados);
    console.log(`${afiliadosResult.insertedCount} afiliados creados`);

    console.log('\n=== Seed completado ===');
    console.log('Admin:     admin@fenalco.com      / Admin123!');
    console.log('Ejecutivo: ejecutivo@fenalco.com  / Ejecutivo123!');
  } catch (error) {
    console.error('Error en seed:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seed();
