// delete-booking.js - Delete a test booking
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config();
if (!process.env.MONGO_URI) {
  const fallback = path.join(__dirname, '..', '.env');
  dotenv.config({ path: fallback });
}

async function run() {
  const bookingId = process.argv[2];
  
  if (!bookingId) {
    console.error('Usage: node delete-booking.js <bookingId>');
    process.exit(1);
  }

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to database\n');

    const db = mongoose.connection.db;
    
    // Delete booking
    const result = await db.collection('bookings').deleteOne({
      _id: new mongoose.Types.ObjectId(bookingId)
    });

    if (result.deletedCount > 0) {
      console.log(`✅ Deleted booking: ${bookingId}`);
    } else {
      console.log(`❌ Booking not found: ${bookingId}`);
    }

    mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

run();
