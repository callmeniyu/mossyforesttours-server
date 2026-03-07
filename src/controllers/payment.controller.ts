// Import Stripe using require to avoid module resolution issues on some systems
const Stripe = require('stripe');
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { EmailService } from '../services/email.service';
// TimeSlotService used to update timeslot bookedCount; import once to avoid redeclaration
const { TimeSlotService } = require('../services/timeSlot.service');

// Validate that Stripe secret key is available
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

console.log('[STRIPE] Initializing Stripe with API key:', process.env.STRIPE_SECRET_KEY?.substring(0, 12) + '...');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

export class PaymentController {
  // Helper method to check email configuration
  private static checkEmailConfiguration(): { canSendEmail: boolean; method: string; issues: string[] } {
    const issues: string[] = [];
    let method = 'none';
    let canSendEmail = false;

    // Check Brevo configuration
    if (process.env.BREVO_API_KEY) {
      method = 'brevo';
      canSendEmail = true;
    } else {
      issues.push('BREVO_API_KEY not set');
    }

    // Check SMTP configuration if Brevo is not available
    if (!canSendEmail) {
      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        method = 'smtp';
        canSendEmail = true;
      } else {
        if (!process.env.SMTP_USER) issues.push('SMTP_USER not set');
        if (!process.env.SMTP_PASS) issues.push('SMTP_PASS not set');
      }
    }

    return { canSendEmail, method, issues };
  }
  // Create payment intent for single booking
  static async createPaymentIntent(req: Request, res: Response) {
    try {
      console.log('[PAYMENT] Creating payment intent for single booking:', req.body);

      const {
        amount,
        currency = 'myr',
        bookingData,
        metadata = {}
      } = req.body;

      // Validate required fields
      if (!amount || amount <= 0) {
        console.error('[PAYMENT] Invalid amount:', amount);
        return res.status(400).json({
          success: false,
          error: 'Invalid amount provided'
        });
      }

      if (!bookingData) {
        console.error('[PAYMENT] Missing booking data');
        return res.status(400).json({
          success: false,
          error: 'Booking data is required'
        });
      }

      // Fetch package details to get package name
      let packageName = '';
      if (bookingData.packageId) {
        try {
          if (bookingData.packageType === 'tour') {
            const Tour = mongoose.model('Tour');
            const tour = await Tour.findById(bookingData.packageId);
            packageName = tour?.title || '';
          } else if (bookingData.packageType === 'transfer') {
            const Transfer = mongoose.model('Transfer');
            const transfer = await Transfer.findById(bookingData.packageId);
            packageName = transfer?.title || '';
          }
        } catch (err) {
          console.error('[PAYMENT] Error fetching package details:', err);
        }
      }

      // Convert amount to cents (Stripe uses smallest currency unit)
      const amountInCents = Math.round(amount * 100);

      console.log('[PAYMENT] Creating Stripe payment intent with amount:', amountInCents, 'cents');

      // Extract phone number and format it
      const phone = bookingData.contactInfo?.phone || '';
      
      // STEP 1: Create payment intent first (without bookingId - we'll update metadata after)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: currency.toLowerCase(),
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          bookingType: 'single',
          packageType: bookingData.packageType || '',
          packageId: bookingData.packageId || '',
          packageName: packageName,
          date: bookingData.date || '',
          time: bookingData.time || '',
          adults: bookingData.adults?.toString() || '0',
          children: bookingData.children?.toString() || '0',
          customerEmail: bookingData.contactInfo?.email || '',
          customerName: bookingData.contactInfo?.name || '',
          phone: phone,
          whatsapp: bookingData.contactInfo?.whatsapp || '',
          pickupLocation: bookingData.pickupLocation || '',
          isVehicleBooking: bookingData.isVehicleBooking?.toString() || 'false',
          vehicleSeatCapacity: bookingData.vehicleSeatCapacity?.toString() || '',
          platform: 'mossyforesttours',
          ...metadata
        },
        description: `Mossyforest ${bookingData.packageType} - ${bookingData.contactInfo?.name || 'Guest'}`,
      });

      console.log('[PAYMENT] Payment intent created successfully:', paymentIntent.id);

      // No pre-booking created — webhook will create booking when payment succeeds
      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency
        }
      });

    } catch (error: any) {
      console.error('[PAYMENT] Error creating payment intent:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create payment intent'
      });
    }
  }

  // Create payment intent for cart booking
  static async createCartPaymentIntent(req: Request, res: Response) {
    try {
      console.log('[PAYMENT] Creating payment intent for cart booking:', req.body);

      const {
        amount,
        currency = 'myr',
        cartData,
        contactInfo,
        metadata = {}
      } = req.body;

      // Validate required fields
      if (!amount || amount <= 0) {
        console.error('[PAYMENT] Invalid amount:', amount);
        return res.status(400).json({
          success: false,
          error: 'Invalid amount provided'
        });
      }

      if (!cartData || !cartData.items || cartData.items.length === 0) {
        console.error('[PAYMENT] Invalid cart data');
        return res.status(400).json({
          success: false,
          error: 'Cart data is required'
        });
      }

      if (!contactInfo) {
        console.error('[PAYMENT] Missing contact info');
        return res.status(400).json({
          success: false,
          error: 'Contact information is required'
        });
      }

      // Convert amount to cents
      const amountInCents = Math.round(amount * 100);

      console.log('[PAYMENT] Creating Stripe payment intent for cart with amount:', amountInCents, 'cents');

      // Extract phone number
      const phone = contactInfo.phone || '';

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: currency.toLowerCase(),
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          bookingType: 'cart',
          itemCount: cartData.items.length.toString(),
          customerEmail: contactInfo.email || '',
          customerName: contactInfo.name || '',
          phone: phone,
          userEmail: cartData.userEmail || '',
          platform: 'mossyforesttours',
          ...metadata
        },
        description: `Mossyforest Cart booking (${cartData.items.length} items) - ${contactInfo.name || 'Guest'}`,
      });

      console.log('[PAYMENT] Cart payment intent created successfully:', paymentIntent.id);

      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency
        }
      });

    } catch (error: any) {
      console.error('[PAYMENT] Error creating cart payment intent:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create payment intent'
      });
    }
  }

  // Confirm payment and create booking
  static async confirmPayment(req: Request, res: Response) {
    try {
      console.log('[PAYMENT] Confirming payment:', req.body);

      const { paymentIntentId, bookingData } = req.body;

      if (!paymentIntentId) {
        console.error('[PAYMENT] Missing payment intent ID');
        return res.status(400).json({
          success: false,
          error: 'Payment intent ID is required'
        });
      }

      // Retrieve payment intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      console.log('[PAYMENT] Payment intent status:', paymentIntent.status);

      if (paymentIntent.status !== 'succeeded') {
        console.error('[PAYMENT] Payment not successful:', paymentIntent.status);
        return res.status(400).json({
          success: false,
          error: 'Payment was not successful',
          paymentStatus: paymentIntent.status
        });
      }

      // Payment successful - update existing bookings and send confirmation emails
      console.log('[PAYMENT] Payment successful, updating existing bookings...');

      // Import booking models and services
      const Booking = require('../models/Booking').default;

      let bookingResult;

      if (paymentIntent.metadata.bookingType === 'cart') {
        // Handle cart booking - find existing bookings by payment intent ID
        console.log('[PAYMENT] Cart booking - finding existing bookings...');
        
        // Look for bookings with either pending OR succeeded status (webhook may have already updated)
        const existingBookings = await Booking.find({
          $or: [
            { 'paymentInfo.stripePaymentIntentId': paymentIntent.id },
            { 'paymentInfo.paymentIntentId': paymentIntent.id }
          ]
        });

        console.log('[PAYMENT] Found existing bookings:', existingBookings.length);

        if (existingBookings.length === 0) {
          // No existing bookings found, create new ones using cart service
          const { cartBookingService } = require('../services/cartBooking.service');

          const cartBookingRequest = {
            userEmail: paymentIntent.metadata.userEmail,
            contactInfo: bookingData.contactInfo,
            paymentInfo: {
              paymentIntentId: paymentIntent.id,
              amount: paymentIntent.amount / 100,
              currency: paymentIntent.currency,
              paymentStatus: 'succeeded',
              paymentMethod: 'stripe'
            }
          };

          const cartResult = await cartBookingService.bookCartItems(cartBookingRequest);
          bookingResult = {
            success: cartResult.success,
            bookingIds: cartResult.bookings,
            totalBookings: cartResult.bookings.length,
            error: cartResult.errors.length > 0 ? cartResult.errors.join(', ') : null,
            data: cartResult
          };
        } else {
          // Update existing bookings payment status AND update slot counts (if not already done)
          const pendingBookings = existingBookings.filter((b: any) => b.paymentInfo?.paymentStatus === 'pending');
          const alreadyConfirmed = existingBookings.filter((b: any) => b.paymentInfo?.paymentStatus === 'succeeded');
          
          console.log('[PAYMENT] Pending bookings:', pendingBookings.length);
          console.log('[PAYMENT] Already confirmed by webhook:', alreadyConfirmed.length);
          
          if (pendingBookings.length > 0) {
            const updateResult = await Booking.updateMany(
              { 
                $or: [ 
                  { 'paymentInfo.stripePaymentIntentId': paymentIntent.id }, 
                  { 'paymentInfo.paymentIntentId': paymentIntent.id } 
                ],
                'paymentInfo.paymentStatus': 'pending'
              },
              { 
                $set: { 
                  'paymentInfo.paymentStatus': 'succeeded',
                  'paymentInfo.paymentMethod': 'stripe',
                  'paymentInfo.stripePaymentIntentId': paymentIntent.id,
                  'paymentInfo.paymentIntentId': paymentIntent.id
                }
              }
            );

            console.log('[PAYMENT] Updated', updateResult.modifiedCount, 'existing bookings');
          } else {
            console.log('[PAYMENT] All bookings already confirmed (likely by webhook)');
          }

          // Update slot counts for each existing booking (now that payment is confirmed)
          // Only update slots for bookings that were pending (webhook doesn't update slots)
          try {
            const { TimeSlotService } = require('../services/timeSlot.service');
            for (const booking of pendingBookings) {
              const totalGuests = (booking.adults || 0) + (booking.children || 0);
              
              // Convert booking date to YYYY-MM-DD Malaysia timezone for timeslot lookup
              let dateStr = booking.date;
              if (booking.date instanceof Date) {
                dateStr = booking.date.toISOString().split('T')[0];
              } else if (typeof booking.date === 'string' && booking.date.includes('T')) {
                dateStr = booking.date.split('T')[0];
              } else if (typeof booking.date === 'string') {
                const bookingDate = new Date(booking.date);
                dateStr = bookingDate.toISOString().split('T')[0];
              }
              // Normalize to Malaysia timezone format using service util
              dateStr = TimeSlotService.formatDateToMalaysiaTimezone(dateStr);
              
              console.log(`[PAYMENT] Converting booking date: ${booking.date} → ${dateStr}`);
              
              await TimeSlotService.updateSlotBooking(
                booking.packageType,
                booking.packageId,
                dateStr,
                booking.time,
                totalGuests,
                'add'
              );
              console.log(`[PAYMENT] ✅ Updated slot for cart booking ${booking._id}`);
            }
          } catch (slotError) {
            console.error('[PAYMENT] ❌ Failed to update slots for cart bookings:', slotError);
          }

          bookingResult = {
            success: true,
            bookingIds: existingBookings.map((b: any) => b._id),
            totalBookings: existingBookings.length,
            data: existingBookings
          };
        }

        // Send cart confirmation email after payment success
        if (bookingResult.success && bookingData?.contactInfo?.email) {
          try {
            // Check if confirmation email has already been sent for any of these bookings
            const bookingsNeedingEmail = bookingResult.data.filter((b: any) => !b.confirmationEmailSent);
            
            if (bookingsNeedingEmail.length === 0) {
              console.log('[PAYMENT] ✅ Confirmation email already sent for all cart bookings');
            } else {
              console.log(`[PAYMENT] Sending confirmation email for ${bookingsNeedingEmail.length} cart bookings...`);
              
              // Fetch package details for proper package names and pickup guidelines in email
              const bookingsWithPackageNames = await Promise.all(
                bookingResult.data.map(async (booking: any) => {
                let packageName = booking.packageType === 'tour' ? 'Tour Package' : 'Transfer Service';
                let pickupGuidelines: string | undefined = undefined;
                let packageDetails: any = null;
                
                try {
                  if (booking.packageType === 'tour') {
                    const mongoose = require('mongoose');
                    const TourModel = mongoose.model('Tour');
                    packageDetails = await TourModel.findById(booking.packageId);
                    packageName = packageDetails?.title || packageName;
                  } else if (booking.packageType === 'transfer') {
                    const mongoose = require('mongoose');
                    const TransferModel = mongoose.model('Transfer');
                    packageDetails = await TransferModel.findById(booking.packageId);
                    packageName = packageDetails?.title || packageName;
                  }
                  
                  // Extract pickup guidelines from package details
                  if (packageDetails?.details?.pickupGuidelines) {
                    pickupGuidelines = packageDetails.details.pickupGuidelines;
                  } else if (booking.packageType === 'transfer' && (packageDetails?.details as any)?.pickupDescription) {
                    // Fallback for legacy transfers that use pickupDescription
                    pickupGuidelines = (packageDetails.details as any).pickupDescription;
                  }
                } catch (packageError) {
                  console.warn(`[PAYMENT] Could not fetch package details for ${booking.packageId}:`, packageError);
                }

                return {
                  bookingId: booking._id.toString(),
                  packageId: booking.packageId,
                  packageName,
                  packageType: booking.packageType,
                  date: booking.date,
                  time: booking.time,
                  adults: booking.adults,
                  children: booking.children || 0,
                  pickupLocation: booking.pickupLocation,
                  pickupGuidelines,
                  total: booking.total,
                  currency: booking.paymentInfo?.currency || 'MYR'
                };
              })
            );

            // Prepare cart email data
            const cartEmailData = {
              customerName: bookingData.contactInfo.name,
              customerEmail: bookingData.contactInfo.email,
              bookings: bookingsWithPackageNames,
              totalAmount: paymentIntent.amount / 100,
              currency: paymentIntent.currency.toUpperCase()
            };

            console.log('[PAYMENT] Sending cart confirmation email...');
            console.log('[PAYMENT] Email recipient:', cartEmailData.customerEmail);
            console.log('[PAYMENT] Total bookings:', cartEmailData.bookings.length);
            
            // Check email configuration before attempting to send
            const emailConfig = PaymentController.checkEmailConfiguration();
            console.log('[PAYMENT] Email config check:', emailConfig);
            
            if (!emailConfig.canSendEmail) {
              console.error('[PAYMENT] ❌ Cannot send email - configuration issues:', emailConfig.issues);
              throw new Error(`Email configuration incomplete: ${emailConfig.issues.join(', ')}`);
            }
            
            const emailService = new EmailService();
            const emailSent = await emailService.sendCartBookingConfirmation(cartEmailData);
            
            if (emailSent) {
              console.log('[PAYMENT] ✅ Cart confirmation email sent successfully');
              
              // Mark all bookings as having confirmation email sent
              await Booking.updateMany(
                { _id: { $in: bookingResult.bookingIds } },
                { 
                  $set: { 
                    confirmationEmailSent: true,
                    confirmationEmailSentAt: new Date()
                  }
                }
              );
              console.log('[PAYMENT] ✅ Marked bookings as confirmation email sent');
            } else {
              console.error('[PAYMENT] ⚠️ Cart confirmation email failed to send');
            }
            }
          } catch (emailError) {
            console.error('[PAYMENT] ❌ Failed to send cart confirmation email:', emailError);
            // Log additional debug info
            console.error('[PAYMENT] Email error details:', {
              customerEmail: bookingData?.contactInfo?.email,
              bookingCount: bookingResult?.data?.length,
              hasBrevoKey: !!process.env.BREVO_API_KEY,
              hasSmtpConfig: !!(process.env.SMTP_USER && process.env.SMTP_PASS)
            });
          }
        }

      } else {
        // Handle single booking - poll for webhook to create the booking
        console.log('[PAYMENT] Single booking - waiting for webhook to create booking...');
        
        let createdBooking: any = null;
        const maxAttempts = 30; // 15 seconds total
        const delayMs = 500; // Check every 500ms
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
          // Look for booking created by webhook
          const booking = await Booking.findOne({
            $or: [
              { 'paymentInfo.paymentIntentId': paymentIntent.id },
              { 'paymentInfo.stripePaymentIntentId': paymentIntent.id }
            ]
          });
          
          if (booking) {
            createdBooking = booking;
            console.log(`[PAYMENT] ✅ Booking created by webhook after ${attempt * delayMs}ms:`, booking._id);
            break;
          }
          
          if (attempt === maxAttempts) {
            console.error('[PAYMENT] ❌ Timeout waiting for webhook to create booking');
            return res.status(408).json({
              success: false,
              error: 'Booking confirmation is taking longer than expected. Please check your email or contact support with payment reference: ' + paymentIntent.id
            });
          }
        }

        bookingResult = {
          success: true,
          data: createdBooking,
          bookingIds: [createdBooking._id]
        };
      }

      if (bookingResult.success) {
        console.log('[PAYMENT] Booking created successfully:', bookingResult.bookingIds);

        res.json({
          success: true,
          message: 'Payment confirmed and booking created',
          data: {
            paymentIntentId: paymentIntent.id,
            paymentStatus: paymentIntent.status,
            bookingIds: bookingResult.bookingIds,
            totalBookings: bookingResult.totalBookings || 1
          }
        });
      } else {
        console.error('[PAYMENT] Failed to create booking after payment:', bookingResult.error);

        // Payment was successful but booking creation failed
        // This is a critical error that needs manual intervention
        res.status(500).json({
          success: false,
          error: 'Payment successful but booking creation failed',
          paymentIntentId: paymentIntent.id,
          bookingError: bookingResult.error
        });
      }

    } catch (error: any) {
      console.error('[PAYMENT] Error confirming payment:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to confirm payment'
      });
    }
  }

  // Cancel payment intent to avoid incomplete status in Stripe
  static async cancelPaymentIntent(req: Request, res: Response) {
    try {
      console.log('[PAYMENT] Canceling payment intent:', req.body);

      const { paymentIntentId } = req.body;

      if (!paymentIntentId) {
        console.error('[PAYMENT] Missing payment intent ID');
        return res.status(400).json({
          success: false,
          error: 'Payment intent ID is required'
        });
      }

      // Retrieve payment intent to check its current status
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      console.log('[PAYMENT] Current payment intent status:', paymentIntent.status);

      // Only cancel if the payment intent is in a cancelable state
      if (paymentIntent.status === 'requires_payment_method' || 
          paymentIntent.status === 'requires_confirmation' ||
          paymentIntent.status === 'requires_action') {
        
        const canceledPaymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
        
        console.log('[PAYMENT] Payment intent canceled successfully:', canceledPaymentIntent.id);

        res.json({
          success: true,
          data: {
            paymentIntentId: canceledPaymentIntent.id,
            status: canceledPaymentIntent.status
          }
        });
      } else {
        console.log('[PAYMENT] Payment intent cannot be canceled, current status:', paymentIntent.status);
        
        res.json({
          success: true,
          message: `Payment intent is in ${paymentIntent.status} status and cannot be canceled`,
          data: {
            paymentIntentId: paymentIntent.id,
            status: paymentIntent.status
          }
        });
      }

    } catch (error: any) {
      console.error('[PAYMENT] Error canceling payment intent:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to cancel payment intent'
      });
    }
  }

  // Handle webhook events from Stripe
  static async handleWebhook(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'] as string;
    let event: any;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
      console.log('[WEBHOOK] Received event:', event.type, event.id);
    } catch (err: any) {
      console.error('[WEBHOOK] Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as any;
        console.log('[WEBHOOK] Payment succeeded:', paymentIntent.id);
        // Additional logic can be added here
        break;
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object as any;
        console.log('[WEBHOOK] Payment failed:', failedPayment?.id, failedPayment?.last_payment_error?.message);
        break;
      default:
        console.log('[WEBHOOK] Unhandled event type:', event.type);
    }

    res.json({ received: true });
  }

  // Get payment status
  static async getPaymentStatus(req: Request, res: Response) {
    try {
      const { paymentIntentId } = req.params;

      if (!paymentIntentId) {
        return res.status(400).json({
          success: false,
          error: 'Payment intent ID is required'
        });
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      console.log('[PAYMENT] Payment status check:', paymentIntentId, paymentIntent.status);

      res.json({
        success: true,
        data: {
          status: paymentIntent.status,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          metadata: paymentIntent.metadata
        }
      });

    } catch (error: any) {
      console.error('[PAYMENT] Error checking payment status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to check payment status'
      });
    }
  }
}
