/**
 * CommercePay Utility Functions
 * Provides signature generation, token management, and helper functions
 * 
 * Security: All sensitive operations include validation and error handling
 */

import crypto from 'crypto';
import axios from 'axios';

/**
 * Configuration for CommercePay
 */
export interface CommercePayConfig {
  apiBaseUrl: string;
  merchantId: string;
  username?: string;
  password?: string;
  secretKey: string;
  apiKey: string;
  accessToken?: string;
  tokenExpiry?: number;
}

/**
 * Normalize the CommercePay API base URL for payment requests (PaymentGateway endpoints).
 * Accepts values like:
 * - https://payments.commerce.asia/api/services/app
 * - https://payments.commerce.asia/api
 * - https://payments.commerce.asia/api/TokenAuth/Authenticate
 */
export function normalizeCommercePayApiBaseUrl(rawUrl: string): string {
  let url = String(rawUrl || '').trim();
  if (!url) {
    throw new Error('Invalid CommercePay API base URL');
  }

  // Remove trailing slash
  url = url.replace(/\/+$/, '');

  // If the auth endpoint is passed, strip it to base
  url = url.replace(/\/TokenAuth\/Authenticate$/i, '');

  // Normalize to service app base path for non-token calls
  if (url.match(/\/api\/services\/app$/i)) {
    return url;
  }

  if (url.match(/\/api$/i)) {
    return url.replace(/\/api$/i, '/api/services/app');
  }

  // Keep as-is if already looks good
  return url;
}

/**
 * Normalize CommercePay auth base URL for TokenAuth operations.
 */
export function normalizeCommercePayAuthBaseUrl(rawUrl: string): string {
  let url = String(rawUrl || '').trim();
  if (!url) {
    throw new Error('Invalid CommercePay API base URL');
  }

  url = url.replace(/\/+$/, '');
  url = url.replace(/\/TokenAuth\/Authenticate$/i, '');

  if (url.match(/\/api\/services\/app$/i)) {
    return url.replace(/\/api\/services\/app$/i, '/api');
  }

  if (!url.match(/\/api$/i)) {
    // If not ending with /api, assume this is host and append api
    url = url.replace(/\/+$/, '');
    url += '/api';
  }

  return url;
}

/**
 * Payment request data interface
 */
export interface PaymentRequestData {
  amount: number;
  currencyCode: string;
  referenceCode: string;
  returnUrl: string;
  callbackUrl: string;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  invoiceNumber?: string;
  [key: string]: any;
}

/**
 * Transaction verification response
 */
export interface TransactionVerification {
  transactionNumber: string;
  referenceCode: string;
  amount: number;
  transactionStatus: string;
  timestamp: string;
  paymentChannel: string;
}

/**
 * Webhook payload interface
 */
export interface WebhookPayload {
  transactionNumber: string;
  referenceCode: string;
  transactionStatus: string;
  amount: number;
  paymentChannel: string;
  timestamp: string;
  capSignature: string;
  [key: string]: any;
}

/**
 * Logger utility for secure logging
 */
class PaymentLogger {
  static log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const sanitized = this.sanitizeData(data);
    const log = {
      timestamp,
      level,
      message,
      ...(sanitized && { data: sanitized }),
    };
    console.log(JSON.stringify(log));
  }

  private static sanitizeData(data: any): any {
    if (!data) return null;

    const sanitized = { ...data };
    const sensitiveFields = ['secretKey', 'apiKey', 'accessToken', 'clientSecret', 'cardNumber', 'cvv', 'password'];

    const sanitizeObject = (obj: any) => {
      for (const field of sensitiveFields) {
        if (field in obj) {
          obj[field] = '***REDACTED***';
        }
      }
      return obj;
    };

    return sanitizeObject(sanitized);
  }

  static logPaymentOperation(operation: string, referenceCode: string, status: string) {
    this.log('info', `Payment ${operation}`, { referenceCode, status, timestamp: new Date().toISOString() });
  }

  static logError(operation: string, error: any, context?: any) {
    this.log('error', `Payment ${operation} failed`, {
      error: error.message || String(error),
      context: this.sanitizeData(context),
    });
  }
}

/**
 * Generate HMAC-SHA256 signature for CommercePay requests
 * @param payload - Data to sign
 * @param secretKey - Secret key for signing
 * @returns Base64-encoded signature
 */

export function cleanCommercePayPayload(obj: any): any {
  if (obj === null || obj === undefined || obj === "") {
    return undefined;
  }

  if (Array.isArray(obj)) {
    return obj
      .map((item) => cleanCommercePayPayload(item))
      .filter((item) => item !== undefined);
  }

  if (typeof obj === 'object') {
    const cleaned = Object.keys(obj)
      .reduce((acc: any, key) => {
        const cleanedValue = cleanCommercePayPayload(obj[key]);
        if (cleanedValue !== undefined) {
          acc[key] = cleanedValue;
        }
        return acc;
      }, {});

    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }

  return obj;
}

export function sortCommercePayPayload(payload: any): any {
  const cleanedPayload = cleanCommercePayPayload(payload);

  const stringifyAndSort = (obj: any): any => {
    if (obj === null || obj === undefined || obj === "") return undefined;

    if (Array.isArray(obj)) {
      return obj.map(item => stringifyAndSort(item));
    }

    if (typeof obj === 'object') {
      return Object.keys(obj)
        .sort()
        .reduce((sorted: any, key) => {
          if (obj[key] !== null && obj[key] !== undefined && obj[key] !== "") {
            sorted[key] = stringifyAndSort(obj[key]);
          }
          return sorted;
        }, {});
    }

    return obj;
  };

  return stringifyAndSort(cleanedPayload);
}

export function generateCommercePaySignature(payload: any, secretKey: string, endpointUrl: string = ''): string {
  const cleanSecretKey = String(secretKey || '').trim().replace(/^['"]|['"]$/g, '');
  
  if (!cleanSecretKey) {
    throw new Error('Invalid secret key provided');
  }

  // Deep clone and process payload 
  // 1. Remove properties with null/undefined/"" values
  // 2. Sort object keys recursively for signature string
  const stringifyAndSort = (obj: any): any => {
    if (obj === null || obj === undefined || obj === "") return undefined;
    
    if (Array.isArray(obj)) {
      return obj.map(item => stringifyAndSort(item));
    }
    
    if (typeof obj === 'object') {
      return Object.keys(obj)
        .sort()
        .reduce((sorted: any, key) => {
          if (obj[key] !== null && obj[key] !== undefined && obj[key] !== "") {
            sorted[key] = stringifyAndSort(obj[key]);
          }
          return sorted;
        }, {});
    }
    return obj;
  };

  const processedPayload = sortCommercePayPayload(payload);

  // Convert payload to JSON string
  const jsonString = JSON.stringify(processedPayload);

  // Combine URL (without trailing slash and queries) and JSON string
  const baseUrl = endpointUrl.split('?')[0].replace(/\/$/, '');
  const combinedString = baseUrl + jsonString;

  // CommercePay docs require lower-casing the URL+JSON string before hashing.
  const lowercasedString = combinedString.toLowerCase();
  const stringToHash = lowercasedString;
  
  console.log('CommercePay Signature Debug:');
  console.log('Base URL:', baseUrl);
  console.log('JSON String:', jsonString);
  console.log('Combined:', combinedString);
  console.log('Lowercased (hash payload):', lowercasedString);
  console.log('String being hashed:', stringToHash);

  const hmac = crypto.createHmac('sha256', cleanSecretKey);
  hmac.update(stringToHash);
  const signature = hmac.digest('hex');
  console.log('CommercePay Signature:', signature);

  return signature;
}

/**
 * Verify CommercePay webhook signature
 * @param payload - Webhook payload
 * @param signature - Signature from webhook header
 * @param secretKey - Secret key for verification
 * @returns true if signature is valid
 */
export function verifyCommercePaySignature(payload: any, signature: string, secretKey: string, endpointUrl: string = ''): boolean {
  if (!signature || !secretKey) {
    PaymentLogger.log('warn', 'Missing signature or secret key for verification');
    return false;
  }

  try {
    const expectedSignature = generateCommercePaySignature(payload, secretKey, endpointUrl);
    const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    return isValid;
  } catch (error) {
    PaymentLogger.logError('signature_verification', error);
    return false;
  }
}

/**
 * Cache for access tokens
 */
interface TokenCache {
  token: string;
  expiry: number;
}

const tokenCache: Map<string, TokenCache> = new Map();

/**
 * Get or refresh access token from CommercePay
 * @param config - CommercePay configuration
 * @returns Access token
 */
export async function getAccessToken(config: CommercePayConfig): Promise<string> {
  const cacheKey = `${config.merchantId}:token`;

  // Check if cached token is still valid
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    PaymentLogger.log('debug', 'Using cached access token');
    return cached.token;
  }

  try {
    PaymentLogger.log('info', 'Requesting new access token from CommercePay');

    const authBaseUrl = normalizeCommercePayAuthBaseUrl(config.apiBaseUrl || process.env.COMMERCEPAY_API_BASE_URL || '');
    const baseUrlWithApi = authBaseUrl.replace(/\/+$/, '');

    PaymentLogger.log('debug', 'CommercePay auth base URL', { authBaseUrl, baseUrlWithApi });

    // Check global process.env directly if config fields are missing
    const rawUsername = config.username || process.env.COMMERCEPAY_USERNAME || config.merchantId;
    const finalUsername = String(rawUsername).trim().replace(/^['"]|['"]$/g, '');
    
    // Explicit password from env usually needs cleaning of quotes
    const rawEnvPassword = process.env.COMMERCEPAY_PASSWORD;
    const cleanEnvPassword = rawEnvPassword ? String(rawEnvPassword).trim().replace(/^['"]|['"]$/g, '') : null;
    
    const explicitPassword = (config.password && config.password !== '***') ? config.password : cleanEnvPassword;
    const authPassword = explicitPassword || (config.secretKey || config.apiKey).substring(0, 32);

    // Log Discovery with hidden password but verified length
    PaymentLogger.log('debug', 'Auth discovery clean', {
      finalUsername: finalUsername,
      passwordLength: authPassword.length,
      passwordSource: explicitPassword ? 'env_explicit' : 'secret_truncated'
    });

    const authUsername = finalUsername;
    const finalCleanPassword = String(authPassword).trim().replace(/^['"]|['"]$/g, '');
    
    const secretKeyTruncated = (config.secretKey || config.apiKey).substring(0, 32);
    const apiKeyTruncated = config.apiKey.substring(0, 32);
    
    const authAttempts: Array<{ url: string; body: Record<string, any>; headers?: Record<string, string> }> = [
      {
        // 1. Email + Password (Explicit API Account)
        url: `${baseUrlWithApi}/TokenAuth/Authenticate`,
        body: {
          userNameOrEmailAddress: authUsername,
          password: finalCleanPassword,
        },
        headers: { 'Abp-TenantId': config.merchantId.toString().replace(/^['"]|['"]$/g, '') }
      },
      {
        // 2. Email + Secret Key (Truncated)
        url: `${baseUrlWithApi}/TokenAuth/Authenticate`,
        body: {
          userNameOrEmailAddress: authUsername,
          password: secretKeyTruncated,
        },
        headers: { 'Abp-TenantId': config.merchantId.toString().replace(/^['"]|['"]$/g, '') }
      },
      {
        // 3. MerchantId + Password
        url: `${baseUrlWithApi}/TokenAuth/Authenticate`,
        body: {
          userNameOrEmailAddress: config.merchantId.toString().replace(/^['"]|['"]$/g, ''),
          password: finalCleanPassword,
        },
        headers: { 'Abp-TenantId': config.merchantId.toString().replace(/^['"]|['"]$/g, '') }
      },
      {
        // 4. MerchantId + Secret Key
        url: `${baseUrlWithApi}/TokenAuth/Authenticate`,
        body: {
          userNameOrEmailAddress: config.merchantId.toString().replace(/^['"]|['"]$/g, ''),
          password: secretKeyTruncated,
        },
        headers: { 'Abp-TenantId': config.merchantId.toString().replace(/^['"]|['"]$/g, '') }
      },
      {
        // 5. NO TenantId Header (Host-level auth)
        url: `${baseUrlWithApi}/TokenAuth/Authenticate`,
        body: {
          userNameOrEmailAddress: authUsername,
          password: finalCleanPassword,
        }
      }
    ];

    let response: any = null;
    let lastError: any = null;

    for (const attempt of authAttempts) {
      try {
        PaymentLogger.log('debug', `CRITICAL_DEBUG: Attempting auth at ${attempt.url}`, { 
          fullUrl: attempt.url,
          headers: {
            'Abp-TenantId': 1129,
            'Content-Type': 'application/json',
          },
          body_REDACTED: { 
            userNameOrEmailAddress: attempt.body.userNameOrEmailAddress,
            passwordLength: attempt.body.password?.length,
            passwordFirstThree: attempt.body.password?.substring(0, 3) + '...'
          }
        });
        
        response = await axios.post(attempt.url, attempt.body, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(attempt.headers || {})
          },
          validateStatus: () => true,
        });

        PaymentLogger.log('debug', `CRITICAL_DEBUG: Response from ${attempt.url}`, {
          status: response.status,
          data: response.data,
          headers: response.headers
        });

        // Check if response is successful (2xx status)
        const tokenFromResponse = response.data?.result?.accessToken || response.data?.result?.token;
        if (response.status >= 200 && response.status < 300 && tokenFromResponse) {
          PaymentLogger.log('debug', `Auth successful at ${attempt.url}`, { status: response.status });
          response.data = { ...response.data, result: { ...response.data.result, accessToken: tokenFromResponse } };
          break;
        } else if (response.status >= 200 && response.status < 300) {
          PaymentLogger.log('debug', `Auth attempt returned 2xx but no token: ${attempt.url}`, {
            status: response.status,
            data: response.data,
          });
          lastError = new Error(`HTTP ${response.status}: No access token in response (data=${JSON.stringify(response.data)})`);
          continue; // try next attempt
        } else {
          PaymentLogger.log('debug', `Auth attempt failed: ${attempt.url}`, {
            status: response.status,
            data: response.data,
          });
          lastError = new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
        }
      } catch (error) {
        PaymentLogger.log('debug', `Auth attempt error: ${attempt.url}`, { error: (error as any).message });
        lastError = error;
      }
    }

    if (!response) {
      throw lastError || new Error('Failed to authenticate with all supported auth endpoints');
    }

    const result = response.data?.result || {};
    const token = result.accessToken || result.token;

    if (!token) {
      // Even if HTTP 200, if no token in response it's still a failure
      const errorMsg = response.data?.error?.message || 'Invalid authentication response from CommercePay';
      throw new Error(errorMsg);
    }

    const expiryTime =
      result.expiryTime ||
      (typeof result.expiresIn === 'number' ? result.expiresIn * 1000 : undefined) ||
      3600000; // Default 1 hour

    // Cache the token (refresh 5 minutes before expiry)
    tokenCache.set(cacheKey, {
      token,
      expiry: Date.now() + expiryTime - 300000,
    });

    PaymentLogger.log('info', 'Access token obtained successfully');
    return token;
  } catch (error) {
    PaymentLogger.logError('get_access_token', error, { merchantId: config.merchantId });
    throw new Error(`Failed to authenticate with CommercePay: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Invalidate cached token (on error scenarios)
 * @param merchantId - Merchant ID
 */
export function invalidateTokenCache(merchantId: string): void {
  const cacheKey = `${merchantId}:token`;
  tokenCache.delete(cacheKey);
  PaymentLogger.log('debug', 'Token cache invalidated', { merchantId });
}

/**
 * Validate payment amount
 * @param amount - Amount to validate (in smallest currency unit)
 * @returns true if valid
 */
export function validatePaymentAmount(amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) {
    PaymentLogger.log('warn', 'Invalid payment amount', { amount });
    return false;
  }

  // Validate amount is in cents/smallest unit (no decimals)
  if (!Number.isInteger(amount)) {
    PaymentLogger.log('warn', 'Amount must be integer (in smallest currency unit)', { amount });
    return false;
  }

  // Check reasonable limits (1 sen to 1 million ringgit)
  if (amount < 1 || amount > 100000000) {
    PaymentLogger.log('warn', 'Amount outside acceptable range', { amount, min: 1, max: 100000000 });
    return false;
  }

  return true;
}

/**
 * Validate currency code
 * @param currency - Currency code to validate
 * @returns true if valid
 */
export function validateCurrencyCode(currency: string): boolean {
  const validCurrencies = ['MYR', 'USD', 'SGD'];
  const isValid = validCurrencies.includes(currency);

  if (!isValid) {
    PaymentLogger.log('warn', 'Invalid currency code', { currency, validCurrencies });
  }

  return isValid;
}

/**
 * Validate reference code format
 * @param referenceCode - Reference code to validate
 * @returns true if valid
 */
export function validateReferenceCode(referenceCode: string): boolean {
  // Reference code should be alphanumeric, 1-50 characters
  const isValid = /^[a-zA-Z0-9_-]{1,50}$/.test(referenceCode);

  if (!isValid) {
    PaymentLogger.log('warn', 'Invalid reference code format', { referenceCode });
  }

  return isValid;
}

/**
 * Validate URL format
 * @param url - URL to validate
 * @returns true if valid
 */
export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    PaymentLogger.log('warn', 'Invalid URL format', { url });
    return false;
  }
}

/**
 * Build payment request payload
 * @param paymentData - Payment data
 * @returns Validated payment request payload
 */
export function validateTimestamp(timestamp: string | number): boolean {
  if (timestamp === undefined || timestamp === null || timestamp === '') {
    PaymentLogger.log('warn', 'Missing timestamp in payment payload');
    return false;
  }

  const numeric = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  if (Number.isNaN(numeric) || typeof numeric !== 'number') {
    PaymentLogger.log('warn', 'Invalid timestamp format', { timestamp });
    return false;
  }

  const now = Date.now();
  // Handle both seconds and milliseconds (if length is < 13, probably seconds)
  const isSeconds = numeric < 20000000000;
  const numericMs = isSeconds ? numeric * 1000 : numeric;
  const drift = Math.abs(now - numericMs);
  if (drift > 5 * 60 * 1000) {
    PaymentLogger.log('warn', 'Timestamp drift too large', { timestamp, drift });
    return false;
  }

  return true;
}

export function buildPaymentRequestPayload(paymentData: PaymentRequestData): PaymentRequestData {
  // Validate all required fields
  if (!validatePaymentAmount(paymentData.amount)) {
    throw new Error('Invalid payment amount');
  }

  if (!validateCurrencyCode(paymentData.currencyCode)) {
    throw new Error('Invalid currency code');
  }

  if (!validateReferenceCode(paymentData.referenceCode)) {
    throw new Error('Invalid reference code format');
  }

  const rawTimestamp = paymentData.timestamp ?? Date.now();
  let numericTimestamp: number;

  const candidate = typeof rawTimestamp === 'string' ? Number(Date.parse(rawTimestamp)) : Number(rawTimestamp);

  if (Number.isNaN(candidate) || typeof candidate !== 'number') {
    throw new Error('Invalid timestamp format');
  }

  // API docs require milliseconds. If seconds detected, convert to ms.
  numericTimestamp = candidate < 1000000000000 ? candidate * 1000 : candidate;

  if (Number.isNaN(numericTimestamp) || typeof numericTimestamp !== 'number') {
    throw new Error('Invalid timestamp format');
  }

  if (!validateTimestamp(numericTimestamp)) {
    throw new Error('Invalid timestamp');
  }

  if (!validateUrl(paymentData.returnUrl)) {
    throw new Error('Invalid return URL');
  }

  if (!validateUrl(paymentData.callbackUrl)) {
    throw new Error('Invalid callback URL');
  }

  // Build clean payload according to CommercePay expected fields
  const customer: any = {};
  if (paymentData.customerEmail?.trim()) {
    customer.email = paymentData.customerEmail.trim();
  }
  if (paymentData.customerName?.trim()) {
    customer.name = paymentData.customerName.trim();
  }
  if (paymentData.customerMobileNo?.trim()) {
    customer.mobileNo = paymentData.customerMobileNo.trim();
  }

  const payload: any = {
    currencyCode: paymentData.currencyCode,
    amount: paymentData.amount,
    referenceCode: paymentData.referenceCode,
    description: (paymentData.description || 'Tour payment').trim(),
    ipAddress: (paymentData.ipAddress || '127.0.0.1').trim(),
    userAgent: (paymentData.userAgent || 'Node.js CommercePay Client').trim(),
    returnUrl: paymentData.returnUrl.trim(),
    callbackUrl: paymentData.callbackUrl.trim(),
    savePayment: false,
    ...(Object.keys(customer).length > 0 ? { customer } : {}),
    timestamp: numericTimestamp,
  };

  // Add optional fields if provided
  if (paymentData.description) {
    payload.description = paymentData.description.substring(0, 200); // Limit to 200 chars
  }

  // Do not duplicate customer info as top-level fields; use nested customer object only
  // (reduces signature mismatch risk with CommercePay's expected payload format)


  return payload;
}

/**
 * Validate email format
 * @param email - Email to validate
 * @returns true if valid
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format amount for display (ringgit in 2 decimal places)
 * @param amountInCents - Amount in cents
 * @returns Formatted amount string
 */
export function formatAmountForDisplay(amountInCents: number): string {
  const amountInRinggit = (amountInCents / 100).toFixed(2);
  return `RM ${amountInRinggit}`;
}

/**
 * Parse CommercePay transaction status
 * @param status - Raw status from CommercePay
 * @returns Parsed status
 */
export function parseTransactionStatus(status: string): 'succeeded' | 'failed' | 'pending' | 'unknown' {
  const statusMap: Record<string, 'succeeded' | 'failed' | 'pending' | 'unknown'> = {
    '00': 'succeeded',
    'A00': 'succeeded',
    '01': 'failed',
    '02': 'failed',
    'P00': 'pending',
    'U00': 'unknown',
  };

  return statusMap[status] || 'unknown';
}

/**
 * Get CommercePay error message from status code
 * @param statusCode - Status code from CommercePay
 * @returns User-friendly error message
 */
export function getCommercePayErrorMessage(statusCode: string): string {
  const errorMessages: Record<string, string> = {
    '01': 'Payment declined by your bank. Please try again or use a different payment method.',
    '02': 'Payment declined. Please contact your bank for more information.',
    '03': 'Payment cancelled.',
    '04': 'Payment timed out. Please try again.',
    '05': 'Insufficient funds. Please check your account balance.',
    'U00': 'Payment status unknown. Please contact support.',
  };

  return errorMessages[statusCode] || 'Payment processing failed. Please try again.';
}

/**
 * Generate idempotency key for payment requests
 * @param merchantId - Merchant ID
 * @param referenceCode - Reference code
 * @returns Idempotency key
 */
export function generateIdempotencyKey(merchantId: string, referenceCode: string): string {
  const data = `${merchantId}:${referenceCode}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Log payment operation with audit trail
 * @param operation - Operation name
 * @param referenceCode - Reference code
 * @param status - Operation status
 * @param metadata - Additional metadata
 */
export function logPaymentOperation(
  operation: string,
  referenceCode: string,
  status: string,
  metadata?: Record<string, any>
): void {
  PaymentLogger.logPaymentOperation(operation, referenceCode, status);

  if (metadata) {
    PaymentLogger.log('debug', `${operation} metadata`, PaymentLogger['sanitizeData'](metadata));
  }
}

/**
 * Create axios instance with CommercePay configuration
 * @param config - CommercePay configuration
 * @param accessToken - Access token for authorization
 * @returns Configured axios instance
 */
export function createCommercePayAxiosInstance(config: CommercePayConfig, accessToken: string) {
  const normalizedBaseUrl = normalizeCommercePayApiBaseUrl(config.apiBaseUrl);

  PaymentLogger.log('debug', 'CommercePay request base URL', { normalizedBaseUrl });

  return axios.create({
    baseURL: normalizedBaseUrl,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Abp-TenantId': config.merchantId,
      'Accept': 'application/json',
      'User-Agent': 'CommercePay-Integration/1.0',
    },
    timeout: 30000, // 30 seconds timeout
  });
}

/**
 * Retry logic for API calls
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries
 * @param backoffMs - Initial backoff in milliseconds
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  backoffMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on validation errors or client 4xx errors
      if (lastError.message.includes('Invalid')) {
        throw lastError;
      }

      const axiosError = error as any;
      if (axiosError?.response?.status >= 400 && axiosError?.response?.status < 500) {
        // No retry for client errors: payload/params issue
        throw lastError;
      }

      if (attempt < maxRetries) {
        const delay = backoffMs * Math.pow(2, attempt); // Exponential backoff
        PaymentLogger.log('warn', `Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
          error: lastError.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Constants for CommercePay
 */
export const COMMERCEPAY_CONSTANTS = {
  // Transaction statuses
  STATUS_CODES: {
    SUCCESS: '00',
    SUCCESS_ALT: 'A00',
    FAILED: '01',
    FAILED_ALT: '02',
    PENDING: 'P00',
    UNKNOWN: 'U00',
  },

  // API paths
  API_PATHS: {
    AUTHENTICATE: '/AuthenticationServices/Authenticate',
    REQUEST_PAYMENT: '/PaymentGateway/RequestPayment',
    VERIFY_TRANSACTION: '/PaymentGateway/VerifyTransaction',
    QUERY_TRANSACTION: '/PaymentGateway/QueryTransaction',
    REFUND: '/PaymentGateway/Refund',
  },

  // Timeout settings
  TIMEOUTS: {
    PAYMENT_INTENT: 30 * 60 * 1000, // 30 minutes
    WEBHOOK_RETRY: 60 * 1000, // 1 minute
  },

  // Payment channels
  PAYMENT_CHANNELS: {
    FPX: 'FPX',
    CREDIT_CARD: 'CREDIT_CARD',
    DEBIT_CARD: 'DEBIT_CARD',
    E_WALLET: 'E_WALLET',
    E_BANKING: 'E_BANKING',
    VIRTUAL_ACCOUNT: 'VIRTUAL_ACCOUNT',
  },
};

export default {
  generateCommercePaySignature,
  verifyCommercePaySignature,
  getAccessToken,
  invalidateTokenCache,
  validatePaymentAmount,
  validateCurrencyCode,
  validateReferenceCode,
  validateUrl,
  buildPaymentRequestPayload,
  isValidEmail,
  formatAmountForDisplay,
  parseTransactionStatus,
  getCommercePayErrorMessage,
  generateIdempotencyKey,
  logPaymentOperation,
  createCommercePayAxiosInstance,
  retryWithBackoff,
  PaymentLogger,
  COMMERCEPAY_CONSTANTS,
};
