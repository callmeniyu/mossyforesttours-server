// src/config/env.ts
import { z } from "zod"
import { config } from "dotenv"

// Load environment variables from .env file
config()

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]),
    PORT: z.string().default("3001"),
    MONGO_URI: z.string(),
    JWT_SECRET: z.string(),
    CORS_ORIGIN: z.string(),
    CLOUDINARY_CLOUD_NAME: z.string(),
    CLOUDINARY_API_KEY: z.string(),
    CLOUDINARY_API_SECRET: z.string(),
    STRIPE_SECRET_KEY: z.string().optional(), // Optional for now to avoid breaking existing setup
    STRIPE_WEBHOOK_SECRET: z.string().optional(), // Optional for now
    COMMERCEPAY_MERCHANT_ID: z.string().optional(),
    COMMERCEPAY_USERNAME: z.string().optional(),
    COMMERCEPAY_PASSWORD: z.string().optional(),
    COMMERCEPAY_SECRET_KEY: z.string().optional(),
    COMMERCEPAY_API_KEY: z.string().optional(),
    COMMERCEPAY_API_BASE_URL: z.string().optional(),
})

// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
    console.error("❌ Invalid environment variables:", parsedEnv.error.format())
    throw new Error("Invalid environment configuration")
}

// Export type-safe environment variables
export const env = {
    NODE_ENV: parsedEnv.data.NODE_ENV,
    PORT: parsedEnv.data.PORT,
    MONGO_URI: parsedEnv.data.MONGO_URI,
    JWT_SECRET: parsedEnv.data.JWT_SECRET,
    CORS_ORIGIN: parsedEnv.data.CORS_ORIGIN,
    CLOUDINARY_CLOUD_NAME: parsedEnv.data.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: parsedEnv.data.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: parsedEnv.data.CLOUDINARY_API_SECRET,
    STRIPE_SECRET_KEY: parsedEnv.data.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: parsedEnv.data.STRIPE_WEBHOOK_SECRET,
}
