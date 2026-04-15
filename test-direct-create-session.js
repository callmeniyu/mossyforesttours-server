const { CommercePayService } = require('./dist/services/commercepay.service.js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

const config = {
  apiBaseUrl: process.env.COMMERCEPAY_API_BASE_URL || 'https://payments.commerce.asia/api/services/app',
  merchantId: process.env.COMMERCEPAY_MERCHANT_ID,
  username: process.env.COMMERCEPAY_USERNAME,
  password: process.env.COMMERCEPAY_PASSWORD,
  secretKey: process.env.COMMERCEPAY_SECRET_KEY,
  apiKey: process.env.COMMERCEPAY_API_KEY,
};

async function run() {
  const svc = new CommercePayService(config);
  try {
    const result = await svc.requestPayment({
      amount: 100 * 100,
      currencyCode: 'MYR',
      referenceCode: 'CHLT-TEST12345-DIRECT',
      returnUrl: 'https://localhost:3000/payment-commercepay-callback?reference=CHLT-TEST12345-DIRECT',
      callbackUrl: 'https://localhost:3001/api/payment/commercepay/webhook',
      description: 'Tour Booking - Cameron Highlands Tour',
      customerName: 'Test Customer',
      customerEmail: 'test@test.com',
      timestamp: Date.now(),
      ipAddress: '127.0.0.1',
    });
    console.log('SUCCESS', result);
  } catch (err) {
    console.error('FAIL', err.response?.data || err.message);
  }
}

run();
