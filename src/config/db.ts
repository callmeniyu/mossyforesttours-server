import mongoose from "mongoose"
import { env } from "./env"

const connectDB = async () => {
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

        await mongoose.connect(connectionUri, options)
        console.log("MongoDB Connected with optimized settings")
    } catch (error) {
        console.error("MongoDB Connection Error:", error)
        process.exit(1)
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
