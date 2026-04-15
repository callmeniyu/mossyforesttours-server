const { buildPaymentRequestPayload } = require('./dist/utils/commercepay.utils.js');
console.log(buildPaymentRequestPayload({
    amount: 100,
    currencyCode: 'MYR',
    referenceCode: '123',
    returnUrl: 'https://example.com/return',
    callbackUrl: 'https://example.com/callback',
    timestamp: new Date().toISOString(),
    customerName: 'test',
    customerEmail: 'test@example.com',
    description: 'test'
}));
