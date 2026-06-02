import dotenv from "dotenv";
import mongoose from "mongoose";
import BookingModel from "../models/Booking";

dotenv.config();

interface Args {
  date: string;
  status?: string;
  packageType?: string;
  packageId?: string;
  mongoUri?: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const params: any = {};

  args.forEach((arg) => {
    if (!arg.includes("=")) {
      if (!params.date) {
        params.date = arg;
      }
      return;
    }
    const [rawKey, ...rest] = arg.split("=");
    const key = rawKey.replace(/^--/, "");
    params[key] = rest.join("=");
  });

  return params as Args;
}

function formatBooking(booking: any, index: number) {
  return [
    `\n=== Booking ${index + 1} ===`,
    `ID: ${booking._id}`,
    `Package: ${booking.packageId?._id || booking.packageId || "N/A"}${booking.packageId?.title ? ` (${booking.packageId.title})` : ""}`,
    `Type: ${booking.packageType || "N/A"}`,
    `Status: ${booking.status || "N/A"}`,
    `Date: ${booking.date?.toISOString() || booking.date || "N/A"}`,
    `Time: ${booking.time || "N/A"}`,
    `Contact: ${booking.contactInfo?.name || "N/A"} <${booking.contactInfo?.email || "N/A"}>`,
    `Adults: ${booking.adults ?? "N/A"}, Children: ${booking.children ?? "N/A"}`,
    booking.pickupLocation ? `Pickup: ${booking.pickupLocation}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDateRange(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    throw new Error("Date must be in YYYY-MM-DD format");
  }

  const startDate = new Date(Date.UTC(year, month - 1, day - 1, 16, 0, 0));
  const endDate = new Date(Date.UTC(year, month - 1, day, 16, 0, 0));

  return { startDate, endDate };
}

async function main() {
  const args = parseArgs();
  const date = args.date || process.env.BOOKING_DATE;
  if (!date) {
    console.error(
      "Usage: npx ts-node src/scripts/findBookingsByDate.ts YYYY-MM-DD [--status=confirmed] [--packageType=tour] [--packageId=...] [--mongoUri=...]",
    );
    process.exit(1);
  }

  const mongoUri =
    args.mongoUri || process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error(
      "Missing MongoDB URI. Set MONGO_URI or MONGODB_URI, or pass --mongoUri=...",
    );
    process.exit(1);
  }

  const { startDate, endDate } = buildDateRange(date);
  const filter: any = {
    date: {
      $gte: startDate,
      $lt: endDate,
    },
  };

  if (args.status) filter.status = args.status;
  if (args.packageType) filter.packageType = args.packageType;
  if (args.packageId)
    filter.packageId = new mongoose.Types.ObjectId(args.packageId);

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 30000,
    family: 4,
    connectTimeoutMS: 30000,
  });

  console.log(`Connected to MongoDB`);
  console.log(
    `Querying bookings for date ${date} (Malaysia timezone range ${startDate.toISOString()} to ${endDate.toISOString()})`,
  );
  if (args.status) console.log(`Filtering status=${args.status}`);
  if (args.packageType)
    console.log(`Filtering packageType=${args.packageType}`);
  if (args.packageId) console.log(`Filtering packageId=${args.packageId}`);

  const bookings = await BookingModel.find(filter).lean().exec();
  console.log(`\nFound ${bookings.length} bookings for ${date}`);

  bookings.forEach((booking, index) => {
    console.log(formatBooking(booking, index));
  });

  await mongoose.connection.close();
}

main().catch((error) => {
  console.error("Error fetching bookings:", error);
  process.exit(1);
});
