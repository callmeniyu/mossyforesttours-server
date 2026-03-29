import mongoose from "mongoose"
import dns from "node:dns"
import { env } from "./env"

// Cache connection for serverless functions
let cached: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
} = {
    conn: null,
    promise: null
};

// Workaround for environments where default DNS blocks SRV lookups (MongoDB Atlas)
const configureMongoDns = () => {
    try {
        const shouldUsePublicDns = env.MONGO_URI.startsWith('mongodb+srv://');
        if (!shouldUsePublicDns) return;

        const configuredServers = process.env.MONGO_DNS_SERVERS
            ? process.env.MONGO_DNS_SERVERS.split(',').map(s => s.trim()).filter(Boolean)
            : ['8.8.8.8', '1.1.1.1'];

        dns.setServers(configuredServers);
        console.log(`MongoDB DNS servers set to: ${configuredServers.join(', ')}`);
    } catch (error) {
        console.warn('Failed to set custom DNS servers for MongoDB:', error);
    }
};

const connectDB = async () => {
    configureMongoDns();

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

        // Add database name only when URI has no db path yet
        // Cases:
        // 1) mongodb+srv://.../?x=1 -> inject /cameronhighlandstours
        // 2) mongodb+srv://... (or mongodb://... with no path) -> append /cameronhighlandstours
        // 3) mongodb://.../existingDb?... -> keep as-is
        const hasNoDbButHasQuery = /\/\?/.test(env.MONGO_URI);
        const hasNoPathAtAll = /^mongodb(?:\+srv)?:\/\/[^/]+$/.test(env.MONGO_URI);

        const connectionUri = hasNoDbButHasQuery
            ? env.MONGO_URI.replace('/?', '/cameronhighlandstours?')
            : hasNoPathAtAll
                ? `${env.MONGO_URI}/cameronhighlandstours`
                : env.MONGO_URI

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
