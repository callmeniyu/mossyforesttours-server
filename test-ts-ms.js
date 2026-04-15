const { generateCommercePaySignature, normalizeCommercePayApiBaseUrl, sortCommercePayPayload } = require('./dist/utils/commercepay.utils.js');
const { getAccessToken } = require('./dist/utils/commercepay.utils.js');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

const conf = {
  apiBaseUrl: process.env.COMMERCEPAY_API_URL || 'https://payments.commerce.asia/api/services/app',
  merchantId: process.env.COMMERCEPAY_MERCHANT_ID,
  username: process.env.COMMERCEPAY_USERNAME,
  password: process.env.COMMERCEPAY_PASSWORD,
  secretKey: process.env.COMMERCEPAY_SECRET_KEY,
  apiKey: process.env.COMMERCEPAY_API_KEY
};

async function run() {
  const testPayload = {
    amount: 10000,
    callbackUrl: 'https://merchant.com/callback',
    currencyCode:'MYR',
    customer: { email:'test@setup.com', name:'Test Setup' },
    ipAddress:'127.0.0.1',
    referenceCode:'CHLT-TEMP-TSMS',
    returnUrl:'https://merchant.com/payment/return',
    timestamp: Date.now(),
    description:'Test',
    savePayment:false,
    userAgent:'Node.js'
  };
  const payload = sortCommercePayPayload(testPayload);
  const sig = generateCommercePaySignature(payload, conf.secretKey, normalizeCommercePayApiBaseUrl(conf.apiBaseUrl) + '/PaymentGateway/RequestPayment');
  const token = await getAccessToken(conf);
  try {
    const r = await axios.post(normalizeCommercePayApiBaseUrl(conf.apiBaseUrl)+'/PaymentGateway/RequestPayment', JSON.stringify(payload), { headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'Abp-TenantId':conf.merchantId,'cap-signature':sig}});
    console.log('OK', r.data);
  } catch(e) {
    console.log('fail', e.response?.data?.result?.message || e.message, e.response?.data);
  }
}
run();
