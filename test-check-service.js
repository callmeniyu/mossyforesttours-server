const { CommercePayService } = require('./dist/services/commercepay.service.js');
const config = {
  apiBaseUrl: process.env.COMMERCEPAY_API_URL || 'https://payments.commerce.asia/api/services/app',
  merchantId: process.env.COMMERCEPAY_MERCHANT_ID,
  username: process.env.COMMERCEPAY_USERNAME,
  password: process.env.COMMERCEPAY_PASSWORD,
  secretKey: process.env.COMMERCEPAY_SECRET_KEY,
  apiKey: process.env.COMMERCEPAY_API_KEY
};

(async () => {
  const dp = new CommercePayService(config);
  try {
    const resp = await dp.requestPayment({
      amount: 10000,
      currencyCode: 'MYR',
      referenceCode: 'CHLT-TEST000-123456',
      returnUrl: 'https://example.com/return',
      callbackUrl: 'https://api.example.com/callback',
      description: 'Tour Booking - test',
      customerName: 'Test User',
      customerEmail: 'test@example.com',
      invoiceNumber: 'INV-TEST',
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1'
    });
    console.log('success', resp);
  } catch (e) {
    console.error('failure', e.message, e.response?.data || e);
  }
})();
