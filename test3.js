const { generateCommercePaySignature, normalizeCommercePayApiBaseUrl, COMMERCEPAY_CONSTANTS, buildPaymentRequestPayload } = require('./dist/utils/commercepay.utils.js');
const paymentData = {
    "amount": 5150,
    "currencyCode": "MYR",
    "referenceCode": "CHLT-TEMP-1774947493457-lmmkh52fl-1774947493506",
    "description": "Tour Booking - Mossy Forest Land Rover Memories",
    "ipAddress": "::ffff:192.168.1.45",
    "userAgent": "Node.js CommercePay Client",
    "returnUrl": "http://localhost:3000/payment-commercepay-callback?reference=CHLT-TEMP-1774947493457-lmmkh52fl-1774947493506",
    "callbackUrl": "http://localhost:3001/api/payment/commercepay/webhook",
    "customer": {
        "email": "786niyasniya@gmail.com",
        "name": "jkdhfjbdf ",
        "mobileNo": ""
    },
    // use a fresh timestamp to avoid drift error
    "timestamp": Date.now(),
    "customerName": "jkdhfjbdf ",
    "customerEmail": "786niyasniya@gmail.com",
    "invoiceNumber": "INV-TEMP-1774947493457-lmmkh52fl"
};

const payload = buildPaymentRequestPayload(paymentData);

// Wait, what if we use the original logic (without null/empty removing from the root payload)
const endpointStr = normalizeCommercePayApiBaseUrl("https://payments.commerce.asia/api") + COMMERCEPAY_CONSTANTS.API_PATHS.REQUEST_PAYMENT;

// The issue might be that in commercepay.service.ts we do:
// const jsonPayload = JSON.stringify(payload);
// But the `payload` we pass to generateCommercePaySignature is mutated by stringifyAndSort?
// stringifyAndSort currently MUTATES if it's returning a new object... wait, it returns a new object, so payload is NOT mutated.
