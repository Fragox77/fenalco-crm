require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');

const SALT_ROUNDS = 10;

const daysAgo = (n) => new Date(Date.now() - n * 864e5);
const norm     = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const seed = async () => {
  await connectDB();

  try {
    const db = mongoose.connection;

    await db.collection('users').deleteMany({});
    await db.collection('afiliados').deleteMany({});
    console.log('Colecciones limpiadas...');

    const now = new Date();

    // ── USUARIOS ──────────────────────────────────────────────────────────────
    const users = [
      {
        nombre: 'Administrador Fenalco',
        email: 'admin@fenalco.com',
        password: await bcrypt.hash('Admin123!', SALT_ROUNDS),
        role: 'admin', activo: true, createdAt: now, updatedAt: now,
      },
      {
        nombre: 'Laura Mendoza',
        email: 'lmendoza@fenalco.com',
        password: await bcrypt.hash('Ejecutivo123!', SALT_ROUNDS),
        role: 'ejecutivo', activo: true, createdAt: now, updatedAt: now,
      },
      {
        nombre: 'Carlos Niño',
        email: 'cnino@fenalco.com',
        password: await bcrypt.hash('Ejecutivo123!', SALT_ROUNDS),
        role: 'ejecutivo', activo: true, createdAt: now, updatedAt: now,
      },
    ];

    const usersResult = await db.collection('users').insertMany(users);
    console.log(`${usersResult.insertedCount} usuarios creados`);

    const ej1 = usersResult.insertedIds[1]; // Laura Mendoza
    const ej2 = usersResult.insertedIds[2]; // Carlos Niño

    // ── AFILIADOS ─────────────────────────────────────────────────────────────
    const afiliados = [

      // ── AL DÍA (6) ──────────────────────────────────────────────────────────

      {
        razonSocial: 'Clínica Chicamocha S.A.S.',
        nit: '890.200.100-1',
        sector: 'Salud', subsector: 'Clínicas y Hospitales', tamano: 'grande',
        estado: 'activo', estadoCartera: 'al_dia', diasMora: 0, saldoPendiente: 0,
        cuotaMensual: 1200000, valorMembresia: 4500000,
        fechaAfiliacion: new Date('2017-03-10'), fechaVencimiento: new Date('2027-03-10'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Av. González Valencia # 52-34' },
        contactos: [{ nombre: 'Adriana Rincón', cargo: 'Directora Administrativa', email: 'arincon@chicamocha.com.co', telefono: '3151234501', esPrincipal: true }],
        ejecutivoAsignado: ej1, createdAt: daysAgo(400), updatedAt: now,
      },
      {
        razonSocial: 'Constructora Metropolitana Ltda.',
        nit: '800.900.234-5',
        sector: 'Construcción', subsector: 'Obras civiles', tamano: 'mediana',
        estado: 'activo', estadoCartera: 'al_dia', diasMora: 0, saldoPendiente: 0,
        cuotaMensual: 780000, valorMembresia: 2800000,
        fechaAfiliacion: new Date('2019-07-22'), fechaVencimiento: new Date('2026-07-22'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Calle 56 # 15-28 Of. 301' },
        contactos: [{ nombre: 'Hernán Díaz', cargo: 'Gerente General', email: 'hdiaz@constructorametro.com', telefono: '3162345602', esPrincipal: true }],
        ejecutivoAsignado: ej1, createdAt: daysAgo(320), updatedAt: now,
      },
      {
        razonSocial: 'Hotel Bucarica S.A.',
        nit: '860.004.177-3',
        sector: 'Servicios', subsector: 'Hotelería y Turismo', tamano: 'grande',
        estado: 'activo', estadoCartera: 'al_dia', diasMora: 0, saldoPendiente: 0,
        cuotaMensual: 950000, valorMembresia: 3200000,
        fechaAfiliacion: new Date('2016-11-05'), fechaVencimiento: new Date('2027-11-05'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Calle 49 # 28-26 Centro' },
        contactos: [{ nombre: 'Sandra Patiño', cargo: 'Gerente Comercial', email: 'spatino@hotelbucarica.com', telefono: '3173456703', esPrincipal: true }],
        ejecutivoAsignado: ej2, createdAt: daysAgo(500), updatedAt: now,
      },
      {
        razonSocial: 'Colegio Bilingüe Horizontes S.A.S.',
        nit: '900.112.345-9',
        sector: 'Servicios', subsector: 'Educación', tamano: 'mediana',
        estado: 'activo', estadoCartera: 'al_dia', diasMora: 0, saldoPendiente: 0,
        cuotaMensual: 520000, valorMembresia: 1600000,
        fechaAfiliacion: new Date('2020-02-14'), fechaVencimiento: new Date('2026-02-14'),
        direccion: { ciudad: 'Floridablanca', departamento: 'Santander', direccion: 'Carrera 8 # 12-45 Versalles' },
        contactos: [{ nombre: 'Beatriz Uribe', cargo: 'Rectora', email: 'buribe@horizontes.edu.co', telefono: '3184567804', esPrincipal: true }],
        ejecutivoAsignado: ej1, createdAt: daysAgo(280), updatedAt: now,
      },
      {
        razonSocial: 'Droguería y Farmacia El Nilo S.A.S.',
        nit: '900.445.678-2',
        sector: 'Salud', subsector: 'Farmacias y Droguerías', tamano: 'pequeña',
        estado: 'activo', estadoCartera: 'al_dia', diasMora: 0, saldoPendiente: 0,
        cuotaMensual: 290000, valorMembresia: 850000,
        fechaAfiliacion: new Date('2022-04-20'), fechaVencimiento: new Date('2026-04-20'),
        direccion: { ciudad: 'Girón', departamento: 'Santander', direccion: 'Calle 25 # 10-05 Centro' },
        contactos: [{ nombre: 'Pedro Valbuena', cargo: 'Propietario', email: 'pvalbuena@drogueriaelnilo.com', telefono: '3195678905', esPrincipal: true }],
        ejecutivoAsignado: ej2, createdAt: daysAgo(180), updatedAt: now,
      },
      {
        razonSocial: 'Almacenes Éxito Centro Cabecera',
        nit: '860.007.386-6',
        sector: 'Comercio', subsector: 'Supermercados', tamano: 'grande',
        estado: 'activo', estadoCartera: 'al_dia', diasMora: 0, saldoPendiente: 0,
        cuotaMensual: 1500000, valorMembresia: 5000000,
        fechaAfiliacion: new Date('2015-08-01'), fechaVencimiento: new Date('2027-08-01'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Carrera 35 # 48-30 Cabecera del Llano' },
        contactos: [{ nombre: 'Juliana Torres', cargo: 'Gerente de Tienda', email: 'jtorres@exito.com.co', telefono: '3006789006', esPrincipal: true }],
        ejecutivoAsignado: ej2, createdAt: daysAgo(600), updatedAt: now,
      },

      // ── EN MORA (4) ──────────────────────────────────────────────────────────

      {
        razonSocial: 'Ferreterías del Norte S.A.S.',
        nit: '900.556.789-4',
        sector: 'Comercio', subsector: 'Ferretería e Insumos', tamano: 'mediana',
        estado: 'activo', estadoCartera: 'en_mora', diasMora: 45, saldoPendiente: 2450000,
        cuotaMensual: 580000, valorMembresia: 1900000,
        fechaAfiliacion: new Date('2020-05-12'), fechaVencimiento: new Date('2025-05-12'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Carrera 22 # 35-14 La Concordia' },
        contactos: [{ nombre: 'Gustavo Leal', cargo: 'Gerente Propietario', email: 'gleal@ferreteriasnorte.com', telefono: '3017890107', esPrincipal: true }],
        ejecutivoAsignado: ej1,
        interacciones: [
          { tipo: 'llamada', fecha: daysAgo(5),  descripcion: 'Llamada de cobro: compromete pago parcial de $1.000.000 para el viernes.', resultado: 'Promesa de pago el viernes', ejecutivo: ej1 },
          { tipo: 'whatsapp', fecha: daysAgo(18), descripcion: 'Mensaje recordatorio enviado con detalle de deuda y fecha límite.', resultado: 'Visto, sin respuesta', ejecutivo: ej1 },
          { tipo: 'llamada', fecha: daysAgo(30), descripcion: 'Primera llamada de cobro. Aduce problemas de flujo de caja por inventario parado.', resultado: 'Sin acuerdo, pide plazo adicional', ejecutivo: ej1 },
        ],
        createdAt: daysAgo(200), updatedAt: daysAgo(5),
      },
      {
        razonSocial: 'Laboratorio Clínico Especializado Santander',
        nit: '900.667.890-8',
        sector: 'Salud', subsector: 'Laboratorios Clínicos', tamano: 'pequeña',
        estado: 'activo', estadoCartera: 'en_mora', diasMora: 30, saldoPendiente: 890000,
        cuotaMensual: 340000, valorMembresia: 1100000,
        fechaAfiliacion: new Date('2021-09-18'), fechaVencimiento: new Date('2026-09-18'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Calle 33 # 20-11 Sotomayor' },
        contactos: [{ nombre: 'Amparo Castellanos', cargo: 'Directora Científica', email: 'acastellanos@labsantander.com', telefono: '3028901208', esPrincipal: true }],
        ejecutivoAsignado: ej1,
        interacciones: [
          { tipo: 'email', fecha: daysAgo(3),  descripcion: 'Correo formal con carta de cobro adjunta y desglose de saldo.', resultado: 'Correo enviado, pendiente respuesta', ejecutivo: ej1 },
          { tipo: 'llamada', fecha: daysAgo(15), descripcion: 'Contacto con Dra. Castellanos. Indica que hubo cambio de contador y están regularizando pagos.', resultado: 'Se compromete a pagar en 15 días', ejecutivo: ej1 },
        ],
        createdAt: daysAgo(150), updatedAt: daysAgo(3),
      },
      {
        razonSocial: 'Constructora Piedecuesta & Asociados S.A.S.',
        nit: '901.778.901-3',
        sector: 'Construcción', subsector: 'Construcción Residencial', tamano: 'grande',
        estado: 'activo', estadoCartera: 'en_mora', diasMora: 90, saldoPendiente: 5600000,
        cuotaMensual: 1100000, valorMembresia: 3800000,
        fechaAfiliacion: new Date('2018-06-30'), fechaVencimiento: new Date('2025-06-30'),
        direccion: { ciudad: 'Piedecuesta', departamento: 'Santander', direccion: 'Calle 5 # 8-22 Centro Piedecuesta' },
        contactos: [{ nombre: 'Rodrigo Cáceres', cargo: 'Gerente Financiero', email: 'rcaceres@constructorapiedecuesta.com', telefono: '3039012309', esPrincipal: true }],
        ejecutivoAsignado: ej2,
        interacciones: [
          { tipo: 'visita', fecha: daysAgo(7),  descripcion: 'Visita a oficina principal. Gerente financiero explica retraso por demoras en recaudo de cartera de proyectos.', resultado: 'En espera de propuesta de acuerdo de pago', ejecutivo: ej2 },
          { tipo: 'llamada', fecha: daysAgo(25), descripcion: 'Llamada de seguimiento. No contestaron, se dejó mensaje en buzón.', resultado: 'Sin respuesta', ejecutivo: ej2 },
          { tipo: 'llamada', fecha: daysAgo(55), descripcion: 'Primera llamada de cobro a los 35 días de mora. Prometieron regularizar en una semana.', resultado: 'Promesa incumplida', ejecutivo: ej2 },
        ],
        createdAt: daysAgo(350), updatedAt: daysAgo(7),
      },
      {
        razonSocial: 'Importadora Automotriz Oriente S.A.',
        nit: '890.500.612-7',
        sector: 'Comercio', subsector: 'Automotriz', tamano: 'grande',
        estado: 'activo', estadoCartera: 'en_mora', diasMora: 67, saldoPendiente: 3200000,
        cuotaMensual: 860000, valorMembresia: 2900000,
        fechaAfiliacion: new Date('2019-01-10'), fechaVencimiento: new Date('2026-01-10'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Autopista a Floridablanca # 30-50' },
        contactos: [{ nombre: 'Felipe Acevedo', cargo: 'Gerente General', email: 'facevedo@automotrizoriente.com', telefono: '3040123410', esPrincipal: true }],
        ejecutivoAsignado: ej2,
        interacciones: [
          { tipo: 'reunion', fecha: daysAgo(10), descripcion: 'Reunión en Fenalco con gerente general. Presenta dificultades por caída de ventas de vehículos 0km en el trimestre.', resultado: 'Solicita reestructuración en cuotas mensuales', ejecutivo: ej2 },
          { tipo: 'email', fecha: daysAgo(40), descripcion: 'Envío de recordatorio de cobro con estados de cuenta.', resultado: 'Respuesta: esperan cierre de negocio para pagar', ejecutivo: ej2 },
        ],
        createdAt: daysAgo(250), updatedAt: daysAgo(10),
      },

      // ── ACUERDO DE PAGO (3) ──────────────────────────────────────────────────

      {
        razonSocial: 'Confecciones Santander Ltda.',
        nit: '800.345.678-9',
        sector: 'Comercio', subsector: 'Textil y Confecciones', tamano: 'mediana',
        estado: 'activo', estadoCartera: 'acuerdo_pago', diasMora: 120, saldoPendiente: 4800000,
        cuotaMensual: 670000, valorMembresia: 2200000,
        fechaAfiliacion: new Date('2018-11-20'), fechaVencimiento: new Date('2025-11-20'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Carrera 14 # 20-55 Barrio Mutis' },
        contactos: [{ nombre: 'Rosa Guerrero', cargo: 'Socia Gerente', email: 'rguerrero@confeccionessantander.com', telefono: '3051234511', esPrincipal: true }],
        ejecutivoAsignado: ej1,
        compromisos: [
          { fechaCompromiso: new Date('2026-06-05'), monto: 1600000, descripcion: 'Primera cuota del acuerdo de pago firmado el 30 de abril', cumplido: false, ejecutivo: ej1, createdAt: daysAgo(19) },
          { fechaCompromiso: new Date('2026-07-05'), monto: 1600000, descripcion: 'Segunda cuota del acuerdo', cumplido: false, ejecutivo: ej1, createdAt: daysAgo(19) },
          { fechaCompromiso: new Date('2026-08-05'), monto: 1600000, descripcion: 'Tercera y última cuota del acuerdo', cumplido: false, ejecutivo: ej1, createdAt: daysAgo(19) },
        ],
        interacciones: [
          { tipo: 'reunion', fecha: daysAgo(19), descripcion: 'Reunión de acuerdo de pago. Se firma compromiso en 3 cuotas mensuales de $1.600.000.', resultado: 'Acuerdo firmado', ejecutivo: ej1 },
          { tipo: 'llamada', fecha: daysAgo(45), descripcion: 'Negociación de condiciones del acuerdo. Pide cuotas mensuales por dificultades del sector textil.', resultado: 'En proceso de negociación', ejecutivo: ej1 },
        ],
        createdAt: daysAgo(300), updatedAt: daysAgo(19),
      },
      {
        razonSocial: 'Centro Médico Manzanares S.A.S.',
        nit: '901.234.900-6',
        sector: 'Salud', subsector: 'Centros Médicos', tamano: 'mediana',
        estado: 'activo', estadoCartera: 'acuerdo_pago', diasMora: 45, saldoPendiente: 1750000,
        cuotaMensual: 490000, valorMembresia: 1500000,
        fechaAfiliacion: new Date('2021-04-05'), fechaVencimiento: new Date('2026-04-05'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Carrera 27 # 51-12 Manzanares' },
        contactos: [{ nombre: 'Diana Flórez', cargo: 'Directora Médica', email: 'dflorez@centromedicomanzanares.com', telefono: '3062345612', esPrincipal: true }],
        ejecutivoAsignado: ej1,
        compromisos: [
          { fechaCompromiso: new Date('2026-05-30'), monto: 875000, descripcion: 'Primera cuota del acuerdo: 50% del saldo', cumplido: false, ejecutivo: ej1, createdAt: daysAgo(12) },
          { fechaCompromiso: new Date('2026-06-30'), monto: 875000, descripcion: 'Cuota final del acuerdo', cumplido: false, ejecutivo: ej1, createdAt: daysAgo(12) },
        ],
        interacciones: [
          { tipo: 'llamada', fecha: daysAgo(12), descripcion: 'Acuerdo de pago en 2 cuotas iguales de $875.000. La directora indica que esperan desembolso de EPS.', resultado: 'Acuerdo verbal confirmado', ejecutivo: ej1 },
        ],
        createdAt: daysAgo(160), updatedAt: daysAgo(12),
      },
      {
        razonSocial: 'Distribuidora Materiales La Candelaria S.A.S.',
        nit: '900.889.001-0',
        sector: 'Construcción', subsector: 'Materiales de Construcción', tamano: 'pequeña',
        estado: 'activo', estadoCartera: 'acuerdo_pago', diasMora: 15, saldoPendiente: 620000,
        cuotaMensual: 310000, valorMembresia: 920000,
        fechaAfiliacion: new Date('2023-01-15'), fechaVencimiento: new Date('2026-01-15'),
        direccion: { ciudad: 'Girón', departamento: 'Santander', direccion: 'Vía Girón-Zapatoca Km 2' },
        contactos: [{ nombre: 'Mario Carvajal', cargo: 'Propietario', email: 'mcarvajal@lacandelaria.com', telefono: '3073456713', esPrincipal: true }],
        ejecutivoAsignado: ej2,
        compromisos: [
          { fechaCompromiso: new Date('2026-05-28'), monto: 620000, descripcion: 'Pago total del saldo en un solo contado', cumplido: false, ejecutivo: ej2, createdAt: daysAgo(5) },
        ],
        interacciones: [
          { tipo: 'whatsapp', fecha: daysAgo(5), descripcion: 'Mensaje por WhatsApp. Mario confirma que paga el total la próxima semana.', resultado: 'Pago prometido para el 28 de mayo', ejecutivo: ej2 },
        ],
        createdAt: daysAgo(90), updatedAt: daysAgo(5),
      },

      // ── SUSPENDIDO (2) ───────────────────────────────────────────────────────

      {
        razonSocial: 'Almacén El Cóndor S.A.S.',
        nit: '800.678.234-1',
        sector: 'Comercio', subsector: 'Almacenes por Departamento', tamano: 'mediana',
        estado: 'inactivo', estadoCartera: 'suspendido', diasMora: 120, saldoPendiente: 6300000,
        cuotaMensual: 750000, valorMembresia: 2600000,
        fechaAfiliacion: new Date('2017-05-10'), fechaVencimiento: new Date('2024-05-10'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Centro Comercial Cabecera Local 204' },
        contactos: [{ nombre: 'Mauricio Serrano', cargo: 'Representante Legal', email: 'mserrano@almacenelcondor.com', telefono: '3084567814', esPrincipal: true }],
        ejecutivoAsignado: ej2,
        interacciones: [
          { tipo: 'visita', fecha: daysAgo(60), descripcion: 'Visita al local. Encontramos el almacén cerrado temporalmente. Vecinos informan cese de actividades.', resultado: 'Sin contacto efectivo', ejecutivo: ej2 },
          { tipo: 'llamada', fecha: daysAgo(90), descripcion: 'Múltiples llamadas sin respuesta. Buzón lleno.', resultado: 'Incontactable', ejecutivo: ej2 },
          { tipo: 'email', fecha: daysAgo(100), descripcion: 'Carta de cobro prejudicial enviada a correo registrado.', resultado: 'Correo rebotó, dirección inactiva', ejecutivo: ej2 },
        ],
        notas: 'Empresa posiblemente cerrada. Se recomienda gestión jurídica para recuperación de cartera.',
        createdAt: daysAgo(700), updatedAt: daysAgo(60),
      },
      {
        razonSocial: 'Transportes Flota Cáchira Ltda.',
        nit: '891.200.450-5',
        sector: 'Servicios', subsector: 'Transporte de Carga', tamano: 'grande',
        estado: 'inactivo', estadoCartera: 'suspendido', diasMora: 90, saldoPendiente: 7800000,
        cuotaMensual: 1300000, valorMembresia: 4200000,
        fechaAfiliacion: new Date('2016-02-20'), fechaVencimiento: new Date('2024-02-20'),
        direccion: { ciudad: 'Bucaramanga', departamento: 'Santander', direccion: 'Terminal de Transportes Bodega 12' },
        contactos: [{ nombre: 'Augusto Flórez', cargo: 'Gerente de Operaciones', email: 'aflorez@flotacachaira.com', telefono: '3095678915', esPrincipal: true }],
        ejecutivoAsignado: ej1,
        interacciones: [
          { tipo: 'llamada', fecha: daysAgo(30), descripcion: 'Contacto con Augusto Flórez. Indica que la empresa está en proceso de liquidación voluntaria.', resultado: 'Proceso de liquidación confirmado', ejecutivo: ej1 },
          { tipo: 'visita', fecha: daysAgo(70), descripcion: 'Visita a terminal. Oficinas desocupadas, flota reducida al 20%.', resultado: 'Situación crítica confirmada', ejecutivo: ej1 },
        ],
        notas: 'Empresa en proceso de liquidación voluntaria desde enero 2025. Deuda en proceso de cobro jurídico.',
        createdAt: daysAgo(800), updatedAt: daysAgo(30),
      },
    ];

    afiliados.forEach(a => { a.razonSocialNorm = norm(a.razonSocial); });

    const afiliadosResult = await db.collection('afiliados').insertMany(afiliados);
    console.log(`${afiliadosResult.insertedCount} afiliados creados`);

    console.log('\n=== Seed completado ===');
    console.log(`  ${afiliados.filter(a => a.estadoCartera === 'al_dia').length}  al día`);
    console.log(`  ${afiliados.filter(a => a.estadoCartera === 'en_mora').length}  en mora`);
    console.log(`  ${afiliados.filter(a => a.estadoCartera === 'acuerdo_pago').length}  acuerdo de pago`);
    console.log(`  ${afiliados.filter(a => a.estadoCartera === 'suspendido').length}  suspendido`);
    console.log('\nCredenciales:');
    console.log('  Admin:     admin@fenalco.com     / Admin123!');
    console.log('  Ejecutivo: lmendoza@fenalco.com  / Ejecutivo123!');
    console.log('  Ejecutivo: cnino@fenalco.com     / Ejecutivo123!');
  } catch (error) {
    console.error('Error en seed:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seed();
