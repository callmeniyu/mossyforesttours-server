import './config/env'; // Load environment variables first
import './models'; // Register all models with Mongoose
import app from './app';
import connectDB from './config/db';
import reviewScheduler from './services/reviewScheduler.service';
import { TimeslotScheduler } from './jobs/timeslotScheduler';

const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || '10.22.11.50';

// Connect to MongoDB first
connectDB().then(() => {
    // Only start the server after successful database connection
    app.listen(PORT, () => {
        console.log(`Server running on http://${HOST}:${PORT}`);
        
        // Start the review email scheduler
        reviewScheduler.start();
        
        // Start the timeslot rolling window scheduler
        TimeslotScheduler.start();
    });
}).catch(error => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    reviewScheduler.stop();
    TimeslotScheduler.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    reviewScheduler.stop();
    TimeslotScheduler.stop();
    process.exit(0);
});