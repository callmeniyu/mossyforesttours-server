# Email Testing Guide

## Testing Confirmation Emails Without Making a Booking

You can now preview and test confirmation emails without going through the entire booking process!

### Quick Start

1. **Configure the test script**

   - Open `test-email.ts` in the server directory
   - Change the `TEST_EMAIL` constant to your email address:
     ```typescript
     const TEST_EMAIL = "your-email@example.com";
     ```

2. **Choose the email type to test**

   - Set `TEST_BOOKING_TYPE` to either `'tour'` or `'transfer'`:
     ```typescript
     const TEST_BOOKING_TYPE: "tour" | "transfer" = "tour";
     ```

3. **Run the test**

   ```bash
   cd server
   npm run test-email
   ```

4. **Check your inbox**
   - The test email will be sent to the email address you specified
   - Check spam folder if you don't see it immediately
   - It may take 1-2 minutes to arrive

### Customizing Test Data

You can modify the sample booking data in `test-email.ts`:

#### Tour Booking Example

```typescript
const sampleTourBooking: BookingEmailData = {
  customerName: "John Doe",
  customerEmail: TEST_EMAIL,
  packageName: "Cameron Highlands Full Day Tour",
  date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  time: "09:00",
  adults: 2,
  children: 1,
  total: 250.0,
  // ... other fields
};
```

#### Transfer Booking Example

```typescript
const sampleTransferBooking: BookingEmailData = {
  customerName: "Jane Smith",
  customerEmail: TEST_EMAIL,
  packageName: "Private Transfer Service",
  from: "KLIA Airport",
  to: "Cameron Highlands Resort",
  date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  time: "14:30",
  adults: 3,
  isVehicleBooking: true,
  vehicleName: "Toyota Alphard",
  vehicleSeatCapacity: 7,
  total: 350.0,
  // ... other fields
};
```

### Troubleshooting

**Email not received?**

- Check your spam/junk folder
- Verify `BREVO_API_KEY` is set in your `.env` file
- Make sure your Brevo account has email sending quota
- Check that the sender email is verified in Brevo

**Script fails to run?**

- Ensure all dependencies are installed: `npm install`
- Check that `.env` file exists in the server directory
- Verify `BREVO_API_KEY` is properly configured

### Testing Different Scenarios

1. **Regular Tour Booking**

   ```typescript
   const TEST_BOOKING_TYPE = "tour";
   // Use default sampleTourBooking data
   ```

2. **Private Vehicle Transfer**

   ```typescript
   const TEST_BOOKING_TYPE = "transfer";
   // Set isVehicleBooking: true in sampleTransferBooking
   ```

3. **Transfer with Regular Guests**
   ```typescript
   const TEST_BOOKING_TYPE = "transfer";
   // Set isVehicleBooking: false in sampleTransferBooking
   ```

### What Gets Tested

When you run the test script, it will:

- ✅ Send a realistic confirmation email to your specified address
- ✅ Include all booking details (date, time, pickup, etc.)
- ✅ Show the correct branding (Cameron Highlands Tours)
- ✅ Include important information and cancellation policy
- ✅ Test the actual email delivery via Brevo API

### Email Template Updates

The following changes have been made to the email templates:

- ✅ Changed branding from "Oastel" to "Cameron Highlands Tours"
- ✅ Updated default contact information for Cameron Highlands
- ✅ Updated website URL and support email
- ✅ Maintained all functionality and styling

### Notes

- The test email uses real data but a test booking ID
- No actual booking is created in the database
- The email sent is identical to what customers receive
- You can run the test as many times as needed
- Each test generates a unique booking ID for tracking

### Need Help?

If you encounter issues or need to customize the email templates further:

1. Email templates are in `src/services/brevo.service.ts` and `src/services/email.service.ts`
2. Email configuration is in `src/config/email.config.ts`
3. Make sure your `.env` file has all required email settings
