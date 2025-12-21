// Test Payment Flow - Run this to verify booking creation works
// Usage: node test-payment-flow.js

const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
if (!process.env.MONGO_URI) {
  const fallback = path.join(__dirname, '..', '.env');
  dotenv.config({ path: fallback });
}

const API_URL = process.env.API_URL || 'http://localhost:3002';

async function testBookingCreation() {
  console.log('\n🧪 Testing Booking API...');
  console.log('API URL:', API_URL);
  console.log('==================\n');

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  const dateStr = futureDate.toISOString().split('T')[0];

  const bookingData = {
    packageType: 'tour',
    packageId: '6943e1f047bf0e80b3991656', // Use the actual tour ID from database
    date: dateStr,
    time: '09:00 AM',
    adults: 2,
    children: 1,
    pickupLocation: 'Tanah Rata Town Center',
    contactInfo: {
      name: 'Test User',
      email: 'test@example.com',
      phone: '+60123456789',
      whatsapp: '+60123456789',
    },
    subtotal: 200,
    total: 205.6,
    paymentInfo: {
      amount: 205.6,
      bankCharge: 5.6,
      currency: 'MYR',
      paymentStatus: 'succeeded',
      paymentMethod: 'stripe',
      stripePaymentIntentId: 'pi_test_' + Date.now(),
    },
  };

  try {
    console.log('📤 Sending booking request...\n');
    console.log('Booking Data:', JSON.stringify(bookingData, null, 2));

    const response = await fetch(`${API_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bookingData),
    });

    const responseText = await response.text();
    console.log('\n📥 Response Status:', response.status);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    console.log('Response Body:', responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Failed to parse JSON response');
      console.error('Raw response:', responseText);
      return;
    }

    if (result.success && result.data) {
      console.log('\n✅ SUCCESS! Booking created:');
      console.log('  - Booking ID:', result.data._id);
      console.log('  - Status:', result.data.status);
      console.log('  - Payment Status:', result.data.paymentInfo?.paymentStatus);
      console.log('  - Total:', result.data.total);
      console.log('\n🎉 Booking API is working correctly!');
      console.log('   Confirmation URL:', `http://localhost:3000/booking/confirmation/${result.data._id}`);
    } else {
      console.error('\n❌ FAILED to create booking:');
      console.error('Error:', result.error || 'Unknown error');
      console.error('Full response:', result);
    }
  } catch (error) {
    console.error('\n❌ ERROR during booking creation:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    if (error.code === 'ECONNREFUSED') {
      console.error('\n⚠️  Connection refused - Is the server running?');
      console.error('   Expected server at:', API_URL);
      console.error('   Start server with: cd server && npm run dev');
    }
  }
}

testBookingCreation();
