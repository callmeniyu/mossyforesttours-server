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

async function testIt(payload) {
  const token = await getAccessToken(config);
  const endpointStr = normalizeCommercePayApiBaseUrl(config.apiBaseUrl) + '/PaymentGateway/RequestPayment';
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
    console.log("Success with payload keys:", Object.keys(payload));
    return true;
  } catch (e) {
    console.log("Fail with payload keys:", Object.keys(payload), "->", e.response?.data?.result?.message);
    return false;
  }
}

async function run() {
  const base = {
    "amount": 100,
    "callbackUrl":"https://merchant.com/callback",
    "currencyCode":"MYR",
    "customer":{ "email":"test@setup.com","name":"Test Setup" },
    "ipAddress":"127.0.0.1",
    "referenceCode":"CHLT-TEMP-1",
    "returnUrl":"https://merchant.com/payment/return",
    "timestamp": Math.floor(Date.now() / 1000)
  };
  
  // Test 1: base
  await testIt(base);
  
  // Test 2: add description
  await testIt({ ...base, description: "Tour Booking - Cameron Highlands Tour" });
  
  // Test 3: add invoiceNumber
  await testIt({ ...base, invoiceNumber: "INV-123" });
  
  // Test 4: amount 10000
  await testIt({ ...base, amount: 10000 });
}
run();
