// test-booking-api.js
// Tests the booking API endpoint directly
// Usage: node test-booking-api.js

const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config();
if (!process.env.MONGO_URI) {
  const fallback = path.join(__dirname, '..', '.env');
  dotenv.config({ path: fallback });
}

const mongoose = require('mongoose');

async function testBookingAPI() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not set in environment');
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    await mongoose.connect(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4,
      connectTimeoutMS: 30000,
    });

    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // Find a tour to book
    const tour = await db.collection('tours').findOne({ status: 'active' });
    if (!tour) {
      console.error('❌ No active tour found');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('📦 Found tour:', tour.title, 'ID:', tour._id);

    // Load BookingController
    let BookingController;
    try {
      BookingController = require('../dist/controllers/booking.controller').default;
    } catch (e) {
      console.log('⚠️ Could not load from dist, trying src...');
      // Try to require TypeScript file directly (requires ts-node or similar)
      require('ts-node/register');
      BookingController = require('../src/controllers/booking.controller').default;
    }

    console.log('✅ Loaded BookingController');

    // Prepare booking data (same format as client sends)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const bookingData = {
      packageType: 'tour',
      packageId: tour._id.toString(),
      date: dateStr,
      time: '09:00 AM',
      adults: 2,
      children: 0,
      pickupLocation: 'Test Hotel, Cameron Highlands',
      contactInfo: {
        name: 'Test User',
        email: 'testuser@example.com',
        phone: '+60123456789',
        whatsapp: '+60123456789',
      },
      subtotal: tour.newPrice * 2,
      total: tour.newPrice * 2 * 1.028, // with bank charge
      paymentInfo: {
        amount: tour.newPrice * 2 * 1.028,
        bankCharge: tour.newPrice * 2 * 0.028,
        currency: 'MYR',
        paymentStatus: 'pending',
        paymentMethod: 'pending',
      },
    };

    console.log('📝 Booking data prepared:', JSON.stringify(bookingData, null, 2));

    // Mock request and response objects
    const req = {
      body: bookingData,
    };

    let responseData = null;
    let statusCode = 200;

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        responseData = data;
        return res;
      },
    };

    console.log('🚀 Calling BookingController.createBooking...');

    // Create instance and call method
    const controller = new BookingController();
    await controller.createBooking(req, res);

    console.log('\n📊 Response Status:', statusCode);
    console.log('📊 Response Data:', JSON.stringify(responseData, null, 2));

    if (responseData && responseData.success && responseData.data) {
      console.log('\n✅ SUCCESS! Booking created with ID:', responseData.data._id);

      // Verify booking exists in database
      const savedBooking = await db.collection('bookings').findOne({ _id: responseData.data._id });
      if (savedBooking) {
        console.log('✅ Booking verified in database');
        console.log('📝 Booking details:', {
          id: savedBooking._id,
          packageType: savedBooking.packageType,
          date: savedBooking.date,
          time: savedBooking.time,
          adults: savedBooking.adults,
          status: savedBooking.status,
          contactName: savedBooking.contactInfo.name,
        });
      } else {
        console.log('❌ Booking NOT found in database!');
      }

      // Check timeslot update
      const timeslot = await db.collection('timeslots').findOne({
        packageType: 'tour',
        packageId: tour._id,
        date: dateStr,
      });

      if (timeslot) {
        const slot = timeslot.slots.find((s) => s.time === '09:00 AM');
        if (slot) {
          console.log('✅ TimeSlot updated:', {
            time: slot.time,
            bookedCount: slot.bookedCount,
            capacity: slot.capacity,
          });
        } else {
          console.log('⚠️ TimeSlot not found for time: 09:00 AM');
        }
      } else {
        console.log('⚠️ No timeslot document found');
      }
    } else {
      console.log('\n❌ FAILED! Booking creation failed');
      console.log('Error:', responseData?.error || 'Unknown error');
    }

    await mongoose.disconnect();
    console.log('\n✅ Test completed');
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

testBookingAPI();
