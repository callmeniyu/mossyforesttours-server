// list-tours.js - List available tours in database
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

// Load .env
dotenv.config();
if (!process.env.MONGO_URI) {
  const fallback = path.join(__dirname, '..', '.env');
  dotenv.config({ path: fallback });
}

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to database');

    const db = mongoose.connection.db;
    const tours = await db.collection('tours').find({}).project({ name: 1, slug: 1 }).limit(10).toArray();

    console.log('\n📦 Available Tours:');
    console.log('==================');
    tours.forEach((tour, i) => {
      console.log(`${i + 1}. ${tour.slug}`);
      console.log(`   Name: ${tour.name}`);
      console.log('');
    });

    mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

run();
