import mongoose from 'mongoose';

const FailedWebhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  eventType: { type: String, required: true },
  source: { type: String, required: true },
  paymentIntentId: String,
  customerEmail: String,
  amount: Number,
  currency: String,
  metadata: mongoose.Schema.Types.Mixed,
  errorMessage: String,
  errorStack: String,
  createdAt: { type: Date, default: Date.now },
  resolved: { type: Boolean, default: false },
  resolvedAt: Date,
  resolvedBy: String,
  notes: String
});

const FailedWebhookEventModel = mongoose.models.FailedWebhookEvent 
  ? (mongoose.models.FailedWebhookEvent as mongoose.Model<any>) 
  : mongoose.model('FailedWebhookEvent', FailedWebhookEventSchema);

export default FailedWebhookEventModel;
