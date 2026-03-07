import { Request, Response } from 'express';
import Stripe from 'stripe';
import BookingService from '../services/booking.service';
import WebhookEvent from '../models/WebhookEvent';
import FailedWebhookEvent from '../models/FailedWebhookEvent';
import mongoose from 'mongoose';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-08-27.basil' });
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

// Helper function to create booking from payment intent metadata
async function createBookingFromPaymentIntent(intent: Stripe.PaymentIntent): Promise<any> {
  try {
    const metadata = intent.metadata;
    
    // Validate required metadata
    if (!metadata.packageType || !metadata.packageId || !metadata.date || !metadata.time || !metadata.customerEmail || !metadata.customerName) {
      console.error('❌ Missing required metadata to create booking:', metadata);
      return null;
    }

    console.log('📝 Creating booking from payment intent metadata:', {
      packageType: metadata.packageType,
      packageId: metadata.packageId,
      customerEmail: metadata.customerEmail,
      date: metadata.date,
      time: metadata.time
    });

    // Parse booking data from metadata
    const adults = parseInt(metadata.adults || '1', 10);
    const children = parseInt(metadata.children || '0', 10);
    
    // Validate parsed numbers
    if (isNaN(adults) || adults < 1 || adults > 50) {
      console.error('❌ Invalid adults value:', metadata.adults);
      return null;
    }
    if (isNaN(children) || children < 0 || children > 20) {
      console.error('❌ Invalid children value:', metadata.children);
      return null;
    }
    
    const amount = intent.amount / 100; // Convert from cents
    const currency = intent.currency.toUpperCase();
    
    // Calculate bank charge (2.8% for Stripe)
    const bankCharge = Math.round(amount * 0.028 * 100) / 100;
    
    // Prepare booking data
    const bookingData = {
      packageType: metadata.packageType as 'tour' | 'transfer',
      packageId: new mongoose.Types.ObjectId(metadata.packageId),
      date: new Date(metadata.date),
      time: metadata.time,
      adults,
      children,
      pickupLocation: metadata.pickupLocation || 'To be confirmed',
      contactInfo: {
        name: (metadata.customerName || '').substring(0, 100),
        email: metadata.customerEmail,
        phone: (metadata.phone || '').substring(0, 20),
        whatsapp: (metadata.whatsapp || '').substring(0, 20)
      },
      subtotal: amount,
      total: amount,
      paymentInfo: {
        amount,
        bankCharge,
        currency,
        paymentStatus: 'succeeded',
        stripePaymentIntentId: intent.id,
        paymentMethod: 'stripe'
      },
      isVehicleBooking: metadata.bookingType === 'single' && metadata.packageType === 'transfer',
      vehicleSeatCapacity: metadata.vehicleSeatCapacity ? (() => {
        const capacity = parseInt(metadata.vehicleSeatCapacity, 10);
        return (!isNaN(capacity) && capacity > 0 && capacity <= 50) ? capacity : undefined;
      })() : undefined
    };

    // Create booking using the service
    const booking = await BookingService.createBookingDirect(bookingData);
    
    console.log('✅ Booking created from webhook:', booking._id);
    
    // Send confirmation email
    try {
      const { EmailService } = require('../services/email.service');
      const emailService = new EmailService();
      
      // Fetch package details for email
      let packageDetails: any = null;
      if (bookingData.packageType === 'tour') {
        const TourModel = mongoose.model('Tour');
        packageDetails = await TourModel.findById(bookingData.packageId);
      } else if (bookingData.packageType === 'transfer') {
        const TransferModel = mongoose.model('Transfer');
        packageDetails = await TransferModel.findById(bookingData.packageId);
      }
      
      const emailData = {
        customerName: bookingData.contactInfo.name,
        customerEmail: bookingData.contactInfo.email,
        bookingId: booking._id.toString(),
        packageName: packageDetails?.title || `${bookingData.packageType} Package`,
        packageType: bookingData.packageType,
        date: bookingData.date,
        time: bookingData.time,
        adults: bookingData.adults,
        children: bookingData.children,
        pickupLocation: bookingData.pickupLocation,
        pickupGuidelines: packageDetails?.details?.pickupGuidelines || packageDetails?.details?.pickupDescription,
        total: bookingData.total,
        currency: bookingData.paymentInfo.currency
      };
      
      const emailSent = await emailService.sendBookingConfirmation(emailData);
      
      if (emailSent) {
        console.log('✅ Confirmation email sent for webhook-created booking');
        // Mark email as sent
        const BookingModel = require('../models/Booking').default;
        await BookingModel.findByIdAndUpdate(booking._id, {
          $set: {
            confirmationEmailSent: true,
            confirmationEmailSentAt: new Date()
          }
        });
      } else {
        console.error('⚠️ Failed to send confirmation email for webhook-created booking');
      }
    } catch (emailError) {
      console.error('❌ Error sending confirmation email from webhook:', emailError);
      // Don't fail the booking creation if email fails
    }
    
    return booking;
  } catch (error) {
    console.error('❌ Error creating booking from payment intent:', error);
    throw error;
  }
}

// Stripe requires the raw body to verify signature. Ensure rawBody is available in express middleware.
export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string | undefined;
  let event: Stripe.Event;

  try {
    if (!sig) throw new Error('Missing stripe signature');
    // express.raw middleware places the raw Buffer in req.body
    const rawBody = (req as any).body;
    
    // Debug logging
    console.log('🔍 Webhook Debug Info:');
    console.log('- Signature present:', !!sig);
    console.log('- Body type:', typeof rawBody);
    console.log('- Body is Buffer:', Buffer.isBuffer(rawBody));
    console.log('- Body length:', rawBody?.length);
    console.log('- Endpoint secret configured:', !!endpointSecret);
    console.log('- Webhook secret prefix:', endpointSecret?.substring(0, 15) + '...');
    console.log('- Signature header:', sig?.substring(0, 50) + '...');
    
    // Ensure we have a Buffer
    if (!Buffer.isBuffer(rawBody)) {
      console.error('❌ Body is not a Buffer, it is:', typeof rawBody);
      throw new Error('Request body must be a raw Buffer for signature verification');
    }
    
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: any) {
    console.error('Stripe webhook signature verification failed:', err.message || err);
    return res.status(400).send(`Webhook Error: ${err.message || err}`);
  }

  try {
    // Dedupe: save event first to ensure idempotency even if processing fails
    const existing = await (WebhookEvent as any).findOne({ eventId: event.id });
    if (existing) {
      console.log(`🔁 Skipping already processed event ${event.id}`);
      return res.json({ received: true });
    }

    // Create webhook event record BEFORE processing
    await (WebhookEvent as any).create({ eventId: event.id, source: 'stripe', receivedAt: new Date() });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = session.metadata?.bookingId;
        const paymentIntentId = session.payment_intent as string | undefined;
        const amount = session.amount_total ? (session.amount_total / 100) : undefined;
        const currency = session.currency || undefined;
        await BookingService.handleStripeSuccess({ bookingId, paymentIntentId, sessionId: session.id, amount, currency });
        break;
      }
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const bookingId = intent.metadata?.bookingId;
        const amount = intent.amount ? (intent.amount / 100) : undefined;
        
        // Confirm the pre-created pending booking — slot is already reserved, just flip status
        const updatedBooking = await BookingService.handleStripeSuccess({ bookingId, paymentIntentId: intent.id, amount, currency: intent.currency });
        
        if (!updatedBooking) {
          // Booking not found — this should not happen because createPaymentIntent always pre-creates it.
          // Log for admin investigation but do NOT create a new booking here (would duplicate).
          console.error('🚨 WEBHOOK: No booking found for payment intent:', intent.id, '— manual review required');
          try {
            await (FailedWebhookEvent as any).create({
              eventId: event.id,
              eventType: event.type,
              source: 'stripe',
              paymentIntentId: intent.id,
              customerEmail: intent.metadata.customerEmail,
              amount: intent.amount / 100,
              currency: intent.currency,
              metadata: intent.metadata,
              errorMessage: 'No pre-created booking found for this payment intent',
              resolved: false
            });
          } catch (logError) {
            console.error('❌ Failed to log missing booking event:', logError);
          }
        } else {
          console.log('✅ WEBHOOK: Booking confirmed:', updatedBooking._id);

          // Send confirmation email — webhook is the sole authority for emails
          if (!updatedBooking.confirmationEmailSent) {
            try {
              const { EmailService } = require('../services/email.service');
              const emailService = new EmailService();

              // Fetch package details for email
              let packageDetails: any = null;
              const packageType = updatedBooking.packageType || intent.metadata.packageType;
              const packageId = updatedBooking.packageId;

              if (packageType === 'tour') {
                const TourModel = mongoose.model('Tour');
                packageDetails = await TourModel.findById(packageId);
              } else if (packageType === 'transfer') {
                const TransferModel = mongoose.model('Transfer');
                packageDetails = await TransferModel.findById(packageId);
              }

              const emailData: any = {
                customerName: updatedBooking.contactInfo?.name || intent.metadata.customerName,
                customerEmail: updatedBooking.contactInfo?.email || intent.metadata.customerEmail,
                bookingId: updatedBooking._id.toString(),
                packageId,
                packageName: packageDetails?.title || `${packageType} Package`,
                packageType,
                date: updatedBooking.date,
                time: updatedBooking.time,
                adults: updatedBooking.adults,
                children: updatedBooking.children || 0,
                pickupLocation: updatedBooking.pickupLocation,
                total: updatedBooking.total,
                currency: updatedBooking.paymentInfo?.currency || intent.currency.toUpperCase()
              };

              // Add transfer-specific details
              if (packageType === 'transfer' && packageDetails) {
                emailData.from = packageDetails.from;
                emailData.to = packageDetails.to;
                if (packageDetails.type === 'Private') {
                  emailData.isVehicleBooking = true;
                  emailData.vehicleName = packageDetails.vehicle;
                  emailData.vehicleSeatCapacity = packageDetails.seatCapacity;
                }
              }

              // Add vehicle information for private tours
              if (packageType === 'tour' && packageDetails && packageDetails.type === 'private') {
                emailData.isVehicleBooking = true;
                emailData.vehicleName = packageDetails.vehicle;
                emailData.vehicleSeatCapacity = packageDetails.seatCapacity;
              }

              // Add pickup guidelines
              if (packageDetails?.details?.pickupGuidelines) {
                emailData.pickupGuidelines = packageDetails.details.pickupGuidelines;
              } else if (packageType === 'transfer' && (packageDetails?.details as any)?.pickupDescription) {
                emailData.pickupGuidelines = (packageDetails.details as any).pickupDescription;
              }

              const emailSent = await emailService.sendBookingConfirmation(emailData);

              if (emailSent) {
                console.log('✅ WEBHOOK: Confirmation email sent for booking:', updatedBooking._id);
                const BookingModel = require('../models/Booking').default;
                await BookingModel.findByIdAndUpdate(updatedBooking._id, {
                  $set: { confirmationEmailSent: true, confirmationEmailSentAt: new Date() }
                });
              } else {
                console.error('⚠️ WEBHOOK: Failed to send confirmation email for booking:', updatedBooking._id);
              }
            } catch (emailError) {
              console.error('❌ WEBHOOK: Error sending confirmation email:', emailError);
              // Don't fail the webhook response on email error — Stripe will retry the event
            }
          } else {
            console.log('ℹ️ WEBHOOK: Confirmation email already sent for booking:', updatedBooking._id);
          }
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        // Only handle actual payment failures, not automatic cancellations
        const intent = event.data.object as Stripe.PaymentIntent;
        const bookingId = intent.metadata?.bookingId;
        const reason = intent.last_payment_error?.message || event.type;
        await BookingService.handleStripeFailure({ bookingId, paymentIntentId: intent.id, reason });
        break;
      }
      case 'payment_intent.canceled': {
        // Do NOT automatically mark bookings as cancelled for Stripe auto-cancellations
        // Only process if there's a specific failure reason indicating genuine user/card issues
        const intent = event.data.object as Stripe.PaymentIntent;
        const hasPaymentError = intent.last_payment_error && intent.last_payment_error.code !== 'payment_intent_unexpected_state';
        
        if (hasPaymentError) {
          console.log('🔍 Processing payment_intent.canceled with genuine payment error:', intent.last_payment_error);
          const bookingId = intent.metadata?.bookingId;
          const reason = intent.last_payment_error?.message || 'payment_failed';
          await BookingService.handleStripeFailure({ bookingId, paymentIntentId: intent.id, reason });
        } else {
          console.log('🚫 Ignoring automatic payment_intent.canceled without payment error (likely tab switch/timeout)');
        }
        break;
      }
      default:
        // ignore other events
        break;
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('Error handling stripe webhook:', err);
    res.status(500).send();
  }
}
