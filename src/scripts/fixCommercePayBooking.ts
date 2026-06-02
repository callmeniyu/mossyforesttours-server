import mongoose from 'mongoose';

interface ScriptParams {
  referenceCode: string;
  transactionNumber?: string;
  packageId: string;
  packageType: 'tour' | 'transfer';
  packageName?: string;
  date: string;
  time: string;
  adults: string;
  children: string;
  pickupLocation: string;
  customerName: string;
  customerEmail: string;
  phone?: string;
  whatsapp?: string;
  subtotal: string;
  total: string;
  currency?: string;
  paymentChannel?: string;
  updateSlots?: string;
  isVehicleBooking?: string;
  mongoUri?: string;
}

function parseArgs(): ScriptParams {
  const args = process.argv.slice(2);
  const params: any = {};

  args.forEach((arg) => {
    const [key, value] = arg.split('=');
    if (!key || value === undefined) return;
    params[key.replace(/^--/, '')] = value;
  });

  return params as ScriptParams;
}

function assertParam(name: keyof ScriptParams, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required parameter --${name}`);
  }
}

function parseBoolean(value?: string): boolean {
  return value === 'true' || value === '1';
}

async function main() {
  const params = parseArgs();

  assertParam('referenceCode', params.referenceCode);
  assertParam('packageId', params.packageId);
  assertParam('packageType', params.packageType);
  assertParam('date', params.date);
  assertParam('time', params.time);
  assertParam('adults', params.adults);
  assertParam('children', params.children);
  assertParam('pickupLocation', params.pickupLocation);
  assertParam('customerName', params.customerName);
  assertParam('customerEmail', params.customerEmail);
  assertParam('subtotal', params.subtotal);
  assertParam('total', params.total);

  const mongoUri = params.mongoUri || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('Missing MongoDB connection URI. Provide --mongoUri or set MONGO_URI.');
  }

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 60000,
    socketTimeoutMS: 75000,
    family: 4,
    connectTimeoutMS: 60000,
  });

  const referenceCode = params.referenceCode;
  const transactionNumber = params.transactionNumber || 'UNKNOWN';
  const packageId = new mongoose.Types.ObjectId(params.packageId);
  const packageType = params.packageType;
  const date = new Date(params.date);
  const time = params.time;
  const adults = Number(params.adults);
  const children = Number(params.children);
  const subtotal = Number(params.subtotal);
  const total = Number(params.total);
  const currency = params.currency || 'MYR';
  const paymentChannel = params.paymentChannel || 'commercepay';
  const shouldUpdateSlots = parseBoolean(params.updateSlots);
  const isVehicleBooking = parseBoolean(params.isVehicleBooking);
  const totalGuests = isVehicleBooking ? 1 : adults + children;

  const db = mongoose.connection.db;
  const bookingCollection = db.collection('bookings');

  const existingBooking = await bookingCollection.findOne({
    'paymentInfo.commercePayReferenceCode': referenceCode,
  });

  if (existingBooking) {
    console.log(`Found existing booking ${existingBooking._id} for reference ${referenceCode}`);
    await bookingCollection.updateOne(
      { _id: existingBooking._id },
      {
        $set: {
          status: 'confirmed',
          bookingStatus: 'confirmed',
          'paymentInfo.paymentStatus': 'succeeded',
          'paymentInfo.amount': total,
          'paymentInfo.currency': currency,
          'paymentInfo.paymentChannel': paymentChannel,
          'paymentInfo.commercePayTransactionNumber': transactionNumber,
          'paymentInfo.paymentCompletedAt': new Date(),
          'paymentInfo.verifiedAt': new Date(),
        },
      }
    );

    if (shouldUpdateSlots) {
      await updateTimeslotCount(db, packageType, packageId, date, time, totalGuests);
    }

    console.log('Booking updated successfully.');
    process.exit(0);
  }

  const bookingDoc: any = {
    packageType,
    packageId,
    date,
    time,
    adults,
    children,
    pickupLocation: params.pickupLocation,
    contactInfo: {
      name: params.customerName,
      email: params.customerEmail,
      phone: params.phone || '',
      whatsapp: params.whatsapp || params.phone || '',
    },
    subtotal,
    total,
    status: 'confirmed',
    bookingStatus: 'confirmed',
    paymentInfo: {
      paymentStatus: 'succeeded',
      amount: total,
      bankCharge: total - subtotal,
      currency,
      paymentGateway: 'commercepay',
      commercePayReferenceCode: referenceCode,
      commercePayTransactionNumber: transactionNumber,
      paymentCompletedAt: new Date(),
      verifiedAt: new Date(),
    },
    packageName: params.packageName || 'Tour Booking',
    customerName: params.customerName,
    customerEmail: params.customerEmail,
    isVehicleBooking,
    confirmationEmailSent: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const insertResult = await bookingCollection.insertOne(bookingDoc);
  console.log(`Created booking ${insertResult.insertedId} for ${params.customerName}`);

  if (shouldUpdateSlots) {
    await updateTimeslotCount(db, packageType, packageId, date, time, totalGuests);
  }

  process.exit(0);
}

async function updateTimeslotCount(db: any, packageType: string, packageId: mongoose.Types.ObjectId, date: Date, time: string, guests: number) {
  const timeslotCollection = db.collection('timeslots');
  const dateString = date.toISOString().split('T')[0];
  const timeSlot = await timeslotCollection.findOne({
    packageType,
    packageId,
    date: new Date(dateString),
  });

  if (!timeSlot) {
    console.warn('Time slot document not found, skipping slot count update');
    return;
  }

  const slotIndex = (timeSlot.slots || []).findIndex((s: any) => s.time === time);
  if (slotIndex === -1) {
    console.warn('Time slot entry not found for the specified time, skipping slot count update');
    return;
  }

  const currentBookingCount = timeSlot.slots[slotIndex].bookingCount || 0;
  const slotCapacity = timeSlot.slots[slotIndex].capacity || 0;
  const newCount = currentBookingCount + guests;

  await timeslotCollection.updateOne(
    { _id: timeSlot._id, 'slots.time': time },
    {
      $inc: { 'slots.$.bookingCount': guests, booked: guests },
      $set: { 'slots.$.isAvailable': newCount < slotCapacity },
    }
  );

  console.log('Updated time slot booking count and availability');
}

main().catch((error) => {
  console.error('Failed to fix CommercePay booking:', error);
  process.exit(1);
});
