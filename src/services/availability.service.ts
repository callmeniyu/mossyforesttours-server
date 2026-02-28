import { Types } from 'mongoose';
import TimeSlot, { TimeSlotType } from '../models/TimeSlot';

export class AvailabilityService {
  /**
   * Check if a time slot is available for booking
   */
  static async isSlotAvailable(slotId: string, adults: number, children: number): Promise<boolean> {
    const timeSlot = await TimeSlot.findById(slotId);
    if (!timeSlot) return false;

    const totalGuests = adults + children;
    const remainingCapacity = timeSlot.capacity - timeSlot.booked;

    if (remainingCapacity < totalGuests) return false;
    
    // Check cutoff time
    const now = new Date();
    const bookingDate = new Date(timeSlot.date);
    const cutoffDate = new Date(bookingDate);
    cutoffDate.setHours(cutoffDate.getHours() - timeSlot.cutoffHours);

    if (now > cutoffDate) return false;

    return true;
  }

  /**
   * Get available slots for a package on a specific date
   */
  static async getAvailableSlots(
    packageId: Types.ObjectId,
    packageType: 'tour' | 'transfer',
    date: string
  ): Promise<TimeSlotType | null> {
    const timeSlot = await TimeSlot.findOne({
      packageId,
      packageType,
      date,
      isAvailable: true,
    });

    if (!timeSlot) return null;

    // Filter out unavailable and past-cutoff slots
    const now = new Date();
    timeSlot.slots = timeSlot.slots.filter(slot => {
      if (!slot.isAvailable) return false;
      if (slot.cutoffTime && now > slot.cutoffTime) return false;
      return true;
    });

    return timeSlot;
  }

  /**
   * Reserve a slot for booking
   */
  static async reserveSlot(
    slotId: string,
    time: string,
    adults: number,
    children: number
  ): Promise<boolean> {
    try {
      const timeSlot = await TimeSlot.findById(slotId);
      if (!timeSlot) return false;

      const slot = timeSlot.slots.find(s => s.time === time);
      if (!slot) return false;

      const totalGuests = adults + children;
      
      // Update the booking counts
      slot.bookedCount += totalGuests;
      timeSlot.booked += totalGuests;

      // Check if the slot is now full
      if (slot.bookedCount >= slot.capacity) {
        slot.isAvailable = false;
      }

      // Check if the entire time slot is full
      if (timeSlot.booked >= timeSlot.capacity) {
        timeSlot.isAvailable = false;
      }

      await timeSlot.save();
      return true;
    } catch (error) {
      console.error('Error reserving slot:', error);
      return false;
    }
  }

  /**
   * Release a previously reserved slot
   */
  static async releaseSlot(
    slotId: string,
    time: string,
    adults: number,
    children: number
  ): Promise<boolean> {
    try {
      const timeSlot = await TimeSlot.findById(slotId);
      if (!timeSlot) return false;

      const slot = timeSlot.slots.find(s => s.time === time);
      if (!slot) return false;

      const totalGuests = adults + children;
      
      // Update the booking counts
      slot.bookedCount -= totalGuests;
      timeSlot.booked -= totalGuests;

      // Reactivate availability if there's capacity
      if (slot.bookedCount < slot.capacity) {
        slot.isAvailable = true;
      }
      
      if (timeSlot.booked < timeSlot.capacity) {
        timeSlot.isAvailable = true;
      }

      await timeSlot.save();
      return true;
    } catch (error) {
      console.error('Error releasing slot:', error);
      return false;
    }
  }
}
