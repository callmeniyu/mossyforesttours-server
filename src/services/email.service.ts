import nodemailer from 'nodemailer';
import { emailConfig } from '../config/email.config';
import { Types } from 'mongoose';
import { BrevoEmailService } from './brevo.service';

export interface BookingEmailData {
  customerName: string;
  customerEmail: string;
  bookingId: string;
  packageId: string;
  packageName: string;
  packageType: 'tour' | 'transfer';
  // Transfer-specific details
  from?: string;
  to?: string;
  date: string;
  time: string;
  adults: number;
  children: number;
  pickupLocation?: string;
  pickupGuidelines?: string;
  total: number;
  currency: string;
  // Private transfer vehicle details
  isVehicleBooking?: boolean;
  vehicleName?: string;
  vehicleSeatCapacity?: number;
}

export interface CartBookingEmailData {
  customerName: string;
  customerEmail: string;
  bookings: Array<{
    bookingId: string;
    packageId: string;
    packageName: string;
    packageType: 'tour' | 'transfer';
    from?: string;
    to?: string;
    date: string;
    time: string;
    adults: number;
    children: number;
    pickupLocation?: string;
    pickupGuidelines?: string;
    total: number;
    // Private transfer vehicle details
    isVehicleBooking?: boolean;
    vehicleName?: string;
    vehicleSeatCapacity?: number;
  }>;
  totalAmount: number;
  currency: string;
}

export interface ReviewEmailData {
  customerName: string;
  customerEmail: string;
  bookingId: string;
  packageName: string;
  packageType: 'tour' | 'transfer';
  date: string;
  time: string;
  reviewFormUrl: string;
}

export class EmailService {
  private static transporter = nodemailer.createTransport(emailConfig.smtp);

  /**
   * Send booking confirmation email using Brevo only
   * Records email failures in database for admin follow-up
   */
  async sendBookingConfirmation(booking: BookingEmailData): Promise<boolean> {
    try {
      // ONLY use Brevo - SMTP doesn't work reliably
      if (!process.env.BREVO_API_KEY) {
        console.error('❌ CRITICAL: BREVO_API_KEY not configured! Cannot send emails.');
        console.error('   Please configure BREVO_API_KEY in .env file');
        
        // Log failure for admin review
        await this.logEmailFailure(booking, 'BREVO_API_KEY not configured');
        return false;
      }

      console.log('📧 Using Brevo API for email delivery...');
      
      // Send confirmation email with retry logic
      let retryCount = 0;
      const maxRetries = 3;
      let lastError: any;
      
      while (retryCount < maxRetries) {
        try {
          const confirmationResult = await BrevoEmailService.sendBookingConfirmation(booking);
          
          if (confirmationResult) {
            console.log(`✅ Confirmation email sent to ${booking.customerEmail} for booking ${booking.bookingId}`);
            
            // Also send notification to admin (non-blocking)
            this.sendAdminNotification(booking).catch(err => {
              console.error('⚠️ Admin notification failed (non-critical):', err.message);
            });
            
            return true;
          } else {
            lastError = new Error('Brevo returned false');
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(`⚠️ Email send failed, retry ${retryCount}/${maxRetries}...`);
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            }
          }
        } catch (error: any) {
          lastError = error;
          retryCount++;
          if (retryCount < maxRetries) {
            console.error(`❌ Email error (attempt ${retryCount}/${maxRetries}):`, error.message);
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }
      }
      
      // All retries failed
      console.error(`❌ CRITICAL: Failed to send confirmation email after ${maxRetries} attempts`);
      console.error('   Last error:', lastError?.message || 'Unknown error');
      
      // Log failure for admin review
      await this.logEmailFailure(booking, lastError?.message || 'Failed after retries');
      
      return false;
    } catch (error: any) {
      console.error('❌ Fatal error sending confirmation email:', error);
      await this.logEmailFailure(booking, error.message || 'Fatal error');
      return false;
    }
  }

  /**
   * Send admin notification (non-critical, don't fail booking if this fails)
   */
  private async sendAdminNotification(booking: BookingEmailData): Promise<void> {
    try {
      await BrevoEmailService.sendBookingNotification(booking);
      console.log('📧 Admin notification sent for booking:', booking.bookingId);
    } catch (error: any) {
      console.error('⚠️ Failed to send admin notification:', error.message);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Log email failure to database for admin follow-up
   */
  private async logEmailFailure(booking: BookingEmailData, reason: string): Promise<void> {
    try {
      const mongoose = require('mongoose');
      const FailedEmailLog = mongoose.model('FailedEmailLog', new mongoose.Schema({
        bookingId: String,
        customerEmail: String,
        customerName: String,
        packageName: String,
        reason: String,
        bookingData: Object,
        resolved: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
      }));
      
      await FailedEmailLog.create({
        bookingId: booking.bookingId,
        customerEmail: booking.customerEmail,
        customerName: booking.customerName,
        packageName: booking.packageName,
        reason,
        bookingData: booking,
        resolved: false
      });
      
      console.log('📝 Email failure logged for admin review');
    } catch (logError: any) {
      console.error('❌ Failed to log email failure:', logError.message);
      // Don't throw - this is just logging
    }
  }

  /**
   * Send cart booking confirmation email
   */
  async sendCartBookingConfirmation(cartData: CartBookingEmailData): Promise<boolean> {
    try {
      // Try Brevo first (bypasses SMTP port blocking)
      if (process.env.BREVO_API_KEY) {
        console.log('📧 Using Brevo API for cart booking email delivery...');
        const confirmationResult = await BrevoEmailService.sendCartBookingConfirmation(cartData);
        
        // Also send notification to admin
        try {
          await BrevoEmailService.sendCartBookingNotification(cartData);
          console.log('📧 Admin notification sent for cart booking with', cartData.bookings.length, 'items');
        } catch (notificationError) {
          console.error('⚠️ Failed to send admin cart notification:', notificationError);
          // Don't fail the main confirmation if notification fails
        }
        
        return confirmationResult;
      }

      // Fallback to SMTP if Brevo is not configured
      console.log('📧 Brevo not configured, falling back to SMTP...');
      
      // Validate required environment variables
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error('❌ Missing required email environment variables:');
        console.error('SMTP_USER:', process.env.SMTP_USER ? '✓ Set' : '✗ Missing');
        console.error('SMTP_PASS:', process.env.SMTP_PASS ? '✓ Set' : '✗ Missing');
        throw new Error('Missing SMTP credentials in environment variables');
      }

      // Test connection first
      await EmailService.transporter.verify();
      console.log('✅ SMTP connection verified successfully for cart booking');

      const html = this.generateCartBookingConfirmationHTML(cartData);
      
      const mailOptions = {
        from: `"${emailConfig.from.name}" <${emailConfig.from.email}>`,
        to: cartData.customerEmail,
        subject: `🎉 Booking Confirmation - ${cartData.bookings.length} Bookings`,
        html,
      };

      await EmailService.transporter.sendMail(mailOptions);
      console.log(`Cart confirmation email sent to ${cartData.customerEmail} for ${cartData.bookings.length} bookings`);
      
      // Also send notification to admin via SMTP
      try {
        const adminMailOptions = {
          from: `"${emailConfig.from.name}" <${emailConfig.from.email}>`,
          to: emailConfig.templates.notificationEmail,
          subject: `🔔 New Cart Booking Received - ${cartData.bookings.length} Bookings`,
          html: this.generateCartBookingNotificationHTML(cartData),
        };
        await EmailService.transporter.sendMail(adminMailOptions);
        console.log('📧 Admin cart notification sent via SMTP for', cartData.bookings.length, 'bookings');
      } catch (notificationError) {
        console.error('⚠️ Failed to send admin cart notification via SMTP:', notificationError);
        // Don't fail the main confirmation if notification fails
      }
      
      return true;
    } catch (error) {
      console.error('Error sending cart confirmation email:', error);
      return false;
    }
  }

  /**
   * Send review request email 12 hours after departure
   */
  async sendReviewRequest(reviewData: ReviewEmailData): Promise<boolean> {
    try {
      // Try Brevo first (bypasses SMTP port blocking)
      if (process.env.BREVO_API_KEY) {
        console.log('📧 Using Brevo API for review request email delivery...');
        return await BrevoEmailService.sendReviewRequest(reviewData);
      }

      // Fallback to SMTP if Brevo is not configured
      console.log('📧 Brevo not configured, falling back to SMTP...');
      
      // Validate required environment variables
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error('❌ Missing required email environment variables for review email');
        throw new Error('Missing SMTP credentials in environment variables');
      }

      // Test connection first
      await EmailService.transporter.verify();
      console.log('✅ SMTP connection verified successfully for review email');

      const html = this.generateReviewRequestHTML(reviewData);
      
      const mailOptions = {
        from: `"${emailConfig.from.name}" <${emailConfig.from.email}>`,
        to: reviewData.customerEmail,
        subject: `🌟 Thank you for choosing us! Share your experience`,
        html,
      };

      await EmailService.transporter.sendMail(mailOptions);
      console.log(`Review request email sent to ${reviewData.customerEmail} for booking ${reviewData.bookingId}`);
      return true;
    } catch (error) {
      console.error('Error sending review request email:', error);
      return false;
    }
  }

  /**
   * Generate modern HTML email template for booking confirmation
   */
  private generateBookingConfirmationHTML(booking: BookingEmailData): string {
    const formatDate = (dateString: string) => {
      try {
        if (!dateString) return "Invalid Date";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "Invalid Date";
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch {
        return "Invalid Date";
      }
    };

    const formatTime = (timeString: string) => {
      try {
        if (!timeString) return "Invalid Time";
        const [hours, minutes] = timeString.split(':');
        if (!hours || !minutes) return timeString;
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        if (isNaN(date.getTime())) return timeString;
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        return timeString;
      }
    };

    const logoUrl = emailConfig.templates.logo;
    const bannerUrl = `${emailConfig.templates.website}/images/email-banner.jpg`;
    const baseUrl = emailConfig.templates.website;

    // Build tour details link
    const tourDetailsUrl = booking.packageType === 'tour' ? `${baseUrl}/tours/${booking.packageId}` : `${baseUrl}/transfers/${booking.packageId}`;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Booking Confirmation</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #222; background: #f6f6f6; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 16px rgba(12,113,87,0.08); }
            .header { background: linear-gradient(135deg, #0C7157, #0C7157); padding: 0; position: relative; overflow: hidden; }
            .header-content { position: relative; z-index: 2; padding: 40px 30px; text-align: center; color: white; }
            .text-logo { font-family: 'Poppins', sans-serif; font-weight: 500; font-size: 32px; margin-bottom: 20px; letter-spacing: 1px; color: white; }
            .header h1 { font-family: 'Poppins', sans-serif; font-size: 28px; font-weight: 600; margin-bottom: 10px; text-shadow: 0 2px 4px rgba(0,0,0,0.18); }
            .header p { font-family: 'Poppins', sans-serif; font-size: 16px; opacity: 0.95; font-weight: 400; }
            .content { padding: 40px 30px; }
            .greeting { font-family: 'Poppins', sans-serif; font-size: 18px; color: #0C7157; margin-bottom: 20px; font-weight: 600; }
            .confirmation-box { background: #e8f8f5; border-radius: 12px; padding: 25px; margin: 25px 0; border-left: 4px solid #0C7157; }
            .booking-details { background: #f9f9f9; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; }
            .detail-row:last-child { border-bottom: none; }
            .detail-label { font-family: 'Poppins', sans-serif; font-weight: 500; color: #444; }
            .detail-value { font-family: 'Poppins', sans-serif; color: #0C7157; font-weight: 600; }
            /* Use conservative spacing for email clients - avoid negative margins which break many clients */
            .total-row { background: #0C7157; color: #fff; margin-top: 18px; padding: 16px 20px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 18px; font-weight: 700; letter-spacing: 0.5px; }
            .total-row .detail-label { color: #fff; font-size: 16px; }
            .total-row .detail-value { color: #fff; font-size: 20px; font-weight: 700; }
            .cta-button { display: inline-block; background: #0C7157; color: #fff; text-decoration: none; padding: 16px 36px; border-radius: 8px; font-family: 'Poppins', sans-serif; font-weight: 600; margin: 24px 0; text-align: center; box-shadow: 0 4px 12px rgba(12, 113, 87, 0.18); transition: transform 0.2s; font-size: 18px; letter-spacing: 0.5px; }
            .cta-button:hover { transform: translateY(-2px); background: #0a5c47; }
            .footer { background: #222; color: #fff; padding: 30px; text-align: center; border-radius: 0 0 12px 12px; }
            .footer a { color: #0C7157; text-decoration: none; }
            .footer p { font-family: 'Poppins', sans-serif; }
            .social-links { margin: 15px 0; }
            .social-links a { display: inline-block; margin: 0 10px; color: #0C7157; text-decoration: none; font-family: 'Poppins', sans-serif; }
            .info-box { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 25px 0; }
            .info-box h3 { font-family: 'Poppins', sans-serif; color: #8c7a00; margin-bottom: 10px; font-weight: 600; }
            .info-box ul { color: #8c7a00; padding-left: 20px; line-height: 1.8; font-family: 'Poppins', sans-serif; }
            .email-text { font-family: 'Poppins', sans-serif; }
            .icon { width: 16px; height: 16px; display: inline-block; margin-right: 8px; vertical-align: text-top; }
            .success-icon { color: #22c55e; }
            .calendar-icon { color: #3b82f6; }
            .clock-icon { color: #8b5cf6; }
            .location-icon { color: #ef4444; }
            .users-icon { color: #f59e0b; }
            .price-icon { color: #10b981; }
            .info-icon { color: #0ea5e9; }
            @media (max-width: 600px) {
                .container { border-radius: 0; }
                .content { padding: 20px 10px; }
                .header-content { padding: 30px 10px; }
                .header h1 { font-size: 22px; }
                .text-logo { font-size: 24px; }
                .detail-row { flex-direction: column; align-items: flex-start; gap: 5px; }
                .total-row { font-size: 18px; padding: 12px 10px; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <!-- Header -->
            <div class="header">
            <div class="header-content">
                <div class="text-logo">Mossy Forest Tours</div>
                <h1>
                        <svg class="icon success-icon" style="width: 24px; height: 24px; margin-right: 8px;" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                        Booking Confirmed!
                    </h1>
                    <p>Your adventure awaits</p>
                </div>
            </div>

            <!-- Content -->
            <div class="content">
                <div class="greeting">
                    <svg class="icon users-icon" style="width: 18px; height: 18px; margin-right: 8px;" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                    </svg>
                    Hello ${booking.customerName}!
                </div>

                <p class="email-text">Thank you for choosing ${emailConfig.from.name}! We're excited to confirm your booking for an amazing experience.</p>

                <!-- Redesigned Professional Booking Details Section -->
                <div class="booking-details-professional" style="
                    border: 1px solid #e5e7eb; 
                    border-radius: 16px; 
                    overflow: hidden; 
                    margin: 30px 0; 
                    background: #ffffff;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                ">
                    <!-- Header with Package Name and Amount -->
                    <div style="
                        background: linear-gradient(135deg, #0C7157 0%, #0a5d4a 100%);
                        color: white;
                        padding: 24px 28px;
                        position: relative;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px;">
                            <div style="flex: 1;">
                                <h2 style="
                                    font-size: 22px; 
                                    font-weight: 700; 
                                    margin: 0 0 8px 0; 
                                    color: white;
                                    font-family: 'Poppins', sans-serif;
                                    line-height: 1.2;
                                ">${booking.packageName}</h2>
                                <div style="
                                    font-size: 14px; 
                                    opacity: 0.9;
                                    font-family: 'Poppins', sans-serif;
                                ">
                                    <span style="font-weight: 500;">Booking Reference:</span> 
                                    <span style="
                                        background: rgba(255, 255, 255, 0.2); 
                                        padding: 4px 10px; 
                                        border-radius: 6px; 
                                        font-weight: 600;
                                        letter-spacing: 0.5px;
                                        margin-left: 8px;
                                    ">#${booking.bookingId.slice(-8).toUpperCase()}</span>
                                </div>
                            </div>
                            <div style="
                                background: rgba(255, 255, 255, 0.15); 
                                backdrop-filter: blur(10px);
                                border: 1px solid rgba(255, 255, 255, 0.2);
                                padding: 16px 20px; 
                                border-radius: 12px; 
                                text-align: center;
                                min-width: 140px;
                            ">
                                <div style="
                                    font-size: 12px; 
                                    opacity: 0.9; 
                                    margin-bottom: 4px;
                                    font-family: 'Poppins', sans-serif;
                                    text-transform: uppercase;
                                    letter-spacing: 0.5px;
                                ">Total Amount</div>
                                <div style="
                                    font-size: 24px; 
                                    font-weight: 700;
                                    font-family: 'Poppins', sans-serif;
                                    line-height: 1;
                                ">${booking.currency} ${booking.total.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Booking Information Grid -->
                    <div style="padding: 28px;">
                        <!-- Primary Details Row -->
                        <div style="
                            display: grid; 
                            grid-template-columns: 1fr 1fr; 
                            gap: 24px; 
                            margin-bottom: 24px;
                            padding-bottom: 24px;
                            border-bottom: 1px solid #f3f4f6;
                        ">
                            <!-- Date & Time Card -->
                            <div style="
                                background: #f8fafc;
                                border-radius: 12px;
                                padding: 20px;
                                border-left: 4px solid #0C7157;
                            ">
                                <div style="
                                    display: flex;
                                    align-items: center;
                                    margin-bottom: 12px;
                                ">
                                    <div style="
                                        background: #0C7157;
                                        border-radius: 8px;
                                        padding: 8px;
                                        margin-right: 12px;
                                    ">
                                        <svg style="width: 18px; height: 18px;" fill="white" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
                                        </svg>
                                    </div>
                                    <div style="
                                        font-size: 14px;
                                        font-weight: 600;
                                        color: #374151;
                                        font-family: 'Poppins', sans-serif;
                                        text-transform: uppercase;
                                        letter-spacing: 0.5px;
                                    ">Schedule</div>
                                </div>
                                <div style="
                                    font-size: 18px;
                                    font-weight: 700;
                                    color: #0C7157;
                                    margin-bottom: 4px;
                                    font-family: 'Poppins', sans-serif;
                                ">${formatDate(booking.date)}</div>
                                <div style="
                                    font-size: 16px;
                                    color: #6b7280;
                                    font-family: 'Poppins', sans-serif;
                                    font-weight: 500;
                                ">${formatTime(booking.time)}</div>
                            </div>

                            <!-- Guests Card -->
                            <div style="
                                background: #fef7ff;
                                border-radius: 12px;
                                padding: 20px;
                                border-left: 4px solid #8b5cf6;
                            ">
                                <div style="
                                    display: flex;
                                    align-items: center;
                                    margin-bottom: 12px;
                                ">
                                    <div style="
                                        background: #8b5cf6;
                                        border-radius: 8px;
                                        padding: 8px;
                                        margin-right: 12px;
                                    ">
                                        <svg style="width: 18px; height: 18px;" fill="white" viewBox="0 0 20 20">
                                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                                        </svg>
                                    </div>
                                    <div style="
                                        font-size: 14px;
                                        font-weight: 600;
                                        color: #374151;
                                        font-family: 'Poppins', sans-serif;
                                        text-transform: uppercase;
                                        letter-spacing: 0.5px;
                                    ">Guests</div>
                                </div>
                                <div style="
                                    display: flex;
                                    gap: 16px;
                                    align-items: center;
                                ">
                                    ${booking.isVehicleBooking ? `
                                    <div>
                                        <div style="
                                            font-size: 18px;
                                            font-weight: 700;
                                            color: #8b5cf6;
                                            font-family: 'Poppins', sans-serif;
                                        ">Vehicle</div>
                                        <div style="
                                            font-size: 13px;
                                            color: #6b7280;
                                            font-family: 'Poppins', sans-serif;
                                        ">${booking.vehicleName || 'Private Vehicle'}</div>
                                        <div style="
                                            font-size: 12px;
                                            color: #6b7280;
                                            font-family: 'Poppins', sans-serif;
                                        ">${booking.vehicleSeatCapacity || 'N/A'} seats</div>
                                    </div>
                                    ` : `
                                    <div>
                                        <div style="
                                            font-size: 18px;
                                            font-weight: 700;
                                            color: #8b5cf6;
                                            font-family: 'Poppins', sans-serif;
                                        ">${booking.adults}</div>
                                        <div style="
                                            font-size: 13px;
                                            color: #6b7280;
                                            font-family: 'Poppins', sans-serif;
                                        ">Adult${booking.adults > 1 ? 's' : ''}</div>
                                    </div>
                                    ${booking.children > 0 ? `
                                    <div style="
                                        width: 1px;
                                        height: 30px;
                                        background: #d1d5db;
                                    "></div>
                                    <div>
                                        <div style="
                                            font-size: 18px;
                                            font-weight: 700;
                                            color: #8b5cf6;
                                            font-family: 'Poppins', sans-serif;
                                        ">${booking.children}</div>
                                        <div style="
                                            font-size: 13px;
                                            color: #6b7280;
                                            font-family: 'Poppins', sans-serif;
                                        ">Child${booking.children > 1 ? 'ren' : ''}</div>
                                        <div style="font-size:12px; color:#6b7280; margin-top:6px;">Age between 3 to 7 years</div>
                                    </div>
                                    ` : ''}
                                    `}
                                </div>
                                ${!booking.isVehicleBooking && booking.children > 0 ? `
                                <div style="display:flex; gap:16px; margin-top:8px;">
                                    <div style="flex:1;">
                                        <div style="font-size:12px; font-weight:600; color:#6b7280;">Age between 3 to 7 years</div>
                                    </div>
                                    <div style="flex:1;"></div>
                                </div>
                                ` : ''}
                                </div>
                            </div>
                        </div>

                        ${booking.packageType === 'transfer' && booking.from && booking.to ? `
                        <!-- Transfer Route Information -->
                        <div style="
                            background: #fef3e7;
                            border-radius: 12px;
                            padding: 24px;
                            margin-bottom: 24px;
                            border-left: 4px solid #f59e0b;
                        ">
                            <div style="
                                display: flex;
                                align-items: center;
                                margin-bottom: 16px;
                            ">
                                <div style="
                                    background: #f59e0b;
                                    border-radius: 8px;
                                    padding: 8px;
                                    margin-right: 12px;
                                ">
                                    <svg style="width: 18px; height: 18px;" fill="white" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
                                    </svg>
                                </div>
                                <div style="
                                    font-size: 14px;
                                    font-weight: 600;
                                    color: #374151;
                                    font-family: 'Poppins', sans-serif;
                                    text-transform: uppercase;
                                    letter-spacing: 0.5px;
                                ">Transfer Route</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 16px;">
                                <div style="flex: 1;">
                                    <div style="
                                        font-size: 12px;
                                        color: #6b7280;
                                        margin-bottom: 4px;
                                        font-family: 'Poppins', sans-serif;
                                        text-transform: uppercase;
                                        letter-spacing: 0.5px;
                                    ">From</div>
                                    <div style="
                                        font-size: 16px;
                                        font-weight: 600;
                                        color: #374151;
                                        font-family: 'Poppins', sans-serif;
                                    ">${booking.from}</div>
                                </div>
                                <div style="
                                    background: #f59e0b;
                                    border-radius: 50%;
                                    padding: 8px;
                                ">
                                    <svg style="width: 16px; height: 16px;" fill="white" viewBox="0 0 20 20">
                                        <path fill-rule="evenodd" d="M10.293 15.707a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 111.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                                    </svg>
                                </div>
                                <div style="flex: 1; text-align: right;">
                                    <div style="
                                        font-size: 12px;
                                        color: #6b7280;
                                        margin-bottom: 4px;
                                        font-family: 'Poppins', sans-serif;
                                        text-transform: uppercase;
                                        letter-spacing: 0.5px;
                                    ">To</div>
                                    <div style="
                                        font-size: 16px;
                                        font-weight: 600;
                                        color: #374151;
                                        font-family: 'Poppins', sans-serif;
                                    ">${booking.to}</div>
                                </div>
                            </div>
                        </div>
                        ` : ''}

                        <!-- Additional Information -->
                        <div style="
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 20px;
                            margin-bottom: 24px;
                        ">
                            <!-- Service Type -->
                            <div style="
                                background: #f0f9ff;
                                border-radius: 10px;
                                padding: 16px;
                                border-left: 3px solid #0ea5e9;
                            ">
                                <div style="
                                    font-size: 12px;
                                    color: #0ea5e9;
                                    margin-bottom: 6px;
                                    font-family: 'Poppins', sans-serif;
                                    text-transform: uppercase;
                                    letter-spacing: 0.5px;
                                    font-weight: 600;
                                ">Service Type</div>
                                <div style="
                                    font-size: 15px;
                                    font-weight: 600;
                                    color: #374151;
                                    font-family: 'Poppins', sans-serif;
                                ">${booking.packageType === 'tour' ? 'Tour Package' : 'Transfer Service'}</div>
                            </div>

                            ${booking.pickupLocation ? `
                            <!-- Pickup Location -->
                            <div style="
                                background: #f0fdf4;
                                border-radius: 10px;
                                padding: 16px;
                                border-left: 3px solid #22c55e;
                            ">
                                <div style="
                                    font-size: 12px;
                                    color: #22c55e;
                                    margin-bottom: 6px;
                                    font-family: 'Poppins', sans-serif;
                                    text-transform: uppercase;
                                    letter-spacing: 0.5px;
                                    font-weight: 600;
                                ">Pickup Location</div>
                                <div style="
                                    font-size: 15px;
                                    font-weight: 600;
                                    color: #374151;
                                    font-family: 'Poppins', sans-serif;
                                    line-height: 1.4;
                                ">${booking.pickupLocation}</div>
                            </div>
                            ` : `
                            <div></div>
                            `}
                            
                            <!-- Customer Name -->
                            <div style="
                                background: #fff7ed;
                                border-radius: 10px;
                                padding: 16px;
                                border-left: 3px solid #f97316;
                            ">
                                <div style="
                                    font-size: 12px;
                                    color: #f97316;
                                    margin-bottom: 6px;
                                    font-family: 'Poppins', sans-serif;
                                    text-transform: uppercase;
                                    letter-spacing: 0.5px;
                                    font-weight: 600;
                                ">Customer</div>
                                <div style="
                                    font-size: 15px;
                                    font-weight: 600;
                                    color: #374151;
                                    font-family: 'Poppins', sans-serif;
                                ">${booking.customerName}</div>
                            </div>
                        </div>

                        <!-- Payment Summary -->
                        <div style="
                            background: linear-gradient(135deg, #0C7157 0%, #0a5d4a 100%);
                            border-radius: 12px;
                            padding: 24px;
                            color: white;
                        ">
                            <div style="
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                            ">
                                <div style="
                                    display: flex;
                                    align-items: center;
                                ">
                                    <div style="
                                        background: rgba(255, 255, 255, 0.2);
                                        border-radius: 8px;
                                        padding: 8px;
                                        margin-right: 12px;
                                    ">
                                        <svg style="width: 20px; height: 20px;" fill="white" viewBox="0 0 20 20">
                                            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
                                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <div style="
                                            font-size: 16px;
                                            font-weight: 600;
                                            font-family: 'Poppins', sans-serif;
                                            opacity: 0.9;
                                        ">Total Amount Paid</div>
                                        <div style="
                                            font-size: 12px;
                                            opacity: 0.7;
                                            font-family: 'Poppins', sans-serif;
                                        ">Payment confirmed</div>
                                    </div>
                                </div>
                                <div style="
                                    font-size: 28px;
                                    font-weight: 700;
                                    font-family: 'Poppins', sans-serif;
                                    text-align: right;
                                ">${booking.currency} ${booking.total.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="text-align: center; margin: 36px 0;">
                    <a href="${tourDetailsUrl}" class="detail-value">
                        <svg class="icon" style="width: 18px; height: 18px; margin-right: 8px;" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                            <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
                        </svg>
                        View ${booking.packageType === 'tour' ? 'Tour' : 'Transfer'}
                    </a>
                </div>

                <div class="info-box">
                    <h3>
                        <svg class="icon info-icon" style="width: 18px; height: 18px; margin-right: 8px;" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                        </svg>
                        Important Information:
                    </h3>
                    <ul style="color: #8c7a00; padding-left: 20px; line-height: 1.8;">
                        <li>Be ready at your hotel's main gate 5 minutes before pick-up.</li>
                        <li>No child seats are available. Children must always be with an adult.</li>
                        <li>Pick-up times and locations may vary for each booking.</li>
                        <li>Cancellation Policy:
                            <ul style="margin-top:8px; padding-left:18px;">
                                <li>Cancel at least 72 hours in advance for a full refund.</li>
                                <li>No refund, cancellation, or date change within 72 hours.</li>
                            </ul>
                        </li>
                        <li>Carry cash for entrance fees, as most entry points at the destination do not accept cards.</li>
                        <li>Luggage and large backpacks cannot be brought on the tour.</li>
                        <li>Views depend on the weather and cannot be guaranteed.</li>
                    </ul>
                </div>

                <p class="email-text" style="margin-top: 30px; color: #444;">
                    If you have any questions please don't hesitate to contact us. We're here to make your experience unforgettable!
                </p>

                <p class="email-text" style="margin-top: 20px; color: #0C7157; font-weight: 600;">
                    Safe travels and see you soon!
                    <svg class="icon" style="width: 16px; height: 16px; margin-left: 8px;" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/>
                    </svg>
                </p>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>${emailConfig.from.name}</strong></p>
                <p>Your trusted travel partner</p>
                <div class="social-links">
                    <a href="mailto:${emailConfig.templates.supportEmail}">
                        <svg class="icon" style="width: 16px; height: 16px; margin-right: 4px;" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                        </svg>
                        Email
                    </a>
                    <a href="http://wa.me/60196592141">
                        <svg class="icon" style="width: 16px; height: 16px; margin-right: 4px;" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                        </svg>
                        Call
                    </a>
                    <a href="${emailConfig.templates.website}">
                        <svg class="icon" style="width: 16px; height: 16px; margin-right: 4px;" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clip-rule="evenodd"/>
                        </svg>
                        Website
                    </a>
                </div>
                <p style="font-size: 12px; color: #bbb; margin-top: 20px; font-family: 'Poppins', sans-serif;">
                    This email was sent to ${booking.customerEmail}<br>
                    © ${new Date().getFullYear()} ${emailConfig.from.name}. All rights reserved.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * Generate modern HTML email template for cart booking confirmation
   */
  private generateCartBookingConfirmationHTML(cartData: CartBookingEmailData): string {
    const formatDate = (dateString: string) => {
      try {
        if (!dateString) return "Invalid Date";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "Invalid Date";
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch {
        return "Invalid Date";
      }
    };

    const formatTime = (timeString: string) => {
      try {
        if (!timeString) return "Invalid Time";
        const [hours, minutes] = timeString.split(':');
        if (!hours || !minutes) return timeString;
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        if (isNaN(date.getTime())) return timeString;
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        return timeString;
      }
    };

    const logoUrl = emailConfig.templates.logo;
    const bannerUrl = `${emailConfig.templates.website}/images/email-banner.jpg`;
    const baseUrl = emailConfig.templates.website;

    const totalBookings = cartData.bookings.length;
    const totalGuests = cartData.bookings.reduce((total, booking) => {
      if (booking.isVehicleBooking) {
        return total + 1; // Count vehicle as 1 unit
      }
      return total + booking.adults + booking.children;
    }, 0);

    // Generate booking rows HTML
    const bookingRows = cartData.bookings.map((booking, index) => {
      const tourDetailsUrl = booking.packageType === 'tour' ? `${baseUrl}/tours/${booking.packageId}` : `${baseUrl}/transfers/${booking.packageId}`;
      
            // Use a compact table layout for more horizontal alignment in most mail clients
            const formattedDate = booking.date ? formatDate(booking.date) : 'Invalid Date';
            const formattedTime = booking.time ? formatTime(booking.time) : 'Invalid Time';
            const formattedTotal = typeof booking.total === 'number' ? booking.total.toFixed(2) : Number(booking.total || 0).toFixed(2);

            return `
                <div style="background: #f9f9f9; border-radius: 8px; padding: 12px; margin: 12px 0; border-left: 4px solid #0C7157;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                        <tr>
                            <td style="vertical-align: top; padding: 6px 8px;">
                                <div style="font-size: 16px; color: #0C7157; font-weight: 600;">Booking #${index + 1} - ${booking.packageName}</div>
                                <div style="color: #666; font-size: 13px; margin-top:6px;">Booking ID: <strong>#${String(booking.bookingId || '').slice(-8).toUpperCase()}</strong></div>
                            </td>
                            <td style="vertical-align: top; padding: 6px 8px; text-align: right; width: 160px;">
                                <div style="background: #0C7157; color: white; padding: 10px; border-radius: 8px; display: inline-block; min-width: 120px;">
                                    <div style="font-size: 12px; opacity: 0.9;">Amount</div>
                                    <div style="font-size: 18px; font-weight: 700;">${cartData.currency} ${formattedTotal}</div>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td colspan="2" style="padding-top: 10px;">
                                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                                    <tr>
                                        <td style="width: 50%; padding: 6px 8px; vertical-align: top; color: #444; font-size: 13px;">
                                            <div><strong>Date:</strong> ${formattedDate}</div>
                                            <div style="margin-top:4px;"><strong>Time:</strong> ${formattedTime}</div>
                                            <div style="margin-top:4px;"><strong>Guests:</strong> ${booking.isVehicleBooking ? 
                                              `Vehicle - ${booking.vehicleName || 'Private Vehicle'} (${booking.vehicleSeatCapacity || 'N/A'} seats)` : 
                                              `${booking.adults} adult${booking.adults > 1 ? 's' : ''}${booking.children > 0 ? `, ${booking.children} child${booking.children > 1 ? 'ren' : ''}` : ''}`
                                            }</div>
                                            ${booking.children > 0 ? `</div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="width: 50%; padding: 6px 8px; vertical-align: top; color: #444; font-size: 13px;">
                                                <div style="font-size:12px; font-weight:600; color:#6b7280;">Age between 3 to 7 years</div>
                                            </td>
                                            <td style="width: 50%; padding: 6px 8px; vertical-align: top; color: #444; font-size: 13px;">
                                            </td>
                                        </tr>
                                        ` : ''}
                                        </td>
                                        <td style="width: 50%; padding: 6px 8px; vertical-align: top; color: #444; font-size: 13px;">
                                            ${booking.pickupLocation ? `<div><strong>Pickup:</strong> ${booking.pickupLocation}</div>` : ''}
                                            <div style="margin-top:6px;"><strong>Type:</strong> ${booking.packageType === 'tour' ? 'Tour' : 'Transfer'}</div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </div>
            `;
     }).join('');

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Cart Booking Confirmation</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #222; background: #f6f6f6; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 16px rgba(12,113,87,0.08); }
            .header { background: linear-gradient(135deg, #0C7157, #0C7157); padding: 0; position: relative; overflow: hidden; }
            .header-content { position: relative; z-index: 2; padding: 40px 30px; text-align: center; color: white; }
            .text-logo { font-family: 'Poppins', sans-serif; font-weight: 500; font-size: 32px; margin-bottom: 20px; letter-spacing: 1px; color: white; }
            .header h1 { font-family: 'Poppins', sans-serif; font-size: 28px; font-weight: 600; margin-bottom: 10px; text-shadow: 0 2px 4px rgba(0,0,0,0.18); }
            .header p { font-family: 'Poppins', sans-serif; font-size: 16px; opacity: 0.95; font-weight: 400; }
            .content { padding: 40px 30px; }
            .greeting { font-family: 'Poppins', sans-serif; font-size: 18px; color: #0C7157; margin-bottom: 20px; font-weight: 600; }
            .summary-box { background: #e8f8f5; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #0C7157; }
            /* Use inline-table/flex friendly layout for email clients on wide screens */
            .summary-grid { display: flex; flex-direction: row; justify-content: space-between; gap: 12px; text-align: center; }
            .summary-item { display: inline-block; min-width: 28%; }
            .summary-number { font-size: 28px; font-weight: 700; color: #0C7157; margin-bottom: 5px; font-family: 'Poppins', sans-serif; }
            .summary-label { font-size: 14px; color: #666; font-family: 'Poppins', sans-serif; }
            .total-row { background: #0C7157; color: #fff; margin: 25px -30px -30px -30px; padding: 25px 30px; border-radius: 0 0 12px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
            .total-row .detail-label { color: #fff; font-size: 18px; font-family: 'Poppins', sans-serif; }
            .total-row .detail-value { color: #fff; font-size: 24px; font-weight: 700; font-family: 'Poppins', sans-serif; }
            .cta-button { display: inline-block; background: #0C7157; color: #fff; text-decoration: none; padding: 16px 36px; border-radius: 8px; font-family: 'Poppins', sans-serif; font-weight: 600; margin: 24px 0; text-align: center; box-shadow: 0 4px 12px rgba(12, 113, 87, 0.18); transition: transform 0.2s; font-size: 18px; letter-spacing: 0.5px; }
            .cta-button:hover { transform: translateY(-2px); background: #0a5c47; }
            .footer { background: #222; color: #fff; padding: 30px; text-align: center; border-radius: 0 0 12px 12px; }
            .footer a { color: #0C7157; text-decoration: none; }
            .footer p { font-family: 'Poppins', sans-serif; }
            .social-links { margin: 15px 0; }
            .social-links a { display: inline-block; margin: 0 10px; color: #0C7157; text-decoration: none; font-family: 'Poppins', sans-serif; }
            .info-box { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 25px 0; }
            .info-box h3 { font-family: 'Poppins', sans-serif; color: #8c7a00; margin-bottom: 10px; font-weight: 600; }
            .info-box ul { color: #8c7a00; padding-left: 20px; line-height: 1.8; font-family: 'Poppins', sans-serif; }
            .email-text { font-family: 'Poppins', sans-serif; }
            .icon { width: 16px; height: 16px; display: inline-block; margin-right: 8px; vertical-align: text-top; }
            @media (max-width: 600px) {
                .container { border-radius: 0; }
                .content { padding: 20px 15px; }
                .header-content { padding: 30px 15px; }
                .header h1 { font-size: 22px; }
                .text-logo { font-size: 24px; }
                .summary-grid { display: block; gap: 15px; }
                .summary-item { display: block; padding: 12px; background: #f9f9f9; border-radius: 8px; margin-bottom: 10px; }
                .total-row { font-size: 18px; padding: 20px 15px; margin: 25px -15px -15px -15px; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <!-- Header -->
            <div class="header">
                <div class="header-content">
                    <div class="text-logo">Mossy Forest Tours</div>
                    <h1>
                        <svg style="width: 24px; height: 24px; margin-right: 8px;" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                        Bookings Confirmed!
                    </h1>
                    <p>${totalBookings} booking${totalBookings > 1 ? 's' : ''} successfully booked</p>
                </div>
            </div>

            <!-- Content -->
            <div class="content">
                <div class="greeting">
                    <svg style="width: 18px; height: 18px; margin-right: 8px;" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                    </svg>
                    Hello ${cartData.customerName}!
                </div>

                <p class="email-text">Thank you for choosing ${emailConfig.from.name}! We're excited to confirm your ${totalBookings} booking${totalBookings > 1 ? 's' : ''} for amazing experiences.</p>

                <div class="summary-box">
                    <h2 style="color: #0C7157; margin-bottom: 20px; font-size: 20px; font-family: 'Poppins', sans-serif; font-weight: 600; text-align: center;">
                        <svg style="width: 20px; height: 20px; margin-right: 8px;" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                        </svg>
                        Booking Summary
                    </h2>
                    
                    <div class="summary-grid" role="presentation">
                        <div class="summary-item" role="presentation">
                            <div class="summary-number">${totalBookings}</div>
                            <div class="summary-label">Total Bookings</div>
                        </div>
                        <div class="summary-item" role="presentation">
                            <div class="summary-number">${totalGuests}</div>
                            <div class="summary-label">${cartData.bookings.some(b => b.isVehicleBooking) ? 'Guests/Vehicles' : 'Total Guests'}</div>
                        </div>
                        <div class="summary-item" role="presentation">
                            <div class="summary-number">${cartData.currency} ${cartData.totalAmount.toFixed(2)}</div>
                            <div class="summary-label">Total Amount</div>
                        </div>
                    </div>
                </div>

                <!-- Individual Bookings -->
                <h3 style="color: #0C7157; margin: 30px 0 20px 0; font-size: 18px; font-family: 'Poppins', sans-serif; font-weight: 600;">
                    Your Booking Details:
                </h3>
                
                ${bookingRows}

                <!-- Use safer spacing for totals to avoid horizontal overflow in mail clients -->
                <div class="total-row">
                    <span class="detail-label">
                        <svg style="width: 20px; height: 20px; margin-right: 8px;" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/>
                        </svg>
                        Grand Total:
                    </span>
                    <span class="detail-value">${cartData.currency} ${cartData.totalAmount.toFixed(2)}</span>
                </div>

                <div class="info-box">
                    <h3>
                        <svg style="width: 18px; height: 18px; margin-right: 8px;" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                        </svg>
                        Important Information:
                    </h3>
                    <ul>
                        <li>Please arrive 15 minutes before each scheduled time</li>
                        <li>Bring a valid ID and this confirmation email for each booking</li>
                        <li>Each booking may have different pickup locations and times</li>
                        <li>For any changes, contact us at least 24 hours in advance</li>
                        <li>Weather conditions may affect outdoor activities</li>
                    </ul>
                </div>

                <p class="email-text" style="margin-top: 30px; color: #444;">
                    If you have any questions please don't hesitate to contact us. We're here to make your experience unforgettable!
                </p>

                <p class="email-text" style="margin-top: 20px; color: #0C7157; font-weight: 600;">
                    Safe travels and see you soon!
                    <svg style="width: 16px; height: 16px; margin-left: 8px;" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/>
                    </svg>
                </p>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>${emailConfig.from.name}</strong></p>
                <p>Your trusted travel partner</p>
                <div class="social-links">
                    <a href="mailto:${emailConfig.templates.supportEmail}">
                        <svg style="width: 16px; height: 16px; margin-right: 4px;" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                        </svg>
                        Email
                    </a>
                    <a href="tel:${emailConfig.templates.supportPhone}">
                        <svg style="width: 16px; height: 16px; margin-right: 4px;" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                        </svg>
                        Call
                    </a>
                    <a href="${emailConfig.templates.website}">
                        <svg style="width: 16px; height: 16px; margin-right: 4px;" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clip-rule="evenodd"/>
                        </svg>
                        Website
                    </a>
                </div>
                <p style="font-size: 12px; color: #bbb; margin-top: 20px; font-family: 'Poppins', sans-serif;">
                    This email was sent to ${cartData.customerEmail}<br>
                    © ${new Date().getFullYear()} ${emailConfig.from.name}. All rights reserved.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * Generate review request email HTML template
   */
  generateReviewRequestHTML(reviewData: ReviewEmailData): string {
    const formatDate = (dateString: string) => {
      try {
        if (!dateString) return "Invalid Date";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "Invalid Date";
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch {
        return "Invalid Date";
      }
    };

    const formatTime = (timeString: string) => {
      try {
        if (!timeString) return "Invalid Time";
        const [hours, minutes] = timeString.split(':');
        if (!hours || !minutes) return timeString;
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        if (isNaN(date.getTime())) return timeString;
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        return timeString;
      }
    };

    const logoUrl = emailConfig.templates.logo;
    const baseUrl = emailConfig.templates.website;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Share Your Experience</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Poppins', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f4f4f4;
            }
            .container {
                max-width: 600px;
                margin: 20px auto;
                background-color: #ffffff;
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 0 20px rgba(0,0,0,0.1);
            }
            .header {
                background: linear-gradient(135deg, #0C7157 0%, #0C7157 100%);
                color: white;
                text-align: center;
                padding: 40px 20px;
            }
            .logo {
                width: 120px;
                height: auto;
                margin-bottom: 20px;
            }
            .company-name {
                font-size: 28px;
                font-weight: 700;
                margin: 10px 0;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            }
            .tagline {
                font-size: 16px;
                opacity: 0.9;
                font-weight: 300;
            }
            .content {
                padding: 40px 30px;
            }
            .greeting {
                font-size: 24px;
                color: #0C7157;
                margin-bottom: 20px;
                font-weight: 600;
            }
            .message {
                font-size: 16px;
                margin-bottom: 30px;
                line-height: 1.8;
                color: #555;
            }
            .booking-summary {
                background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                border-left: 4px solid #0C7157;
                padding: 20px;
                margin: 30px 0;
                border-radius: 8px;
            }
            .booking-summary h3 {
                color: #0C7157;
                margin-bottom: 15px;
                font-size: 18px;
                font-weight: 600;
            }
            .booking-detail {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                font-size: 15px;
            }
            .booking-detail strong {
                color: #333;
                font-weight: 600;
            }
            .review-section {
                background: linear-gradient(135deg, #0C7157 0%, #0a5d4a 100%);
                color: white;
                padding: 30px;
                margin: 30px 0;
                border-radius: 12px;
                text-align: center;
            }
            .review-title {
                font-size: 22px;
                font-weight: 600;
                margin-bottom: 15px;
            }
            .review-description {
                font-size: 16px;
                margin-bottom: 25px;
                opacity: 0.9;
                line-height: 1.6;
            }
            .review-button {
                display: inline-block;
                background: white;
                color: #0C7157;
                padding: 15px 30px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                font-size: 16px;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            }
            .review-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            }
            .stars {
                font-size: 24px;
                margin-bottom: 15px;
            }
            .footer {
                background-color: #f8f9fa;
                text-align: center;
                padding: 30px 20px;
                color: #666;
            }
            .footer p {
                margin-bottom: 10px;
            }
            .social-links {
                margin: 20px 0;
            }
            .social-links a {
                display: inline-block;
                margin: 0 10px;
                color: #0C7157;
                text-decoration: none;
                font-weight: 500;
                transition: color 0.3s ease;
            }
            .social-links a:hover {
                color: #0a5d4a;
            }
            @media (max-width: 600px) {
                .container {
                    margin: 10px;
                    border-radius: 0;
                }
                .content {
                    padding: 20px;
                }
                .header {
                    padding: 30px 20px;
                }
                .company-name {
                    font-size: 24px;
                }
                .greeting {
                    font-size: 20px;
                }
                .booking-detail {
                    flex-direction: column;
                    gap: 5px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <!-- Header -->
            <div class="header">
                <img src="${logoUrl}" alt="Company Logo" class="logo">
                <div class="company-name">${emailConfig.from.name}</div>
                <div class="tagline">Your trusted travel partner</div>
            </div>

            <!-- Content -->
            <div class="content">
                <div class="greeting">
                    Thank you, ${reviewData.customerName}! 🙏
                </div>

                <div class="message">
                    We hope you had an amazing experience with our ${reviewData.packageType}! 
                    Your journey with us has come to an end, and we'd love to hear about your experience.
                </div>

                <div class="booking-summary">
                    <h3>📋 Your Booking Summary</h3>
                    <div class="booking-detail">
                        <span><strong>Booking ID:</strong></span>
                        <span>#${reviewData.bookingId}</span>
                    </div>
                    <div class="booking-detail">
                        <span><strong>Service:</strong></span>
                        <span>${reviewData.packageName}</span>
                    </div>
                    <div class="booking-detail">
                        <span><strong>Date:</strong></span>
                        <span>${formatDate(reviewData.date)}</span>
                    </div>
                    <div class="booking-detail">
                        <span><strong>Time:</strong></span>
                        <span>${formatTime(reviewData.time)}</span>
                    </div>
                </div>

                <div class="message">
                    Your feedback helps us improve our services and assists future travelers in making informed decisions. 
                    It only takes a few minutes and means the world to us! 🌟
                </div>

                <div class="review-section">
                    <div class="stars">⭐⭐⭐⭐⭐</div>
                    <div class="review-title">Share Your Experience</div>
                    <div class="review-description">
                        Click the button below to share your thoughts about our service. 
                        Your honest feedback is invaluable to us and other travelers!
                    </div>
                    <a href="${reviewData.reviewFormUrl}" class="review-button">
                        📝 Leave a Review
                    </a>
                </div>

                <div class="message">
                    Thank you for choosing ${emailConfig.from.name}. We look forward to serving you again soon! 
                    <br><br>
                    Warm regards,<br>
                    <strong>The ${emailConfig.from.name} Team</strong>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p><strong>${emailConfig.from.name}</strong></p>
                <p>Your trusted travel partner</p>
                <div class="social-links">
                    <a href="mailto:${emailConfig.templates.supportEmail}">
                        <svg style="width: 16px; height: 16px; margin-right: 4px;" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                        </svg>
                        Email
                    </a>
                    <a href="tel:${emailConfig.templates.supportPhone}">
                        <svg style="width: 16px; height: 16px; margin-right: 4px;" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                        </svg>
                        Call
                    </a>
                    <a href="${emailConfig.templates.website}">
                        <svg style="width: 16px; height: 16px; margin-right: 4px;" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clip-rule="evenodd"/>
                        </svg>
                        Website
                    </a>
                </div>
                <p style="font-size: 12px; color: #bbb; margin-top: 20px; font-family: 'Poppins', sans-serif;">
                    This email was sent to ${reviewData.customerEmail}<br>
                    © ${new Date().getFullYear()} ${emailConfig.from.name}. All rights reserved.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * Generate booking notification HTML for admin (SMTP version)
   */
  private generateBookingNotificationHTML(booking: BookingEmailData): string {
    const formatDate = (dateString: string) => {
      try {
        if (!dateString) return "Invalid Date";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "Invalid Date";
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch {
        return "Invalid Date";
      }
    };

    const formatTime = (timeString: string) => {
      try {
        if (!timeString) return "Invalid Time";
        const [hours, minutes] = timeString.split(':');
        if (!hours || !minutes) return timeString;
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        if (isNaN(date.getTime())) return timeString;
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        return timeString;
      }
    };

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Booking Notification</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f6f6f6; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; }
            .booking-details { background: #f9f9f9; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px 0; border-bottom: 1px solid #eee; }
            .detail-label { font-weight: bold; color: #555; }
            .detail-value { color: #333; }
            .total-row { background: #dc2626; color: white; padding: 15px; border-radius: 6px; margin-top: 15px; }
            .urgent { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 15px; border-radius: 6px; margin: 15px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔔 New Booking Alert</h1>
                <p>A new booking has been received</p>
            </div>
            
            <div class="content">
                <div class="urgent">
                    <strong>🚨 ACTION REQUIRED:</strong> A new booking has been placed and requires your attention.
                </div>
                
                <h2 style="color: #dc2626; margin-bottom: 15px;">Booking Details</h2>
                
                <div class="booking-details">
                    <div class="detail-row">
                        <span class="detail-label">Booking ID:</span>
                        <span class="detail-value">#${booking.bookingId.slice(-8).toUpperCase()}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Package:</span>
                        <span class="detail-value">${booking.packageName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Type:</span>
                        <span class="detail-value">${booking.packageType === 'tour' ? 'Tour Package' : 'Transfer Service'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Customer:</span>
                        <span class="detail-value">${booking.customerName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Email:</span>
                        <span class="detail-value">${booking.customerEmail}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Date:</span>
                        <span class="detail-value">${formatDate(booking.date)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Time:</span>
                        <span class="detail-value">${formatTime(booking.time)}</span>
                    </div>
                    ${booking.packageType === 'transfer' && booking.from && booking.to ? `
                    <div class="detail-row">
                        <span class="detail-label">From:</span>
                        <span class="detail-value">${booking.from}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">To:</span>
                        <span class="detail-value">${booking.to}</span>
                    </div>
                    ` : ''}
                    ${booking.isVehicleBooking ? `
                    <div class="detail-row">
                        <span class="detail-label">Vehicle:</span>
                        <span class="detail-value">${booking.vehicleName || 'Private Vehicle'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Seat Capacity:</span>
                        <span class="detail-value">${booking.vehicleSeatCapacity || 'N/A'} seats</span>
                    </div>
                    ` : `
                    <div class="detail-row">
                        <span class="detail-label">Adults:</span>
                        <span class="detail-value">${booking.adults}</span>
                    </div>
                    ${booking.children > 0 ? `
                    <div class="detail-row">
                        <span class="detail-label">Children:</span>
                        <span class="detail-value">${booking.children}</span>
                    </div>
                    ` : ''}
                    `}
                    ${booking.pickupLocation ? `
                    <div class="detail-row">
                        <span class="detail-label">Pickup Location:</span>
                        <span class="detail-value">${booking.pickupLocation}</span>
                    </div>
                    ` : ''}
                    
                    <div class="total-row">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span><strong>Total Amount:</strong></span>
                            <span><strong>${booking.currency} ${booking.total.toFixed(2)}</strong></span>
                        </div>
                    </div>
                </div>
                
                <div style="background: #e8f8f5; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <p><strong>⏰ Booking Time:</strong> ${new Date().toLocaleString()}</p>
                    <p><strong>📧 Confirmation Email:</strong> Sent to customer at ${booking.customerEmail}</p>
                </div>
                
                <p style="margin-top: 20px; color: #666;">
                    Please review this booking and take any necessary actions. The customer has been sent a confirmation email.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  /**
   * Generate cart booking notification HTML for admin (SMTP version)
   */
  private generateCartBookingNotificationHTML(cartData: CartBookingEmailData): string {
    const formatDate = (dateString: string) => {
      try {
        if (!dateString) return "Invalid Date";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "Invalid Date";
        return date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
      } catch {
        return "Invalid Date";
      }
    };

    const formatTime = (timeString: string) => {
      try {
        if (!timeString) return "Invalid Time";
        const [hours, minutes] = timeString.split(':');
        if (!hours || !minutes) return timeString;
        const date = new Date();
        date.setHours(parseInt(hours), parseInt(minutes));
        if (isNaN(date.getTime())) return timeString;
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        return timeString;
      }
    };

    const bookingRows = cartData.bookings.map((booking, index) => `
      <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 15px; margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h4 style="color: #dc2626; margin: 0;">Booking ${index + 1}</h4>
          <span style="background: #dc2626; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
            #${booking.bookingId.slice(-6).toUpperCase()}
          </span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
          <div><strong>Package:</strong> ${booking.packageName}</div>
          <div><strong>Type:</strong> ${booking.packageType === 'tour' ? 'Tour' : 'Transfer'}</div>
          <div><strong>Date:</strong> ${formatDate(booking.date)}</div>
          <div><strong>Time:</strong> ${formatTime(booking.time)}</div>
          ${booking.isVehicleBooking ? `
          <div><strong>Vehicle:</strong> ${booking.vehicleName || 'Private Vehicle'}</div>
          <div><strong>Seats:</strong> ${booking.vehicleSeatCapacity || 'N/A'}</div>
          ` : `
          <div><strong>Adults:</strong> ${booking.adults}</div>
          <div><strong>Children:</strong> ${booking.children}</div>
          `}
          ${booking.pickupLocation ? `
          <div style="grid-column: 1 / -1;"><strong>Pickup:</strong> ${booking.pickupLocation}</div>
          ` : ''}
          <div style="grid-column: 1 / -1; text-align: right; margin-top: 8px;">
            <strong style="color: #dc2626; font-size: 16px;">${cartData.currency} ${booking.total.toFixed(2)}</strong>
          </div>
        </div>
      </div>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Cart Booking Notification</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f6f6f6; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; }
            .summary { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .urgent { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 15px; border-radius: 6px; margin: 15px 0; }
            .total-summary { background: #dc2626; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🛒 Cart Booking Alert</h1>
                <p>${cartData.bookings.length} new bookings from cart purchase</p>
            </div>
            
            <div class="content">
                <div class="urgent">
                    <strong>🚨 MULTIPLE BOOKINGS:</strong> A customer has purchased ${cartData.bookings.length} items from their cart.
                </div>
                
                <div class="summary">
                    <h3 style="color: #dc2626; margin-bottom: 15px;">Customer Information</h3>
                    <p><strong>Name:</strong> ${cartData.customerName}</p>
                    <p><strong>Email:</strong> ${cartData.customerEmail}</p>
                    <p><strong>Booking Time:</strong> ${new Date().toLocaleString()}</p>
                </div>
                
                <h3 style="color: #dc2626; margin: 25px 0 15px 0;">All Bookings (${cartData.bookings.length} items):</h3>
                ${bookingRows}
                
                <div class="total-summary">
                    <h3>Total Cart Amount</h3>
                    <div style="font-size: 24px; font-weight: bold; margin-top: 10px;">
                        ${cartData.currency} ${cartData.totalAmount.toFixed(2)}
                    </div>
                </div>
                
                <div style="background: #e8f8f5; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <p><strong>📧 Customer Notification:</strong> A consolidated confirmation email has been sent to ${cartData.customerEmail}</p>
                    <p><strong>💳 Payment Status:</strong> All bookings are pending payment confirmation</p>
                </div>
                
                <p style="margin-top: 20px; color: #666;">
                    Please review all ${cartData.bookings.length} bookings and take necessary actions. Each booking has been created with a unique booking ID.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
  }
}

export default new EmailService();
