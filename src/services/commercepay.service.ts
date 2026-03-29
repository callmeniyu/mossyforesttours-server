/**
 * CommercePay Payment Service
 * Handles all CommercePay API interactions
 * 
 * Features:
 * - Secure authentication with token caching
 * - Payment request processing
 * - Transaction verification
 * - Webhook handling with signature verification
 * - Error handling and retry logic
 * - Comprehensive logging and audit trails
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  CommercePayConfig,
  PaymentRequestData,
  TransactionVerification,
  WebhookPayload,
  generateCommercePaySignature,
  verifyCommercePaySignature,
  getAccessToken,
  invalidateTokenCache,
  buildPaymentRequestPayload,
  parseTransactionStatus,
  createCommercePayAxiosInstance,
  retryWithBackoff,
  generateIdempotencyKey,
  COMMERCEPAY_CONSTANTS,
} from '../utils/commercepay.utils';

/**
 * Payment request response interface
 */
export interface PaymentRequestResponse {
  sessionId: string;
  referenceCode: string;
  redirectUrl: string;
  amount: number;
  currency: string;
  expiresAt: string;
  status: string;
}

/**
 * Payment verification response interface
 */
export interface PaymentVerificationResponse {
  transactionNumber: string;
  referenceCode: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'pending' | 'unknown';
  paymentChannel: string;
  timestamp: string;
  bankResponseCode: string;
  bankMessage: string;
}

/**
 * Webhook event interface
 */
export interface WebhookEvent {
  id: string;
  type: 'payment_succeeded' | 'payment_failed' | 'payment_pending';
  data: WebhookPayload;
  timestamp: string;
  processed: boolean;
}

/**
 * CommercePay Service Class
 */
export class CommercePayService {
  private config: CommercePayConfig;
  private axiosInstance: AxiosInstance | null = null;
  private accessToken: string | null = null;

  constructor(config: CommercePayConfig) {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: CommercePayConfig): void {
    const requiredFields = ['apiBaseUrl', 'merchantId', 'secretKey', 'apiKey'];
    const missingFields = requiredFields.filter((field) => !(field in config) || !config[field as keyof CommercePayConfig]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required configuration: ${missingFields.join(', ')}`);
    }

    if (!config.apiBaseUrl.startsWith('http')) {
      throw new Error('Invalid API base URL');
    }
  }

  /**
   * Initialize axios instance with authenticated headers
   */
  private async initializeAxiosInstance(): Promise<AxiosInstance> {
    if (this.axiosInstance && this.accessToken) {
      return this.axiosInstance;
    }

    try {
      this.accessToken = await getAccessToken(this.config);
      this.axiosInstance = createCommercePayAxiosInstance(this.config, this.accessToken);
      return this.axiosInstance;
    } catch (error) {
      throw new Error(
        `Failed to initialize axios instance: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Request payment from CommercePay
   * @param paymentData - Payment request data
   * @returns Payment request response with redirect URL
   */
  async requestPayment(paymentData: PaymentRequestData): Promise<PaymentRequestResponse> {
    try {
      // Validate and build payload
      const payload = buildPaymentRequestPayload(paymentData);

      // Generate signature
      const signature = generateCommercePaySignature(payload, this.config.secretKey);

      // Get authenticated axios instance
      const axiosInstance = await this.initializeAxiosInstance();

      // Make request with retry logic
      const response = await retryWithBackoff(async () => {
        return await axiosInstance.post(COMMERCEPAY_CONSTANTS.API_PATHS.REQUEST_PAYMENT, payload, {
          headers: {
            'cap-signature': signature,
          },
        });
      });

      // Validate response
      if (!response.data || !response.data.result) {
        throw new Error('Invalid response from CommercePay');
      }

      const result = response.data.result;

      // Build response
      const paymentResponse: PaymentRequestResponse = {
        sessionId: result.sessionId,
        referenceCode: payload.referenceCode,
        redirectUrl: result.redirectUrl,
        amount: payload.amount,
        currency: payload.currencyCode,
        expiresAt: new Date(Date.now() + COMMERCEPAY_CONSTANTS.TIMEOUTS.PAYMENT_INTENT).toISOString(),
        status: 'pending',
      };

      return paymentResponse;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        // Token expired, invalidate cache and retry
        invalidateTokenCache(this.config.merchantId);
        this.accessToken = null;
        this.axiosInstance = null;

        return this.requestPayment(paymentData);
      }

      throw this.handleError('requestPayment', error, { referenceCode: paymentData.referenceCode });
    }
  }

  /**
   * Verify transaction with CommercePay
   * @param referenceCode - Reference code
   * @param transactionNumber - Transaction number from callback
   * @returns Transaction verification response
   */
  async verifyTransaction(referenceCode: string, transactionNumber: string): Promise<PaymentVerificationResponse> {
    try {
      const payload = {
        referenceCode,
        transactionNumber,
      };

      // Generate signature
      const signature = generateCommercePaySignature(payload, this.config.secretKey);

      // Get authenticated axios instance
      const axiosInstance = await this.initializeAxiosInstance();

      // Make request with retry logic
      const response = await retryWithBackoff(async () => {
        return await axiosInstance.post(COMMERCEPAY_CONSTANTS.API_PATHS.VERIFY_TRANSACTION, payload, {
          headers: {
            'cap-signature': signature,
          },
        });
      });

      // Validate response
      if (!response.data || !response.data.result) {
        throw new Error('Invalid response from CommercePay');
      }

      const result = response.data.result;

      // Parse response
      const verificationResponse: PaymentVerificationResponse = {
        transactionNumber: result.transactionNumber,
        referenceCode: result.referenceCode,
        amount: result.amount,
        currency: result.currencyCode,
        status: parseTransactionStatus(result.transactionStatus),
        paymentChannel: result.paymentChannel,
        timestamp: result.timestamp,
        bankResponseCode: result.bankResponseCode,
        bankMessage: result.bankMessage,
      };

      return verificationResponse;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        invalidateTokenCache(this.config.merchantId);
        this.accessToken = null;
        this.axiosInstance = null;

        return this.verifyTransaction(referenceCode, transactionNumber);
      }

      throw this.handleError('verifyTransaction', error, { referenceCode, transactionNumber });
    }
  }

  /**
   * Query transaction status
   * @param referenceCode - Reference code
   * @returns Transaction verification response
   */
  async queryTransaction(referenceCode: string): Promise<PaymentVerificationResponse> {
    try {
      const payload = {
        referenceCode,
      };

      // Generate signature
      const signature = generateCommercePaySignature(payload, this.config.secretKey);

      // Get authenticated axios instance
      const axiosInstance = await this.initializeAxiosInstance();

      // Make request with retry logic
      const response = await retryWithBackoff(async () => {
        return await axiosInstance.post(COMMERCEPAY_CONSTANTS.API_PATHS.QUERY_TRANSACTION, payload, {
          headers: {
            'cap-signature': signature,
          },
        });
      });

      // Validate response
      if (!response.data || !response.data.result) {
        throw new Error('Invalid response from CommercePay');
      }

      const result = response.data.result;

      // Parse response
      const verificationResponse: PaymentVerificationResponse = {
        transactionNumber: result.transactionNumber,
        referenceCode: result.referenceCode,
        amount: result.amount,
        currency: result.currencyCode,
        status: parseTransactionStatus(result.transactionStatus),
        paymentChannel: result.paymentChannel,
        timestamp: result.timestamp,
        bankResponseCode: result.bankResponseCode,
        bankMessage: result.bankMessage,
      };

      return verificationResponse;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        invalidateTokenCache(this.config.merchantId);
        this.accessToken = null;
        this.axiosInstance = null;

        return this.queryTransaction(referenceCode);
      }

      throw this.handleError('queryTransaction', error, { referenceCode });
    }
  }

  /**
   * Process webhook from CommercePay
   * @param payload - Webhook payload
   * @param signature - Webhook signature
   * @returns Parsed webhook event
   */
  async processWebhook(payload: WebhookPayload, signature: string): Promise<WebhookEvent> {
    try {
      // Verify signature
      if (!verifyCommercePaySignature(payload, signature, this.config.secretKey)) {
        throw new Error('Invalid webhook signature');
      }

      // Parse status
      const status = parseTransactionStatus(payload.transactionStatus);

      // Determine event type
      let eventType: 'payment_succeeded' | 'payment_failed' | 'payment_pending';
      if (status === 'succeeded') {
        eventType = 'payment_succeeded';
      } else if (status === 'failed') {
        eventType = 'payment_failed';
      } else {
        eventType = 'payment_pending';
      }

      // Create webhook event
      const webhookEvent: WebhookEvent = {
        id: generateIdempotencyKey(this.config.merchantId, payload.referenceCode),
        type: eventType,
        data: payload,
        timestamp: payload.timestamp || new Date().toISOString(),
        processed: false,
      };

      return webhookEvent;
    } catch (error) {
      throw this.handleError('processWebhook', error, { referenceCode: payload?.referenceCode });
    }
  }

  /**
   * Refund transaction
   * @param referenceCode - Original reference code
   * @param refundAmount - Refund amount (optional, full refund if not provided)
   * @returns Refund response
   */
  async refundTransaction(referenceCode: string, refundAmount?: number): Promise<any> {
    try {
      const payload: any = {
        referenceCode,
      };

      if (refundAmount !== undefined) {
        payload.refundAmount = refundAmount;
      }

      // Generate signature
      const signature = generateCommercePaySignature(payload, this.config.secretKey);

      // Get authenticated axios instance
      const axiosInstance = await this.initializeAxiosInstance();

      // Make request with retry logic
      const response = await retryWithBackoff(async () => {
        return await axiosInstance.post(COMMERCEPAY_CONSTANTS.API_PATHS.REFUND, payload, {
          headers: {
            'cap-signature': signature,
          },
        });
      });

      // Validate response
      if (!response.data || !response.data.result) {
        throw new Error('Invalid response from CommercePay');
      }

      return response.data.result;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        invalidateTokenCache(this.config.merchantId);
        this.accessToken = null;
        this.axiosInstance = null;

        return this.refundTransaction(referenceCode, refundAmount);
      }

      throw this.handleError('refundTransaction', error, { referenceCode });
    }
  }

  /**
   * Handle and format errors
   */
  private handleError(operation: string, error: any, context?: any): Error {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const data = error.response?.data;
      const message = data?.message || data?.error?.message || error.message;

      console.error(`CommercePay ${operation} failed:`, {
        status,
        message,
        context,
      });

      return new Error(`CommercePay ${operation} failed: ${message}`);
    }

    console.error(`CommercePay ${operation} error:`, error, context);
    throw error;
  }

  /**
   * Health check - verify connection to CommercePay
   */
  async healthCheck(): Promise<boolean> {
    try {
      const axiosInstance = await this.initializeAxiosInstance();
      // If we can get an axios instance with valid token, connection is good
      return true;
    } catch (error) {
      console.error('CommercePay health check failed:', error);
      return false;
    }
  }

  /**
   * Get merchant information
   */
  getMerchantInfo(): { merchantId: string; baseUrl: string } {
    return {
      merchantId: this.config.merchantId,
      baseUrl: this.config.apiBaseUrl,
    };
  }
}

/**
 * Factory function to create CommercePay service with environment config
 */
export function createCommercePayService(): CommercePayService {
  const config: CommercePayConfig = {
    apiBaseUrl: process.env.COMMERCEPAY_API_BASE_URL || 'https://payments.commerce.asia/api/services/app',
    merchantId: process.env.COMMERCEPAY_MERCHANT_ID || '',
    username: process.env.COMMERCEPAY_USERNAME || '',
    password: process.env.COMMERCEPAY_PASSWORD || '',
    secretKey: process.env.COMMERCEPAY_SECRET_KEY || '',
    apiKey: process.env.COMMERCEPAY_API_KEY || '',
  };

  return new CommercePayService(config);
}

/**
 * Singleton instance
 */
let instance: CommercePayService | null = null;

/**
 * Get singleton instance
 */
export function getCommercePayService(): CommercePayService {
  if (!instance) {
    instance = createCommercePayService();
  }
  return instance;
}

/**
 * Reset singleton instance (for testing)
 */
export function resetCommercePayService(): void {
  instance = null;
}

export default CommercePayService;
