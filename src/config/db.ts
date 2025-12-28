import mongoose from "mongoose"
import { env } from "./env"

// Cache connection for serverless functions
let cached: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
} = {
    conn: null,
    promise: null
};

const connectDB = async () => {
    // If already connected, return cached connection
    if (cached.conn) {
        console.log('Using cached MongoDB connection');
        return cached.conn;
    }

    // If connection is in progress, return existing promise
    if (cached.promise) {
        console.log('MongoDB connection in progress, waiting...');
        cached.conn = await cached.promise;
        return cached.conn;
    }

    try {
        const options: mongoose.ConnectOptions = {
            maxPoolSize: 10, // Maintain up to 10 socket connections
            serverSelectionTimeoutMS: 60000, // Keep trying to send operations for 60 seconds (important for serverless)
            socketTimeoutMS: 75000, // Close sockets after 75 seconds of inactivity
            family: 4, // Use IPv4, skip trying IPv6
            connectTimeoutMS: 60000, // Give up initial connection after 60 seconds (important for serverless cold starts)
            retryWrites: true,
            retryReads: true,
            bufferCommands: false, // Disable mongoose buffering
            dbName: 'cameronhighlandstours', // Explicitly specify database name
        }

        // Add database name to URI if not present
        const connectionUri = env.MONGO_URI.includes('/?') 
            ? env.MONGO_URI.replace('/?', '/cameronhighlandstours?')
            : env.MONGO_URI + '/cameronhighlandstours'

        console.log('Connecting to MongoDB...');
        
        // Create new connection promise
        cached.promise = mongoose.connect(connectionUri, options);
        cached.conn = await cached.promise;
        
        console.log("MongoDB Connected with optimized settings for serverless");
        
        return cached.conn;
    } catch (error) {
        // Reset cache on error
        cached.promise = null;
        cached.conn = null;
        console.error("MongoDB Connection Error:", error)
        throw error;
    }
}

mongoose.connection.on("error", (err) => {
    console.error("MongoDB Error:", err)
})

// Handle connection events
mongoose.connection.on("connected", () => {
    console.log("MongoDB connected to database")
})

mongoose.connection.on("disconnected", () => {
    console.log("MongoDB disconnected")
})

export default connectDB
