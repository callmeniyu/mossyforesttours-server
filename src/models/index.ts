// Import all models to ensure they are registered with Mongoose
// This file must be imported before any database operations

import './Tour';
import './Transfer';
import './TimeSlot';
import './Booking';
import './User';
import './Cart';
import './Blog';
import './Vehicle';
import './WebhookEvent';
import './FailedWebhookEvent';

console.log('✅ All models registered with Mongoose');

export {};
