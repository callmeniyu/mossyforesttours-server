import './config/env'; // Load environment variables first
import express from "express"
import cors from "cors"
import morgan from "morgan"
import helmet from "helmet"
import webhookRoutes from "./routes/webhook.routes"
import tourRoutes from "./routes/tour.routes"
import transferRoutes from "./routes/transfer.routes"
import bookingRoutes from "./routes/booking.routes"
import blackoutDateRoutes from "./routes/blackoutDate.routes"
import blogRoutes from "./routes/blog.routes"
import uploadRoutes from "./routes/upload.routes"
import timeSlotRoutes from "./routes/timeSlot.routes"
import userRoutes from "./routes/user.routes"
import emailRoutes from "./routes/email.routes"
import vehicleRoutes from "./routes/vehicle.routes"
import rollingTimeslotRoutes from "./routes/rollingTimeslot.routes"
import paymentRoutes from "./routes/payment.routes"
import paymentDebugRoutes from "./routes/paymentDebug.routes"
import reviewRoutes from "./routes/review.routes"
import currencyRoutes from "./routes/currency.routes"
import { PaymentCleanupService } from "./services/paymentCleanup.service"

const app = express()

app.use(cors())
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}))
app.use(morgan("dev"))

// Stripe webhook needs raw body for signature verification. Mount webhook route with raw middleware.
app.use('/webhook', express.raw({ type: 'application/json' }), webhookRoutes);

// Regular JSON body parsing for other routes
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use("/api/tours", tourRoutes)
app.use("/api/transfers", transferRoutes)
app.use("/api/bookings", bookingRoutes)
app.use("/api/blackout-dates", blackoutDateRoutes)
app.use("/api/blogs", blogRoutes)
app.use("/api/upload", uploadRoutes)
console.log("🔗 Registering timeslots routes at /api/timeslots")
app.use("/api/timeslots", timeSlotRoutes)
app.use("/api/users", userRoutes)
app.use("/api/email", emailRoutes)
// Vehicle management for private transfers
app.use("/api/vehicles", vehicleRoutes)
// Rolling timeslot management
app.use("/api/rolling-timeslots", rollingTimeslotRoutes)
// Payment processing
app.use("/api/payments", paymentRoutes)
// Payment debugging
app.use("/api/payment-debug", paymentDebugRoutes)
// Review and rating system
app.use("/api/reviews", reviewRoutes)
// Currency exchange rates
app.use("/api/currency", currencyRoutes)

// Automatic payment cleanup disabled - can be triggered manually via API if needed
// Manual cleanup endpoint: POST /api/payment/cleanup-abandoned
// if (process.env.NODE_ENV !== 'test') {
//   PaymentCleanupService.startAutoCleanup(30, 15);
// }

export default app
