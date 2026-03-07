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
    
    // IDEMPOTENCY: Check if booking already exists for this payment intent
    // This prevents duplicate bookings if webhook is retried or called twice
    const BookingModel = require('../models/Booking').default;
    const existingBooking = await BookingModel.findOne({
      $or: [
        { 'paymentInfo.stripePaymentIntentId': intent.id },
        { 'paymentInfo.paymentIntentId': intent.id }
      ]
    });
    if (existingBooking) {
      console.log('ℹ️ Booking already exists for payment intent:', intent.id, '→', existingBooking._id);
      return existingBooking;
    }
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
        
        // Check if booking already exists (in case webhook fires twice or another process created it)
        let existingBooking = null;
        if (bookingId) {
          existingBooking = await (require('../models/Booking').default).findById(bookingId);
        }
        
        if (!existingBooking) {
          // No existing booking — create it from payment intent metadata (primary flow)
          console.log('📝 WEBHOOK: Creating booking from payment intent metadata...');
          existingBooking = await createBookingFromPaymentIntent(intent);
          
          if (!existingBooking) {
            console.error('🚨 WEBHOOK: Failed to create booking from payment intent:', intent.id);
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
                errorMessage: 'Failed to create booking from payment intent metadata',
                resolved: false
              });
            } catch (logError) {
              console.error('❌ Failed to log failed booking creation:', logError);
            }
          } else {
            console.log('✅ WEBHOOK: Booking created successfully:', existingBooking._id);
          }
        } else {
          // Booking exists — just confirm it (edge case: if something pre-created it)
          console.log('✅ WEBHOOK: Booking already exists, confirming:', existingBooking._id);
          const updatedBooking = await BookingService.handleStripeSuccess({ 
            bookingId: existingBooking._id.toString(), 
            paymentIntentId: intent.id, 
            amount, 
            currency: intent.currency 
          });
          
          if (updatedBooking) {
            existingBooking = updatedBooking;
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
        // Cancel the pre-created pending booking when payment intent is canceled
        // This handles both payment failures AND user abandonment (tab close, timeout, etc)
        const intent = event.data.object as Stripe.PaymentIntent;
        const bookingId = intent.metadata?.bookingId;
        const reason = intent.last_payment_error?.message || 'Payment cancelled or abandoned';
        
        console.log('🔍 Processing payment_intent.canceled for booking:', bookingId, '| Reason:', reason);
        await BookingService.handleStripeFailure({ bookingId, paymentIntentId: intent.id, reason });
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
