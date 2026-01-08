import '../src/config/env'; // Load environment variables first
import '../src/models'; // Register all models with Mongoose
import app from '../src/app';
import connectDB from '../src/config/db';
import mongoose from 'mongoose';

// Vercel serverless function handler
export default async function handler(req: any, res: any) {
  try {
    // Always ensure database is connected (uses cached connection if available)
    // Check mongoose connection state: 0 = disconnected, 1 = connected
    if (mongoose.connection.readyState !== 1) {
      console.log('MongoDB not connected, connecting now...');
      await connectDB();
    } else {
      console.log('Using existing MongoDB connection');
    }
    
    // Handle the request with Express app
    return app(req, res);
  } catch (error) {
    console.error('Error in serverless handler:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
}
