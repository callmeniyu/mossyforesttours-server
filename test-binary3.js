const { generateCommercePaySignature, normalizeCommercePayApiBaseUrl, sortCommercePayPayload, getAccessToken } = require('./dist/utils/commercepay.utils.js');
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
    "description": "Tour booking",
    "ipAddress":"127.0.0.1",
    "referenceCode":"CHLT-TEMP-3",
    "returnUrl":"https://merchant.com/payment/return",
    "timestamp": Math.floor(Date.now() / 1000)
  };
  
  console.log("Test 1: invoiceNo");
  await testIt({ ...base, invoiceNo: "INV-123" });
}
run();
