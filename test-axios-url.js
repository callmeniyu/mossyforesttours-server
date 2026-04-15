const axios = require('axios');
const instance = axios.create({ baseURL: 'https://payments.commerce.asia/api/services/app' });
console.log(instance.getUri({ url: '/PaymentGateway/RequestPayment' }));
