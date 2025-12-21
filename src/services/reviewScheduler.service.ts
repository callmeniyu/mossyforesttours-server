import cron from 'node-cron';
import Booking from '../models/Booking';
import Tour from '../models/Tour';
import Transfer from '../models/Transfer';
import emailService from './email.service';

class ReviewSchedulerService {
  private isRunning = false;

  /**
   * Start the review email scheduler
   * Runs every hour to check for bookings that departed 12 hours ago
   */
  start(): void {
    console.log('🕒 Starting review email scheduler...');
    
    // Run every hour at minute 0 (00:00, 01:00, 02:00, etc.)
    cron.schedule('0 * * * *', async () => {
      if (this.isRunning) {
        console.log('⏩ Review scheduler already running, skipping...');
        return;
      }

      try {
        this.isRunning = true;
        console.log('🔍 Checking for bookings eligible for review emails...');
        await this.checkAndSendReviewEmails();
      } catch (error) {
        console.error('❌ Error in review scheduler:', error);
      } finally {
        this.isRunning = false;
      }
    });

    console.log('✅ Review email scheduler started successfully');
    console.log('Latest commit1')
  }

  /**
   * Check for bookings that departed 12 hours ago and send review emails
   */
  private async checkAndSendReviewEmails(): Promise<void> {
    try {
      // Calculate the time window for 12 hours ago (with 1-hour buffer)
      const now = new Date();
      const twelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000));
      const thirteenHoursAgo = new Date(now.getTime() - (13 * 60 * 60 * 1000));

      console.log(`📅 Checking bookings between ${thirteenHoursAgo.toISOString()} and ${twelveHoursAgo.toISOString()}`);

      // Find bookings that:
      // 1. Have departed (date + time is 12-13 hours ago)
      // 2. Haven't been sent a review email yet
      // 3. Have a valid customer email
      const eligibleBookings = await Booking.find({
        'contactInfo.email': { $exists: true, $ne: '' },
        reviewEmailSent: { $ne: true }, // Add this field to track sent emails
        date: {
          $gte: thirteenHoursAgo.toISOString().split('T')[0],
          $lte: twelveHoursAgo.toISOString().split('T')[0]
        }
      });

      console.log(`📧 Found ${eligibleBookings.length} bookings eligible for review emails`);

      for (const booking of eligibleBookings) {
        try {
          // Check if the booking time has actually passed 12 hours ago
          const bookingDateString = booking.date instanceof Date ? booking.date.toISOString().split('T')[0] : booking.date;
          const bookingDateTime = this.createBookingDateTime(bookingDateString, booking.time);
          const timeDiff = now.getTime() - bookingDateTime.getTime();
          const hoursDiff = timeDiff / (1000 * 60 * 60);

          // Only send if it's been 12-13 hours since departure
          if (hoursDiff >= 12 && hoursDiff <= 13) {
            await this.sendReviewEmailForBooking(booking);
          }
        } catch (error) {
          console.error(`❌ Error processing booking ${booking._id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Error checking for review emails:', error);
    }
  }

  /**
   * Send review email for a specific booking
   */
  private async sendReviewEmailForBooking(booking: any): Promise<void> {
    try {
      console.log(`📧 Processing review email for booking ${booking._id}`);

      // Get package details based on package type
      let packageDetails;
      let packageName = 'Unknown Package';

      if (booking.packageType === 'tour') {
        packageDetails = await Tour.findById(booking.packageId);
        packageName = packageDetails?.title || 'Tour Package';
      } else if (booking.packageType === 'transfer') {
        packageDetails = await Transfer.findById(booking.packageId);
        packageName = packageDetails?.title || 'Transfer Service';
      }

      // Prepare review email data
      const reviewData = {
        customerName: booking.contactInfo.fullName || 'Valued Customer',
        customerEmail: booking.contactInfo.email,
        bookingId: booking._id.toString(),
        packageName,
        packageType: booking.packageType as 'tour' | 'transfer',
        date: booking.date,
        time: booking.time,
        reviewFormUrl: process.env.GOOGLE_FORM_URL || 'https://forms.gle/your-review-form-id'
      };

      // Send the review email
      const emailSent = await emailService.sendReviewRequest(reviewData);

      if (emailSent) {
        // Mark the booking as having received a review email
        await Booking.findByIdAndUpdate(booking._id, {
          reviewEmailSent: true,
          reviewEmailSentAt: new Date()
        });

        console.log(`✅ Review email sent successfully for booking ${booking._id}`);
      } else {
        console.error(`❌ Failed to send review email for booking ${booking._id}`);
      }
    } catch (error) {
      console.error(`❌ Error sending review email for booking ${booking._id}:`, error);
    }
  }

  /**
   * Create a Date object from booking date and time strings
   */
  private createBookingDateTime(dateString: string, timeString: string): Date {
    try {
      const [hours, minutes] = timeString.split(':');
      const bookingDate = new Date(dateString);
      bookingDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      return bookingDate;
    } catch (error) {
      console.error('Error creating booking date time:', error);
      return new Date(); // Fallback to current time
    }
  }

  /**
   * Manual trigger for testing - sends review emails for bookings from yesterday
   */
  async testReviewEmails(): Promise<void> {
    console.log('🧪 Manual test: Sending review emails for recent bookings...');
    
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const testBookings = await Booking.find({
        'contactInfo.email': { $exists: true, $ne: '' },
        date: yesterdayStr
      }).limit(3); // Limit to 3 for testing

      console.log(`🧪 Found ${testBookings.length} test bookings`);

      for (const booking of testBookings) {
        await this.sendReviewEmailForBooking(booking);
      }

      console.log('✅ Test review emails completed');
    } catch (error) {
      console.error('❌ Error in test review emails:', error);
    }
  }

  /**
   * Stop the scheduler (for graceful shutdown)
   */
  stop(): void {
    console.log('🛑 Stopping review email scheduler...');
    // cron jobs will be stopped when the process exits
  }
}

export default new ReviewSchedulerService();
