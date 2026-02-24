import './src/config/env'; // Load environment variables
import { BrevoEmailService } from './src/services/brevo.service';
import { BookingEmailData } from './src/services/email.service';

/**
 * Test Script to Preview Confirmation Email
 * 
 * This script allows you to test the confirmation email without making an actual booking.
 * It sends a test email with sample booking data to your specified email address.
 * 
 * Usage:
 * 1. Make sure your .env file has BREVO_API_KEY configured
 * 2. Update the TEST_EMAIL constant below with your email address
 * 3. Run: npm run test-email  (or add this script to package.json)
 *    OR directly: npx ts-node test-email.ts
 */
// ============================================
// CONFIGURATION - CHANGE THIS TO YOUR EMAIL
// ============================================
const TEST_EMAIL = '786niyasniya@gmail.com'; // Change this to your email address
const ADMIN_EMAIL = 'mossyforesttours@gmail.com'; // Admin notification email
const TEST_BOOKING_TYPE: 'tour' | 'transfer' = 'tour'; // Change to 'transfer' to test transfer email

// ============================================
// SAMPLE BOOKING DATA FOR TESTING
// ============================================

// Sample Tour Booking Data
const sampleTourBooking: BookingEmailData = {
  customerName: 'John Doe',
  customerEmail: TEST_EMAIL,
  bookingId: 'test-booking-' + Date.now(),
  packageId: 'tour-123',
  packageName: 'Cameron Highlands Full Day Tour',
  packageType: 'tour',
  date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
  time: '09:00',
  adults: 2,
  children: 1,
  pickupLocation: 'Hotel Grand Plaza, Cameron Highlands',
  pickupGuidelines: 'Please be ready at the hotel lobby 5 minutes before pickup time. Our driver will call you 10 minutes before arrival.',
  total: 250.00,
  currency: 'MYR',
};

// Sample Transfer Booking Data
const sampleTransferBooking: BookingEmailData = {
  customerName: 'Jane Smith',
  customerEmail: TEST_EMAIL,
  bookingId: 'test-transfer-' + Date.now(),
  packageId: 'transfer-456',
  packageName: 'Private Transfer Service',
  packageType: 'transfer',
  from: 'Kuala Lumpur International Airport (KLIA)',
  to: 'Cameron Highlands Resort',
  date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
  time: '14:30',
  adults: 3,
  children: 0,
  pickupLocation: 'KLIA Arrival Hall, Gate 3',
  pickupGuidelines: 'After collecting your luggage, proceed to Gate 3 at the arrival hall. Our driver will be holding a sign with your name.',
  total: 350.00,
  currency: 'MYR',
  // Optional: For private vehicle bookings
  isVehicleBooking: true,
  vehicleName: 'Toyota Alphard',
  vehicleSeatCapacity: 7,
};

// ============================================
// MAIN TEST FUNCTION
// ============================================

async function testEmail() {
  console.log('🧪 Testing Confirmation Email...\n');
  
  // Check if API key is configured
  if (!process.env.BREVO_API_KEY) {
    console.error('❌ ERROR: BREVO_API_KEY is not set in environment variables');
    console.error('Please configure your .env file with BREVO_API_KEY');
    process.exit(1);
  }

  // Select which booking type to test
  const bookingData = TEST_BOOKING_TYPE === 'tour' ? sampleTourBooking : sampleTransferBooking;
  
  console.log('📧 Test Configuration:');
  console.log('   Customer Email:', TEST_EMAIL);
  console.log('   Admin Email:', ADMIN_EMAIL);
  console.log('   Booking Type:', TEST_BOOKING_TYPE);
  console.log('   Package:', bookingData.packageName);
  console.log('   Date:', new Date(bookingData.date).toLocaleDateString());
  console.log('   Time:', bookingData.time);
  console.log('   Total:', `${bookingData.currency} ${bookingData.total.toFixed(2)}`);
  console.log('\n🚀 Sending test emails...\n');

  try {
    // Send the customer confirmation email
    console.log('📨 Sending customer confirmation email...');
    const customerResult = await BrevoEmailService.sendBookingConfirmation(bookingData);
    
    if (customerResult) {
      console.log('✅ Customer confirmation email sent successfully!');
      console.log('📬 Check customer inbox at:', TEST_EMAIL);
    } else {
      console.error('❌ Failed to send customer confirmation email');
    }

    // Send the admin notification email
    console.log('\n📨 Sending admin notification email...');
    const adminResult = await BrevoEmailService.sendBookingNotification(bookingData);
    
    if (adminResult) {
      console.log('✅ Admin notification email sent successfully!');
      console.log('📬 Check admin inbox at:', ADMIN_EMAIL);
    } else {
      console.error('❌ Failed to send admin notification email');
    }

    // Summary
    if (customerResult && adminResult) {
      console.log('\n🎉 SUCCESS! Both emails sent successfully!');
      console.log('\n💡 Tips:');
      console.log('   - Check spam folders if you don\'t see the emails');
      console.log('   - Emails may take 1-2 minutes to arrive');
      console.log('   - You can modify the sample data above and run this script again');
      console.log('\n📝 To test different scenarios:');
      console.log('   1. Change TEST_BOOKING_TYPE to "transfer" to test transfer emails');
      console.log('   2. Modify the sample booking data above');
      console.log('   3. Update TEST_EMAIL or ADMIN_EMAIL to send to different addresses');
    } else {
      console.error('\n⚠️ WARNING: Some emails failed to send');
      console.error('Check the error messages above for more details');
    }
  } catch (error) {
    console.error('❌ ERROR:', error);
    console.error('\nPlease check:');
    console.error('   1. BREVO_API_KEY is correctly set in .env');
    console.error('   2. Your Brevo account is active and has email sending quota');
    console.error('   3. The sender email is verified in Brevo');
  }
}

// Run the test
testEmail().then(() => {
  console.log('\n✨ Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
