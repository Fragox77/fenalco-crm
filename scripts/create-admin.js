require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const run = async () => {
  await connectDB();

  try {
    await User.deleteOne({ email: 'admin@fenalco.com' });

    const user = new User({
      nombre: 'Administrador Fenalco',
      email: 'admin@fenalco.com',
      password: 'Admin123!',
      role: 'admin',
    });

    await user.save();
    console.log('Admin creado: admin@fenalco.com / Admin123!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

run();
