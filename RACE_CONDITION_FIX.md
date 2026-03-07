# Race Condition Fix - Double Booking Prevention

## Problem

A critical race condition was allowing double bookings to occur when two users simultaneously attempted to book the same time slot. This happened on **March 6, 2026** with the following duplicate bookings:

**Booking Details:**

- Customer: Lili Orrin
- Tour: Mossy Forest Land Rover Memories
- Date/Time: Apr 5, 2026 — 8:00 AM
- Amount: RM 52 each
- **Issue**: Two identical bookings created, but only one payment processed

## Root Cause

The booking creation flow had a **check-then-act** race condition:

```
Thread A                          Thread B
---------                         ---------
1. Check availability (0 booked)
                                  2. Check availability (0 booked)
3. Availability: OK (0 < capacity)
                                  4. Availability: OK (0 < capacity)
5. Create booking
                                  6. Create booking
7. Update slot count (0 → 1)
                                  8. Update slot count (1 → 2) ❌ DOUBLE BOOKED
```

The gap between checking availability and updating the slot count allowed both requests to:

1. Read `bookedCount = 0`
2. Pass availability validation
3. Create booking documents
4. Both increment the count

## Solution

Implemented **atomic slot reservation** using MongoDB's `findOneAndUpdate` with conditional checks:

### New Flow

```
Thread A                          Thread B
---------                         ---------
1. Atomic reserve slot
   (check + update in one op)
   ✅ Success: 0 → 1
                                  2. Atomic reserve slot
                                     (check + update in one op)
                                     ❌ Failed: bookedCount changed
3. Create booking
                                  4. Return error: "Slot just booked"
5. ✅ Complete
```

### Key Changes

1. **New Method**: `TimeSlotService.checkAndReserveSlot()`
   - Combines availability check + slot reservation
   - Uses MongoDB's atomic `findOneAndUpdate`
   - Includes optimistic locking (checks current `bookedCount` hasn't changed)

2. **Updated Booking Flow**:
   - Reserve slot FIRST (atomic operation)
   - Then create booking document
   - If booking fails, rollback slot reservation
   - Update package `bookedCount` last

3. **Applied To**:
   - `BookingService.createBookingDirect()` - Main booking creation
   - `CartBookingService.bookCartItems()` - Cart checkout flow

## Technical Implementation

### Atomic Reservation Code

```typescript
const updateQuery = {
  packageType,
  packageId,
  date,
  [`slots.${slotIndex}.bookedCount`]: currentBookedCount, // ✅ Lock check
};

const updateOperation = {
  $set: {
    [`slots.${slotIndex}.bookedCount`]: newBookedCount,
    [`slots.${slotIndex}.minimumPerson`]: newMinimumPerson,
  },
};

const result = await TimeSlot.findOneAndUpdate(
  updateQuery, // Only update if bookedCount hasn't changed
  updateOperation, // Increment count atomically
  { new: true },
);

if (!result) {
  // Another request modified the slot between our read and update
  return { success: false, reason: "Slot just booked by another request" };
}
```

### Rollback Mechanism

If booking creation fails after slot reservation:

```typescript
try {
  savedBooking = await booking.save();
} catch (bookingError) {
  // Rollback the atomic reservation
  await TimeSlotService.updateSlotBooking(
    packageType,
    packageId,
    date,
    time,
    requestedPersons,
    "subtract", // Release the reserved slot
  );
  throw bookingError;
}
```

## Testing Verification

To verify the fix works:

1. **Concurrent Booking Test**: Two simultaneous requests for same slot
   - Expected: One succeeds, one gets "Slot just booked by another request"

2. **Logs to Monitor**:

   ```
   🔒 ATOMIC RESERVATION ATTEMPT
   ✅ ATOMIC RESERVATION SUCCESS
   ⚠️ ATOMIC RESERVATION FAILED - Slot was modified
   ```

3. **Database Check**: After concurrent bookings
   - Only ONE booking should exist
   - `bookedCount` should equal actual bookings

## Files Modified

- `server/src/services/timeSlot.service.ts`
  - Added `checkAndReserveSlot()` method
  - Kept original `checkAvailability()` for read-only checks

- `server/src/services/booking.service.ts`
  - Updated `createBookingDirect()` to use atomic reservation
  - Added rollback on booking creation failure

- `server/src/services/cartBooking.service.ts`
  - Updated `bookCartItems()` to use atomic reservation
  - Added rollback mechanism

## Deployment Notes

1. **No Database Migration Needed**: Uses existing schema
2. **Backward Compatible**: Old `checkAvailability()` still available
3. **Performance Impact**: Minimal - one additional DB query
4. **Monitoring**: Watch for "ATOMIC RESERVATION FAILED" logs

## Related Issues

- Previous fix attempt: `BOOKING_DATE_FIX.md`
- This fix addresses the **core concurrency issue** not solved by previous attempts

## Date Fixed

March 7, 2026
