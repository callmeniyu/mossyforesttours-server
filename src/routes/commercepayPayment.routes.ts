/**
 * CommercePay Payment Routes
 * All payment endpoints for CommercePay integration
 */

import { Router } from 'express';
import { CommercePayPaymentController } from '../controllers/commercepayPayment.controller';
import {
  verifyCommercePayWebhookSignature,
  validatePaymentRequest,
  rateLimitCommercePayRequests,
  verifyWebhookDelivery,
  logCommercePayRequest,
  commercePayCors,
} from '../middleware/commercepay.middleware';
import { CommercePayService } from '../services/commercepay.service';
import { BrevoEmailService } from '../services/brevo.service';

/**
 * Create router with routes
 */
export function createCommercePayRoutes(): Router {
  const router = Router();

  // Initialize services
  const commercePayService = new CommercePayService({
    apiBaseUrl: process.env.COMMERCEPAY_API_BASE_URL || 'https://staging-payments.commerce.asia/api/services/app',
    merchantId: process.env.COMMERCEPAY_MERCHANT_ID || '',
    secretKey: process.env.COMMERCEPAY_SECRET_KEY || '',
    apiKey: process.env.COMMERCEPAY_API_KEY || '',
  });

  // Create controller
  const controller = new CommercePayPaymentController(commercePayService, BrevoEmailService);

  // Apply global middleware
  router.use(logCommercePayRequest);
  router.use(rateLimitCommercePayRequests);
  router.use(commercePayCors);

  /**
   * POST /api/payment/commercepay/create-session
   * Create a new payment session
   * 
   * Request body:
   * {
   *   bookingData: {
   *     bookingId: string,
   *     packageName: string,
   *     customerName: string,
   *     customerEmail: string
   *   },
   *   amount: number,
   *   currency: string (optional, default: 'MYR')
   * }
   * 
   * Response:
   * {
   *   success: boolean,
   *   message: string,
   *   data: {
   *     redirectUrl: string,
   *     referenceCode: string,
   *     sessionId: string,
   *     expiresAt: string
   *   }
   * }
   */
  router.post(
    '/create-session',
    validatePaymentRequest,
    async (req, res) => {
      await controller.createPaymentSession(req, res);
    }
  );

  /**
   * POST /api/payment/commercepay/callback
   * Handle payment callback from CommercePay
   * 
   * Request body:
   * {
   *   transactionNumber: string,
   *   referenceCode: string
   * }
   * 
   * Response:
   * {
   *   success: boolean,
   *   message: string,
   *   data: {
   *     status: string,
   *     transactionNumber: string,
   *     referenceCode: string
   *   }
   * }
   */
  router.post(
    '/callback',
    verifyWebhookDelivery,
    async (req, res) => {
      await controller.handlePaymentCallback(req, res);
    }
  );

  /**
   * GET /api/payment/commercepay/status/:referenceCode
   * Verify payment status
   * 
   * Response:
   * {
   *   success: boolean,
   *   message: string,
   *   data: {
   *     status: string,
   *     paymentChannel: string,
   *     bookingStatus: string,
   *     amount: number,
   *     currency: string
   *   }
   * }
   */
  router.get(
    '/status/:referenceCode',
    async (req, res) => {
      await controller.verifyPaymentStatus(req, res);
    }
  );

  /**
   * POST /api/payment/commercepay/webhook
   * Process webhook from CommercePay
   * Signature verification required
   * 
   * Headers:
   * - cap-signature: HMAC-SHA256 signature
   * 
   * Request body:
   * {
   *   transactionNumber: string,
   *   referenceCode: string,
   *   transactionStatus: string,
   *   amount: number,
   *   paymentChannel: string,
   *   timestamp: string,
   *   capSignature: string
   * }
   * 
   * Response:
   * {
   *   success: boolean,
   *   message: string
   * }
   */
  router.post(
    '/webhook',
    commercePayCors,
    verifyCommercePayWebhookSignature,
    verifyWebhookDelivery,
    async (req, res) => {
      await controller.processWebhook(req, res);
    }
  );

  /**
   * POST /api/payment/commercepay/cancel
   * Cancel a payment
   * 
   * Request body:
   * {
   *   referenceCode: string
   * }
   * 
   * Response:
   * {
   *   success: boolean,
   *   message: string,
   *   data: {
   *     referenceCode: string,
   *     bookingStatus: string
   *   }
   * }
   */
  router.post(
    '/cancel',
    async (req, res) => {
      await controller.cancelPayment(req, res);
    }
  );

  return router;
}

/**
 * Export factory function
 */
export default createCommercePayRoutes;
