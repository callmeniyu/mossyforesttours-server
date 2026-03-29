/**
 * CommercePay Payment Controller
 * Handles HTTP endpoints for payment operations
 * 
 * Features:
 * - Create payment session
 * - Handle payment callback from CommercePay
 * - Verify payment status
 * - Process webhooks
 * - Handle payment cancellations
 * - Comprehensive error handling
 */

import { Request, Response } from 'express';
import { CommercePayService } from '../services/commercepay.service';
import BookingModel from '../models/Booking';
import { BrevoEmailService } from '../services/brevo.service';
import { generateIdempotencyKey, logPaymentOperation, COMMERCEPAY_CONSTANTS } from '../utils/commercepay.utils';
import mongoose from 'mongoose';

/**
 * API Response interface
 */
interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * CommercePay Payment Controller
 */
export class CommercePayPaymentController {
  private commercePayService: CommercePayService;
  private emailService: typeof BrevoEmailService;

  constructor(commercePayService: CommercePayService, emailService: typeof BrevoEmailService) {
    this.commercePayService = commercePayService;
    this.emailService = emailService;
  }

  /**
   * Create payment session (initiate payment)
   * POST /api/payment/commercepay/create-session
   */
  async createPaymentSession(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    let referenceCode: string | null = null;

    try {
      const { bookingData, amount, currency = 'MYR' } = req.body;

      // Validate request - bookingId is optional now (can be temp reference code)
      if (!bookingData) {
        res.status(400).json({
          success: false,
          message: 'Invalid request: Missing required fields',
          code: 'INVALID_REQUEST',
        } as ApiResponse);
        return;
      }

      if (!amount || amount <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid amount provided',
          code: 'INVALID_AMOUNT',
        } as ApiResponse);
        return;
      }

      // Optional: Validate booking exists only if bookingId is a real ObjectId
      if (bookingData.bookingId && bookingData.bookingId.match(/^[0-9a-f]{24}$/i)) {
        const booking = await BookingModel.findById(bookingData.bookingId);
        if (!booking) {
          res.status(404).json({
            success: false,
            message: 'Booking not found',
            code: 'BOOKING_NOT_FOUND',
          } as ApiResponse);
          return;
        }
      }

      // Generate reference code (idempotent)
      referenceCode = `CHLT-${bookingData.bookingId || 'TEMP'}-${Date.now()}`;

      // Request payment from CommercePay (don't create booking yet)
      const paymentResponse = await this.commercePayService.requestPayment({
        amount: Math.round(amount * 100), // Convert to cents
        currencyCode: currency,
        referenceCode,
        returnUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-commercepay-callback?reference=${referenceCode}`,
        callbackUrl: `${process.env.API_URL || 'http://localhost:3001'}/api/payment/commercepay/webhook`,
        description: `Tour Booking - ${bookingData.packageName || 'Cameron Highlands Tour'}`,
        customerName: bookingData.customerName,
        customerEmail: bookingData.customerEmail,
        invoiceNumber: `INV-${bookingData.bookingId || 'PENDING'}`,
      });

      // Do NOT create/update booking here - wait for successful payment callback
      // The booking will be created in the frontend after payment succeeds

      logPaymentOperation('session_created', referenceCode, 'success');

      res.status(200).json({
        success: true,
        message: 'Payment session created successfully',
        data: {
          redirectUrl: paymentResponse.redirectUrl,
          referenceCode,
          sessionId: paymentResponse.sessionId,
          expiresAt: paymentResponse.expiresAt,
        },
      } as ApiResponse);
    } catch (error) {
      logPaymentOperation('session_create_failed', referenceCode || 'unknown', 'error');
      console.error('Error creating payment session:', error);

      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create payment session',
        code: 'SESSION_CREATION_FAILED',
        error: error instanceof Error ? error.message : String(error),
      } as ApiResponse);
    }
  }

  /**
   * Handle payment callback from CommercePay
   * POST /api/payment/commercepay/callback
   */
  async handlePaymentCallback(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();

    try {
      const { transactionNumber, referenceCode } = req.body;

      // Validate request
      if (!transactionNumber || !referenceCode) {
        res.status(400).json({
          success: false,
          message: 'Invalid callback data',
          code: 'INVALID_CALLBACK',
        } as ApiResponse);
        return;
      }

      // Verify transaction with CommercePay
      const verification = await this.commercePayService.verifyTransaction(referenceCode, transactionNumber);

      // Find booking by reference code
      const booking = await BookingModel.findOne({
        'paymentInfo.commercePayReferenceCode': referenceCode,
      });

      if (!booking) {
        console.warn(`Booking not found for reference code: ${referenceCode}`);
        res.status(404).json({
          success: false,
          message: 'Booking not found',
          code: 'BOOKING_NOT_FOUND',
        } as ApiResponse);
        return;
      }

      // Handle based on payment status
      if (verification.status === 'succeeded') {
        await this.handlePaymentSuccess(booking, verification, transactionNumber);
      } else if (verification.status === 'failed') {
        await this.handlePaymentFailure(booking, verification, transactionNumber);
      } else {
        await this.handlePaymentPending(booking, verification, transactionNumber);
      }

      logPaymentOperation('callback_processed', referenceCode, verification.status);

      res.status(200).json({
        success: true,
        message: `Payment ${verification.status}`,
        data: {
          status: verification.status,
          transactionNumber,
          referenceCode,
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Error handling payment callback:', error);

      res.status(500).json({
        success: false,
        message: 'Failed to process payment callback',
        code: 'CALLBACK_PROCESSING_FAILED',
        error: error instanceof Error ? error.message : String(error),
      } as ApiResponse);
    }
  }

  /**
   * Verify payment status
   * GET /api/payment/commercepay/status/:referenceCode
   */
  async verifyPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { referenceCode } = req.params;

      if (!referenceCode) {
        res.status(400).json({
          success: false,
          message: 'Reference code is required',
          code: 'MISSING_REFERENCE_CODE',
        } as ApiResponse);
        return;
      }

      // Find booking
      const booking = await BookingModel.findOne({
        'paymentInfo.commercePayReferenceCode': referenceCode,
      });

      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'Booking not found',
          code: 'BOOKING_NOT_FOUND',
        } as ApiResponse);
        return;
      }

      // Query transaction status from CommercePay
      const verification = await this.commercePayService.queryTransaction(referenceCode);

      res.status(200).json({
        success: true,
        message: 'Payment status retrieved',
        data: {
          status: verification.status,
          paymentChannel: verification.paymentChannel,
          bookingStatus: booking.bookingStatus,
          amount: verification.amount,
          currency: verification.currency,
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Error verifying payment status:', error);

      res.status(500).json({
        success: false,
        message: 'Failed to verify payment status',
        code: 'STATUS_VERIFICATION_FAILED',
        error: error instanceof Error ? error.message : String(error),
      } as ApiResponse);
    }
  }

  /**
   * Process webhook from CommercePay
   * POST /api/payment/commercepay/webhook
   */
  async processWebhook(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body;
      const signature = req.headers['cap-signature'] as string;

      if (!signature) {
        res.status(401).json({
          success: false,
          message: 'Missing signature',
          code: 'MISSING_SIGNATURE',
        } as ApiResponse);
        return;
      }

      // Process webhook
      const webhookEvent = await this.commercePayService.processWebhook(payload, signature);

      // Find booking by reference code
      const booking = await BookingModel.findOne({
        'paymentInfo.commercePayReferenceCode': payload.referenceCode,
      });

      if (!booking) {
        console.warn(`Booking not found for webhook: ${payload.referenceCode}`);
        // Return 200 OK anyway to acknowledge receipt
        res.status(200).json({
          success: true,
          message: 'Webhook processed (booking not found)',
        } as ApiResponse);
        return;
      }

      // Handle webhook based on event type
      switch (webhookEvent.type) {
        case 'payment_succeeded':
          await this.handlePaymentSuccess(booking, payload, payload.transactionNumber);
          break;
        case 'payment_failed':
          await this.handlePaymentFailure(booking, payload, payload.transactionNumber);
          break;
        case 'payment_pending':
          await this.handlePaymentPending(booking, payload, payload.transactionNumber);
          break;
      }

      logPaymentOperation('webhook_processed', payload.referenceCode, webhookEvent.type);

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
      } as ApiResponse);
    } catch (error) {
      console.error('Error processing webhook:', error);

      // Return 200 OK anyway to prevent webhook retries
      res.status(200).json({
        success: false,
        message: 'Webhook processing error (will retry)',
        error: error instanceof Error ? error.message : String(error),
      } as ApiResponse);
    }
  }

  /**
   * Cancel payment
   * POST /api/payment/commercepay/cancel
   */
  async cancelPayment(req: Request, res: Response): Promise<void> {
    try {
      const { referenceCode } = req.body;

      if (!referenceCode) {
        res.status(400).json({
          success: false,
          message: 'Reference code is required',
          code: 'MISSING_REFERENCE_CODE',
        } as ApiResponse);
        return;
      }

      // Find booking
      const booking = await BookingModel.findOne({
        'paymentInfo.commercePayReferenceCode': referenceCode,
      });

      if (!booking) {
        res.status(404).json({
          success: false,
          message: 'Booking not found',
          code: 'BOOKING_NOT_FOUND',
        } as ApiResponse);
        return;
      }

      // Cancel booking
      booking.bookingStatus = 'cancelled';
      booking.paymentInfo.paymentStatus = 'failed';
      booking.paymentInfo.cancellationReason = 'User cancelled payment';
      booking.paymentInfo.cancelledAt = new Date();

      await booking.save();

      logPaymentOperation('payment_cancelled', referenceCode, 'cancelled');

      res.status(200).json({
        success: true,
        message: 'Payment cancelled successfully',
        data: {
          referenceCode,
          bookingStatus: booking.bookingStatus,
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Error cancelling payment:', error);

      res.status(500).json({
        success: false,
        message: 'Failed to cancel payment',
        code: 'CANCELLATION_FAILED',
        error: error instanceof Error ? error.message : String(error),
      } as ApiResponse);
    }
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSuccess(booking: any, verification: any, transactionNumber: string): Promise<void> {
    try {
      // Update booking status
      booking.bookingStatus = 'confirmed';
      booking.paymentInfo.paymentStatus = 'succeeded';
      booking.paymentInfo.commercePayTransactionNumber = transactionNumber;
      booking.paymentInfo.paymentChannel = verification.paymentChannel;
      booking.paymentInfo.paymentCompletedAt = new Date();
      booking.paymentInfo.verifiedAt = new Date();

      await booking.save();

      // Update time slot booking count
      await BookingModel.updateOne(
        {
          packageId: booking.packageId,
          'timeSlots._id': booking.selectedTimeSlot,
        },
        {
          $inc: { 'timeSlots.$.bookingCount': 1 },
        }
      );

      // Send confirmation email via Brevo
      await this.emailService.sendBookingConfirmation({
        customerName: booking.contactInfo?.name || booking.customerName,
        customerEmail: booking.contactInfo?.email || booking.customerEmail,
        bookingId: booking._id.toString(),
        packageId: booking.packageId.toString(),
        packageName: booking.packageName,
        packageType: booking.packageType,
        date: booking.date.toISOString().split('T')[0],
        time: booking.time,
        adults: booking.adults,
        children: booking.children,
        total: booking.paymentInfo?.amount || 0,
        currency: booking.paymentInfo?.currency || 'MYR',
      });

      logPaymentOperation('payment_success_processed', booking.paymentInfo.commercePayReferenceCode, 'completed');
    } catch (error) {
      console.error('Error handling payment success:', error);
      throw error;
    }
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailure(booking: any, verification: any, transactionNumber: string): Promise<void> {
    try {
      // Update booking status
      booking.bookingStatus = 'cancelled';
      booking.paymentInfo.paymentStatus = 'failed';
      booking.paymentInfo.commercePayTransactionNumber = transactionNumber;
      booking.paymentInfo.failureReason = verification.bankMessage || 'Payment declined';
      booking.paymentInfo.failedAt = new Date();

      await booking.save();

      // Send failure notification email via Brevo
      await this.emailService.sendBookingConfirmation({
        customerName: booking.contactInfo?.name || booking.customerName,
        customerEmail: booking.contactInfo?.email || booking.customerEmail,
        bookingId: booking._id.toString(),
        packageId: booking.packageId.toString(),
        packageName: booking.packageName,
        packageType: booking.packageType,
        date: booking.date.toISOString().split('T')[0],
        time: booking.time,
        adults: booking.adults,
        children: booking.children,
        total: booking.paymentInfo?.amount || 0,
        currency: booking.paymentInfo?.currency || 'MYR',
      });

      logPaymentOperation('payment_failure_processed', booking.paymentInfo.commercePayReferenceCode, 'failed');
    } catch (error) {
      console.error('Error handling payment failure:', error);
      throw error;
    }
  }

  /**
   * Handle pending payment
   */
  private async handlePaymentPending(booking: any, verification: any, transactionNumber: string): Promise<void> {
    try {
      // Update booking status
      booking.bookingStatus = 'pending';
      booking.paymentInfo.paymentStatus = 'pending';
      booking.paymentInfo.commercePayTransactionNumber = transactionNumber;
      booking.paymentInfo.pendingAt = new Date();

      await booking.save();

      logPaymentOperation('payment_pending_processed', booking.paymentInfo.commercePayReferenceCode, 'pending');
    } catch (error) {
      console.error('Error handling payment pending:', error);
      throw error;
    }
  }
}

/**
 * Create controller instance
 */
export function createCommercePayPaymentController(
  commercePayService: CommercePayService,
  emailService: typeof BrevoEmailService
): CommercePayPaymentController {
  return new CommercePayPaymentController(commercePayService, emailService);
}

export default CommercePayPaymentController;
