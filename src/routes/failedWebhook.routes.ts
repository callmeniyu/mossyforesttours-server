import express from 'express';
import { FailedWebhookController } from '../controllers/failedWebhook.controller';

const router = express.Router();

// Admin endpoints to manage failed webhook events
router.get('/failed-webhooks', FailedWebhookController.getFailedWebhooks);
router.get('/failed-webhooks/:id', FailedWebhookController.getFailedWebhook);
router.post('/failed-webhooks/:id/retry', FailedWebhookController.retryFailedWebhook);
router.post('/failed-webhooks/:id/resolve', FailedWebhookController.markResolved);

export default router;
