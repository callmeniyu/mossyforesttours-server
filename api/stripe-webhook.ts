import '../src/config/env';
import '../src/models'; // Register all models
import connectDB from '../src/config/db';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import { stripeWebhook } from '../src/controllers/stripeWebhook.controller';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Disable body parsing for Stripe webhook (we need raw body for signature verification)
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Ensure database is connected
    if (mongoose.connection.readyState !== 1) {
      console.log('MongoDB not connected, connecting now...');
      await connectDB();
    }

    // Read raw body as buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks);

    // Attach raw body to request for controller
    (req as any).body = rawBody;

    // Call the existing Express controller
    // Mock Express response methods
    const mockRes: any = {
      status: (code: number) => {
        res.status(code);
        return mockRes;
      },
      send: (data: any) => {
        res.send(data);
        return mockRes;
      },
      json: (data: any) => {
        res.json(data);
        return mockRes;
      },
    };

    await stripeWebhook(req as any, mockRes);
  } catch (error) {
    console.error('Error in Stripe webhook handler:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
