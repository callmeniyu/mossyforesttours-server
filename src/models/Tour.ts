import { Schema, model, Document, Types } from "mongoose"
import { FAQType } from "./common"

export interface ItineraryItem {
    time: string
    activity: string
}

export interface TourDetails {
    about: string
    longDescription?: string
    itinerary: string  // Changed from ItineraryItem[] to string
    pickupLocations: string[]
    pickupGuidelines?: string
    notes: string[]
    includes: string[]
    faq: Types.DocumentArray<FAQType>
}

export interface TourType extends Document {
    title: string
    slug: string
    image: string
    tags: string[]
    description: string
    category?: string  // Nature, Scenic, Cultural, Family, etc.
    type: "co-tour" | "private"
    packageType: "tour"
    duration: string
    period: "Half-Day" | "Full-Day"
    status: "active" | "sold"
    bookedCount: number
    rating?: number  // Average rating out of 5
    reviewCount?: number  // Number of reviews
    oldPrice: number
    newPrice: number
    childPrice: number
    minimumPerson: number
    maximumPerson?: number
    vehicle?: string // Vehicle name for private tours
    seatCapacity?: number // Seat capacity for private tours (from vehicle)
    departureTimes: string[] // e.g. ["08:00 AM","01:30 PM"]
    label?: "Recommended" | "Popular" | "Best Value" | "Best Seller"
    details: TourDetails
    isAvailable: boolean  // Toggle to enable/disable package booking
    lastSlotsGeneratedAt?: Date  // Track when slots were last generated
    createdAt: Date
    updatedAt: Date
}

const TourSchema = new Schema<TourType>(
    {
        title: { type: String, required: true, index: true },
        slug: { type: String, required: true, unique: true },
        image: String,
        tags: [String],
        description: String,
        category: String,
        type: { type: String, enum: ["co-tour", "private"] },
        packageType: { type: String, default: "tour" },
        duration: String,
        period: { type: String, enum: ["Half-Day", "Full-Day"], required: true },
        status: { type: String, enum: ["active", "sold"], default: "active" },
        bookedCount: { type: Number, default: 0 },
        rating: { type: Number, default: 0 },
        reviewCount: { type: Number, default: 0 },
        oldPrice: Number,
        newPrice: Number,
        childPrice: Number,
        minimumPerson: Number,
        maximumPerson: Number,
        vehicle: String, // Vehicle name for private tours
        seatCapacity: Number, // Seat capacity for private tours (from vehicle)
        departureTimes: [String],
        label: { type: String, enum: ["Recommended", "Popular", "Best Value", "Best Seller"], default: null },
        details: {
            about: String,
            longDescription: String,
            itinerary: String,  // Changed from array to string
            pickupLocations: [String],
            pickupGuidelines: String,
            notes: [String],
            includes: [String],
            faq: [
                {
                    question: String,
                    answer: String,
                },
            ],
        },
        isAvailable: { type: Boolean, default: true }, // Toggle to enable/disable package booking
        lastSlotsGeneratedAt: { type: Date }, // Track when slots were last generated to date
    },
    { timestamps: true }
)

// Add database indexes for better query performance
TourSchema.index({ slug: 1 }) // For slug-based lookups
TourSchema.index({ type: 1 }) // For type filtering
TourSchema.index({ status: 1 }) // For status filtering
TourSchema.index({ createdAt: -1 }) // For sorting by creation date
TourSchema.index({ title: 1 }) // For title search

import mongoose from 'mongoose';
const TourModel = mongoose.models.Tour ? (mongoose.models.Tour as mongoose.Model<TourType>) : model<TourType>("Tour", TourSchema);
export default TourModel;
