const { generateCommercePaySignature, normalizeCommercePayApiBaseUrl, sortCommercePayPayload } = require('./dist/utils/commercepay.utils.js');
const { getAccessToken } = require('./dist/utils/commercepay.utils.js');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

const config = {
  apiBaseUrl: process.env.COMMERCEPAY_API_URL || 'https://payments.commerce.asia/api/services/app',
  merchantId: process.env.COMMERCEPAY_MERCHANT_ID,
  username: process.env.COMMERCEPAY_USERNAME,
  password: process.env.COMMERCEPAY_PASSWORD,
  secretKey: process.env.COMMERCEPAY_SECRET_KEY,
  apiKey: process.env.COMMERCEPAY_API_KEY
};

async function test() {
  const token = await getAccessToken(config);
  const endpointStr = normalizeCommercePayApiBaseUrl(config.apiBaseUrl) + '/PaymentGateway/RequestPayment';
  
  const payload = {
    "amount":10000,
    "callbackUrl":"http://localhost:3001/api/payment/commercepay/webhook",
    "currencyCode":"MYR",
    "customer":{"email":"test@setup.com","name":"Test Setup"},
    "description":"Tour Booking - Cameron Highlands Tour",
    "invoiceNumber":"INV-TEMP",
    "ipAddress":"127.0.0.1",
    "referenceCode":"CHLT-TEMP-1775011113720",
    "returnUrl":"http://localhost:3000/payment-commercepay-callback?reference=CHLT-TEMP-1775011113720",
    "savePayment":false,
    "timestamp":1775011113,
    "userAgent":"Node.js CommercePay Client"
  };

  const processedPayload = sortCommercePayPayload(payload);
  const signature = generateCommercePaySignature(processedPayload, config.secretKey, endpointStr);
  const jsonPayload = JSON.stringify(processedPayload);
  
  try {
    const res = await axios.post(endpointStr, jsonPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Abp-TenantId': config.merchantId,
        'cap-signature': signature
      }
    });
    console.log("Success");
  } catch (e) {
    console.error("Error:", e.response ? JSON.stringify(e.response.data) : e.message);
  }
}
test();
