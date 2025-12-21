import mongoose from 'mongoose';

const WebhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  source: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const WebhookEventModel = mongoose.models.WebhookEvent ? (mongoose.models.WebhookEvent as mongoose.Model<any>) : mongoose.model('WebhookEvent', WebhookEventSchema);
export default WebhookEventModel;
