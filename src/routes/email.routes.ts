import { Router } from 'express';
import { BrevoEmailService } from '../services/brevo.service';
import { EmailService } from '../services/email.service';

const router = Router();

/**
 * Test endpoint to verify Brevo email configuration
 * POST /api/email/test
 * Body: { "email": "test@example.com" }
 */
router.post('/test', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required',
      });
    }

    // Check if Brevo is configured
    if (!process.env.BREVO_API_KEY) {
      return res.status(400).json({
        success: false,
        message: 'BREVO_API_KEY is not configured in environment variables',
        instructions: 'Please set BREVO_API_KEY in your .env file',
      });
    }

    console.log(`📧 Testing email delivery to: ${email}`);
    
    const success = await BrevoEmailService.sendTestEmail(email);

    if (success) {
      res.json({
        success: true,
        message: `Test email sent successfully to ${email}`,
        provider: 'Brevo API',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test email',
        provider: 'Brevo API',
      });
    }
  } catch (error) {
    console.error('Error in test email endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Test endpoint to send a sample booking confirmation email
 * POST /api/email/test-booking
 * Body: { "email": "test@example.com" }
 */
router.post('/test-booking', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required',
      });
    }

    console.log(`📧 Testing booking confirmation email to: ${email}`);

    // Create sample booking data
    const sampleBooking = {
      customerName: 'John Doe',
      customerEmail: email,
      bookingId: 'TEST-' + Date.now(),
      packageId: 'sample-tour-123',
      packageName: 'Langkawi Island Hopping Tour',
      packageType: 'tour' as const,
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      time: '09:00',
      adults: 2,
      children: 1,
      pickupLocation: 'Hotel Lobby',
      total: 150.00,
      currency: 'MYR',
    };

    const emailService = new EmailService();
    const success = await emailService.sendBookingConfirmation(sampleBooking);

    if (success) {
      res.json({
        success: true,
        message: `Booking confirmation test email sent successfully to ${email}`,
        bookingId: sampleBooking.bookingId,
        provider: process.env.BREVO_API_KEY ? 'Brevo API' : 'SMTP',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send booking confirmation test email',
        provider: process.env.BREVO_API_KEY ? 'Brevo API' : 'SMTP',
      });
    }
  } catch (error) {
    console.error('Error in test booking email endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Test endpoint to send a sample cart booking confirmation email
 * POST /api/email/test-cart
 * Body: { "email": "test@example.com" }
 */
router.post('/test-cart', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required',
      });
    }

    console.log(`📧 Testing cart booking confirmation email to: ${email}`);

    // Create sample cart booking data
    const sampleCartData = {
      customerName: 'Jane Smith',
      customerEmail: email,
      bookings: [
        {
          bookingId: 'TEST-CART-1-' + Date.now(),
          packageId: 'langkawi-tour-1',
          packageName: 'Langkawi Mangrove Tour',
          packageType: 'tour' as const,
          date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          time: '09:00',
          adults: 2,
          children: 0,
          pickupLocation: 'Kuah Jetty',
          total: 120.00,
        },
        {
          bookingId: 'TEST-CART-2-' + Date.now(),
          packageId: 'transfer-1',
          packageName: 'Airport Transfer Service',
          packageType: 'transfer' as const,
          from: 'Langkawi Airport',
          to: 'Pantai Cenang',
          date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          time: '14:30',
          adults: 2,
          children: 0,
          pickupLocation: 'Arrival Hall',
          total: 35.00,
        },
      ],
      totalAmount: 155.00,
      currency: 'MYR',
    };

    const emailService = new EmailService();
    const success = await emailService.sendCartBookingConfirmation(sampleCartData);

    if (success) {
      res.json({
        success: true,
        message: `Cart booking confirmation test email sent successfully to ${email}`,
        bookingsCount: sampleCartData.bookings.length,
        totalAmount: sampleCartData.totalAmount,
        provider: process.env.BREVO_API_KEY ? 'Brevo API' : 'SMTP',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send cart booking confirmation test email',
        provider: process.env.BREVO_API_KEY ? 'Brevo API' : 'SMTP',
      });
    }
  } catch (error) {
    console.error('Error in test cart email endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get email configuration status
 * GET /api/email/status
 */
router.get('/status', (req, res) => {
  try {
    const status = {
      brevo: {
        configured: !!process.env.BREVO_API_KEY,
        provider: 'Brevo API (Recommended)',
        ports: 'Uses HTTPS (443) - No port blocking issues',
      },
      smtp: {
        configured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        provider: 'SMTP (Fallback)',
        note: 'May be blocked on DigitalOcean droplets',
      },
      activeProvider: process.env.BREVO_API_KEY ? 'Brevo API' : 'SMTP',
      recommendation: process.env.BREVO_API_KEY 
        ? 'Brevo API is configured and will be used for email delivery'
        : 'Configure BREVO_API_KEY to bypass SMTP port blocking issues',
    };

    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in email status endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Test endpoint to send booking notification to admin
 * POST /api/email/test-admin-notification
 * Body: {} (no body required - sends to mossyforesttours@gmail.com)
 */
router.post('/test-admin-notification', async (req, res) => {
  try {
    console.log('📧 Testing admin booking notification...');

    // Create sample booking data for admin notification
    const sampleBooking = {
      customerName: 'Jane Smith',
      customerEmail: 'customer@example.com',
      bookingId: 'ADMIN-TEST-' + Date.now(),
      packageId: 'sample-transfer-456',
      packageName: 'Cameron Highlands Transfer',
      packageType: 'transfer' as const,
      from: 'Kuala Lumpur',
      to: 'Cameron Highlands',
      date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
      time: '08:00',
      adults: 2,
      children: 0,
      pickupLocation: 'KLCC Twin Towers',
      total: 280.00,
      currency: 'MYR',
      isVehicleBooking: true,
      vehicleName: 'Toyota Vellfire',
      vehicleSeatCapacity: 7,
    };

    // Test both single booking notification and cart notification
    const emailService = new EmailService();
    
    // Test single booking notification
    console.log('📧 Testing single booking admin notification...');
    const singleSuccess = await BrevoEmailService.sendBookingNotification(sampleBooking);

    // Test cart booking notification
    console.log('📧 Testing cart booking admin notification...');
    const sampleCartData = {
      customerName: 'John Carter',
      customerEmail: 'john.carter@example.com',
      bookings: [
        {
          bookingId: 'CART-TEST-1-' + Date.now(),
          packageId: 'tour-123',
          packageName: 'Langkawi Mangrove Tour',
          packageType: 'tour' as const,
          date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          time: '10:00',
          adults: 4,
          children: 2,
          pickupLocation: 'Hotel Lobby',
          total: 240.00,
        },
        {
          bookingId: 'CART-TEST-2-' + Date.now(),
          packageId: 'transfer-789',
          packageName: 'Airport Pickup Service',
          packageType: 'transfer' as const,
          from: 'Langkawi Airport',
          to: 'Pantai Cenang Hotel',
          date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          time: '15:30',
          adults: 4,
          children: 2,
          pickupLocation: 'Arrival Gate',
          total: 45.00,
          isVehicleBooking: true,
          vehicleName: 'Honda Odyssey',
          vehicleSeatCapacity: 8,
        },
      ],
      totalAmount: 285.00,
      currency: 'MYR',
    };

    const cartSuccess = await BrevoEmailService.sendCartBookingNotification(sampleCartData);

    if (singleSuccess && cartSuccess) {
      res.json({
        success: true,
        message: `Admin notification test emails sent successfully to ${process.env.NOTIFICATION_EMAIL || 'mossyforesttours@gmail.com'}`,
        tests: {
          singleBooking: singleSuccess,
          cartBooking: cartSuccess,
        },
        provider: process.env.BREVO_API_KEY ? 'Brevo API' : 'SMTP',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send admin notification test emails',
        tests: {
          singleBooking: singleSuccess,
          cartBooking: cartSuccess,
        },
        provider: process.env.BREVO_API_KEY ? 'Brevo API' : 'SMTP',
      });
    }
  } catch (error) {
    console.error('Error in test admin notification endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/email/feedback
 * Body: { name, email, message }
 */
router.post('/feedback', async (req, res) => {
  try {
    const { name, email, message } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'name, email and message are required' });
    }

    // Validate name
    if (typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Name must be at least 2 characters long' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof email !== 'string' || !emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'A valid email address is required' });
    }

    // Basic validation: message length
    if (typeof message !== 'string' || message.trim().length < 100) {
      return res.status(400).json({ success: false, message: 'Message must be at least 100 characters long' });
    }

    const toEmail = process.env.FEEDBACK_TO_EMAIL || 'mossyforesttours@gmail.com';

    // Prefer Brevo if configured
    let sent = false;
    if (process.env.BREVO_API_KEY) {
      sent = await BrevoEmailService.sendFeedback(toEmail, name.trim(), email.trim(), message.trim());
    } else {
      // Fallback: use EmailService (SMTP)
      const emailService = new EmailService();
      // Reuse the SMTP transporter via a minimal mail: we'll compose simple HTML
      const feedbackData = {
        senderName: name.trim(),
        senderEmail: email.trim(),
        message: message.trim(),
      } as any;

      // If EmailService had a feedback method, we'd call it. For now use Brevo logic through BrevoEmailService if available.
      sent = await BrevoEmailService.sendFeedback(toEmail, feedbackData.senderName, feedbackData.senderEmail, feedbackData.message);
    }

    if (sent) {
      return res.json({ success: true, message: 'Feedback sent successfully' });
    } else {
      return res.status(500).json({ success: false, message: 'Failed to send feedback' });
    }
  } catch (error) {
    console.error('Error in feedback endpoint:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;

