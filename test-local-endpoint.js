const axios = require('axios');
async function run() {
  try {
    const res = await axios.post('http://localhost:3002/api/payment/commercepay/create-session', {
      amount: 100,
      bookingData: {
        bookingId: "TEST12345",
        packageName: "Cameron Highlands Tour",
        customerName: "Test Customer",
        customerEmail: "test@test.com"
      }
    });
    console.log("Success:", res.data);
  } catch (e) {
    console.log("Fail:", e.response?.data);
  }
}
run();
