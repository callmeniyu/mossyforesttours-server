// check-database.js - Check database content
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

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
    console.log('✅ Connected to database\n');

    const db = mongoose.connection.db;
    
    // Check collections
    const collections = await db.listCollections().toArray();
    console.log('📁 Collections in database:');
    collections.forEach(col => console.log(`   - ${col.name}`));
    console.log('');
    
    // Check tours
    const toursCount = await db.collection('tours').countDocuments();
    console.log(`📦 Tours: ${toursCount} documents`);
    if (toursCount > 0) {
      const tour = await db.collection('tours').findOne({});
      console.log('   Sample tour:', JSON.stringify(tour, null, 2).substring(0, 500));
    }
    console.log('');
    
    // Check bookings
    const bookingsCount = await db.collection('bookings').countDocuments();
    console.log(`🎫 Bookings: ${bookingsCount} documents`);
    if (bookingsCount > 0) {
      const bookings = await db.collection('bookings').find({}).limit(3).toArray();
      console.log('   Recent bookings:');
      bookings.forEach(b => {
        console.log(`   - ID: ${b._id}, Date: ${b.date}, Status: ${b.status || 'N/A'}, Payment: ${b.paymentInfo?.paymentStatus || 'N/A'}`);
      });
    }
    console.log('');
    
    // Check timeslots
    const timeslotsCount = await db.collection('timeslots').countDocuments();
    console.log(`⏰ TimeSlots: ${timeslotsCount} documents`);
    
    mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

run();
