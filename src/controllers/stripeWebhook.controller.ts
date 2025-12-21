import { Request, Response } from 'express';
import Stripe from 'stripe';
import BookingService from '../services/booking.service';
import WebhookEvent from '../models/WebhookEvent';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-08-27.basil' });
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

// Stripe requires the raw body to verify signature. Ensure rawBody is available in express middleware.
export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string | undefined;
  let event: Stripe.Event;

  try {
    if (!sig) throw new Error('Missing stripe signature');
    // express.raw middleware places the raw Buffer in req.body
    const rawBody = (req as any).body;
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: any) {
    console.error('Stripe webhook signature verification failed:', err.message || err);
    return res.status(400).send(`Webhook Error: ${err.message || err}`);
  }

  try {
    // Dedupe: skip processing if event id already seen
    const existing = await (WebhookEvent as any).findOne({ eventId: event.id });
    if (existing) {
      console.log(`🔁 Skipping already processed event ${event.id}`);
      return res.json({ received: true });
    }

    await (WebhookEvent as any).create({ eventId: event.id, source: 'stripe' });

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
        await BookingService.handleStripeSuccess({ bookingId, paymentIntentId: intent.id, amount, currency: intent.currency });
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
