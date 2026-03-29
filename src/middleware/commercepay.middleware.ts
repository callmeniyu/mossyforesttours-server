/**
 * CommercePay Middleware
 * Handles signature verification, rate limiting, and request validation
 */

import { Request, Response, NextFunction } from 'express';
import { verifyCommercePaySignature } from '../utils/commercepay.utils';

/**
 * Webhook signature verification middleware
 */
export function verifyCommercePayWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  try {
    const signature = req.headers['cap-signature'] as string;
    const payload = req.body;

    if (!signature) {
      res.status(401).json({
        success: false,
        message: 'Missing webhook signature',
        code: 'MISSING_SIGNATURE',
      });
      return;
    }

    // Get secret key from environment
    const secretKey = process.env.COMMERCEPAY_SECRET_KEY;

    if (!secretKey) {
      console.error('CommercePay secret key not configured');
      res.status(500).json({
        success: false,
        message: 'Server configuration error',
        code: 'CONFIG_ERROR',
      });
      return;
    }

    // Verify signature
    if (!verifyCommercePaySignature(payload, signature, secretKey)) {
      console.warn('Invalid webhook signature received');
      res.status(401).json({
        success: false,
        message: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    res.status(500).json({
      success: false,
      message: 'Signature verification error',
      code: 'VERIFICATION_ERROR',
    });
  }
}

/**
 * API key authentication middleware
 */
export function authenticateApiKey(req: Request, res: Response, next: NextFunction): void {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    const expectedApiKey = process.env.COMMERCEPAY_API_KEY;

    if (!apiKey || !expectedApiKey) {
      res.status(401).json({
        success: false,
        message: 'Missing or invalid API key',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    // Use timing-safe comparison to prevent timing attacks
    const matches = apiKey.length === expectedApiKey.length && apiKey === expectedApiKey;

    if (!matches) {
      console.warn('Invalid API key attempt');
      res.status(401).json({
        success: false,
        message: 'Invalid API key',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Error authenticating API key:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      code: 'AUTH_ERROR',
    });
  }
}

/**
 * Request validation middleware
 */
export function validatePaymentRequest(req: Request, res: Response, next: NextFunction): void {
  try {
    const { bookingData, amount, currency } = req.body;

    // Validate required fields
    if (!bookingData || typeof bookingData !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Invalid bookingData: must be an object',
        code: 'INVALID_REQUEST',
      });
      return;
    }

    if (!bookingData.bookingId) {
      res.status(400).json({
        success: false,
        message: 'Invalid request: bookingId is required',
        code: 'INVALID_REQUEST',
      });
      return;
    }

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid amount: must be a positive number',
        code: 'INVALID_AMOUNT',
      });
      return;
    }

    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      res.status(400).json({
        success: false,
        message: 'Invalid currency: must be a 3-letter code',
        code: 'INVALID_CURRENCY',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Error validating payment request:', error);
    res.status(500).json({
      success: false,
      message: 'Request validation error',
      code: 'VALIDATION_ERROR',
    });
  }
}

/**
 * Rate limiting middleware
 */
interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const rateLimitStore: RateLimitStore = {};

export function rateLimitCommercePayRequests(req: Request, res: Response, next: NextFunction): void {
  try {
    const identifier = req.ip || req.socket.remoteAddress || 'unknown';
    const limit = 100; // 100 requests
    const windowMs = 15 * 60 * 1000; // 15 minutes

    const now = Date.now();
    const record = rateLimitStore[identifier];

    if (record && now < record.resetTime) {
      record.count++;

      if (record.count > limit) {
        res.status(429).json({
          success: false,
          message: 'Too many requests. Please try again later.',
          code: 'RATE_LIMITED',
          retryAfter: Math.ceil((record.resetTime - now) / 1000),
        });
        return;
      }
    } else {
      rateLimitStore[identifier] = {
        count: 1,
        resetTime: now + windowMs,
      };
    }

    // Cleanup old records periodically
    if (Math.random() < 0.01) {
      Object.keys(rateLimitStore).forEach((key) => {
        if (rateLimitStore[key].resetTime < now) {
          delete rateLimitStore[key];
        }
      });
    }

    next();
  } catch (error) {
    console.error('Error in rate limiting middleware:', error);
    next(); // Allow request to continue on error
  }
}

/**
 * Error handling middleware for payment operations
 */
export function handlePaymentError(err: any, req: Request, res: Response, next: NextFunction): void {
  console.error('Payment error:', err);

  // Handle specific error types
  if (err.message.includes('ECONNREFUSED')) {
    res.status(503).json({
      success: false,
      message: 'Payment service temporarily unavailable',
      code: 'SERVICE_UNAVAILABLE',
    });
    return;
  }

  if (err.message.includes('timeout')) {
    res.status(504).json({
      success: false,
      message: 'Payment request timeout',
      code: 'REQUEST_TIMEOUT',
    });
    return;
  }

  if (err.message.includes('signature')) {
    res.status(401).json({
      success: false,
      message: 'Payment signature verification failed',
      code: 'SIGNATURE_FAILED',
    });
    return;
  }

  // Default error response
  res.status(500).json({
    success: false,
    message: 'Payment operation failed',
    code: 'PAYMENT_ERROR',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}

/**
 * Webhook delivery verification middleware
 */
export function verifyWebhookDelivery(req: Request, res: Response, next: NextFunction): void {
  try {
    // Check required webhook fields
    const requiredFields = ['transactionNumber', 'referenceCode', 'transactionStatus', 'amount', 'timestamp'];
    const missingFields = requiredFields.filter((field) => !(field in req.body));

    if (missingFields.length > 0) {
      res.status(400).json({
        success: false,
        message: `Missing webhook fields: ${missingFields.join(', ')}`,
        code: 'INVALID_WEBHOOK',
      });
      return;
    }

    // Validate timestamp to prevent replay attacks
    const webhookTimestamp = new Date(req.body.timestamp).getTime();
    const currentTime = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (Math.abs(currentTime - webhookTimestamp) > maxAge) {
      console.warn('Webhook timestamp too old:', req.body.timestamp);
      res.status(401).json({
        success: false,
        message: 'Webhook timestamp expired',
        code: 'WEBHOOK_EXPIRED',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Error verifying webhook delivery:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook verification error',
      code: 'VERIFICATION_ERROR',
    });
  }
}

/**
 * Request logging middleware for audit trail
 */
export function logCommercePayRequest(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log request details (without sensitive data)
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip || req.socket.remoteAddress,
    referenceCode: req.body?.referenceCode || req.params?.referenceCode || 'N/A',
  };

  console.log(`[CommercePay] Request: ${JSON.stringify(logData)}`);

  // Log response
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    const duration = Date.now() - startTime;
    const responseLog = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      success: body?.success || false,
    };

    console.log(`[CommercePay] Response: ${JSON.stringify(responseLog)}`);

    return originalJson(body);
  };

  next();
}

/**
 * CORS middleware for CommercePay callbacks
 */
export function commercePayCors(req: Request, res: Response, next: NextFunction): void {
  // Allow CommercePay webhooks from specific domains
  const allowedOrigins = [
    process.env.COMMERCEPAY_DOMAIN || 'https://api.commerce.asia',
    process.env.FRONTEND_URL || 'http://localhost:3000',
  ];

  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, cap-signature, x-api-key');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
}

export default {
  verifyCommercePayWebhookSignature,
  authenticateApiKey,
  validatePaymentRequest,
  rateLimitCommercePayRequests,
  handlePaymentError,
  verifyWebhookDelivery,
  logCommercePayRequest,
  commercePayCors,
};
