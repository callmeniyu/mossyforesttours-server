import { Request, Response } from 'express';
import FailedWebhookEvent from '../models/FailedWebhookEvent';
import BookingService from '../services/booking.service';
import mongoose from 'mongoose';

export class FailedWebhookController {
  // Get all failed webhook events
  static async getFailedWebhooks(req: Request, res: Response) {
    try {
      const { resolved } = req.query;
      
      const filter: any = {};
      if (resolved !== undefined) {
        filter.resolved = resolved === 'true';
      }
      
      const failedEvents = await (FailedWebhookEvent as any)
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(100);
      
      res.json({
        success: true,
        data: failedEvents,
        total: failedEvents.length
      });
    } catch (error: any) {
      console.error('Error fetching failed webhooks:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch failed webhooks'
      });
    }
  }
  
  // Get single failed webhook event
  static async getFailedWebhook(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const failedEvent = await (FailedWebhookEvent as any).findById(id);
      
      if (!failedEvent) {
        return res.status(404).json({
          success: false,
          error: 'Failed webhook event not found'
        });
      }
      
      res.json({
        success: true,
        data: failedEvent
      });
    } catch (error: any) {
      console.error('Error fetching failed webhook:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch failed webhook'
      });
    }
  }
  
  // Retry creating booking from failed webhook
  static async retryFailedWebhook(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const failedEvent = await (FailedWebhookEvent as any).findById(id);
      
      if (!failedEvent) {
        return res.status(404).json({
          success: false,
          error: 'Failed webhook event not found'
        });
      }
      
      if (failedEvent.resolved) {
        return res.status(400).json({
          success: false,
          error: 'This failed webhook has already been resolved'
        });
      }
      
      // Parse booking data from metadata
      const metadata = failedEvent.metadata;
      const adults = parseInt(metadata.adults || '1', 10);
      const children = parseInt(metadata.children || '0', 10);
      const amount = failedEvent.amount;
      const currency = failedEvent.currency;
      
      // Calculate bank charge (2.8% for Stripe)
      const bankCharge = Math.round(amount * 0.028 * 100) / 100;
      
      // Prepare booking data
      const bookingData = {
        packageType: metadata.packageType as 'tour' | 'transfer',
        packageId: new mongoose.Types.ObjectId(metadata.packageId),
        date: new Date(metadata.date),
        time: metadata.time,
        adults,
        children,
        pickupLocation: metadata.pickupLocation || 'To be confirmed',
        contactInfo: {
          name: metadata.customerName,
          email: metadata.customerEmail,
          phone: metadata.phone || '',
          whatsapp: metadata.whatsapp || ''
        },
        subtotal: amount,
        total: amount,
        paymentInfo: {
          amount,
          bankCharge,
          currency,
          paymentStatus: 'succeeded',
          stripePaymentIntentId: failedEvent.paymentIntentId,
          paymentMethod: 'stripe'
        },
        isVehicleBooking: metadata.bookingType === 'single' && metadata.packageType === 'transfer',
        vehicleSeatCapacity: metadata.vehicleSeatCapacity ? parseInt(metadata.vehicleSeatCapacity, 10) : undefined
      };
      
      // Create booking using the service
      const booking = await BookingService.createBookingDirect(bookingData);
      
      // Mark failed event as resolved
      failedEvent.resolved = true;
      failedEvent.resolvedAt = new Date();
      failedEvent.resolvedBy = 'admin-retry';
      failedEvent.notes = `Booking created manually: ${booking._id}`;
      await failedEvent.save();
      
      console.log('✅ Failed webhook resolved, booking created:', booking._id);
      
      res.json({
        success: true,
        data: {
          booking,
          failedEvent
        }
      });
    } catch (error: any) {
      console.error('Error retrying failed webhook:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retry failed webhook'
      });
    }
  }
  
  // Mark failed webhook as resolved (without creating booking)
  static async markResolved(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      
      const failedEvent = await (FailedWebhookEvent as any).findById(id);
      
      if (!failedEvent) {
        return res.status(404).json({
          success: false,
          error: 'Failed webhook event not found'
        });
      }
      
      failedEvent.resolved = true;
      failedEvent.resolvedAt = new Date();
      failedEvent.resolvedBy = 'admin-manual';
      failedEvent.notes = notes || 'Manually resolved by admin';
      await failedEvent.save();
      
      res.json({
        success: true,
        data: failedEvent
      });
    } catch (error: any) {
      console.error('Error marking failed webhook as resolved:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to mark webhook as resolved'
      });
    }
  }
}
