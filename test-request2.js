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
    "currencyCode": "MYR",
    "amount": 100,
    "referenceCode": "ORDER-" + Date.now(),
    "ipAddress": "127.0.0.1",
    "returnUrl": "https://merchant.com/payment/return",
    "callbackUrl": "https://merchant.com/callback",
    "description": "Tour payment",
    "userAgent": "Node.js CommercePay Client",
    "savePayment": false,
    "timestamp": Math.floor(Date.now() / 1000),
    "customer": {
      "mobileNo": "+60123456789",
      "email": "customer@example.com",
      "name": "John Doe",
      "username": "johndoe"
    }
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
    console.log("Success:", JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error("Error:", e.response ? JSON.stringify(e.response.data, null, 2) : e.message);
  }
}

test();
