import '../src/config/env'; // Load environment variables first
import '../src/models'; // Register all models with Mongoose
import app from '../src/app';
import connectDB from '../src/config/db';

// Ensure MongoDB connection for serverless function
let isConnected = false;

async function ensureDbConnection() {
  if (!isConnected) {
    await connectDB();
    isConnected = true;
  }
}

// Vercel serverless function handler
export default async function handler(req: any, res: any) {
  try {
    // Ensure database is connected before handling request
    await ensureDbConnection();
    
    // Handle the request with Express app
    return app(req, res);
  } catch (error) {
    console.error('Error in serverless handler:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
