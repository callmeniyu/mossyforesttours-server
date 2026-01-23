import { Schema, model, Document, Types } from "mongoose"
import { FAQType } from "./common"

export interface TransferDetails {
    about: string
    itinerary: string
    pickupOption: "admin" | "user"
    pickupLocations: string
    dropOffLocations?: string
    pickupGuidelines?: string
    note?: string
    faq: Types.DocumentArray<FAQType>
}

export interface TransferType extends Document {
    title: string
    slug: string
    image: string
    tags: string[]
    desc: string
    type: "Van" | "Van + Ferry" | "Private"
    vehicle?: string // Vehicle name for private transfers
    packageType: "transfer"
    duration: string
    status: "active" | "sold"
    bookedCount: number
    rating?: number  // Average rating out of 5
    reviewCount?: number  // Number of actual user reviews
    adminReviewCount?: number  // Admin's predefined review count for display
    oldPrice: number
    newPrice: number
    childPrice: number
    minimumPerson: number
    maximumPerson?: number
    seatCapacity?: number
    times: string[] // e.g. ["08:00 AM","01:30 PM"]
    label?: "Recommended" | "Popular" | "Best Value" | "Best seller"
    from: string
    to: string
    details: TransferDetails
    isAvailable: boolean  // Toggle to enable/disable package booking
    lastSlotsGeneratedAt?: Date  // Track when slots were last generated
    createdAt: Date
    updatedAt: Date
}

const TransferSchema = new Schema<TransferType>(
    {
        title: { type: String, required: true },
        slug: { type: String, required: true, unique: true },
        image: String,
        tags: [String],
        desc: String,
        type: { type: String, enum: ["Van", "Van + Ferry", "Private"] },
        vehicle: { type: String }, // Vehicle name for private transfers
        packageType: { type: String, default: "transfer" },
        duration: String,
        status: { type: String, enum: ["active", "sold"], default: "active" },
        bookedCount: { type: Number, default: 0 },
        rating: { type: Number, default: 0 },
        reviewCount: { type: Number, default: 0 },
        adminReviewCount: { type: Number, default: 0 },
        oldPrice: Number,
        newPrice: Number,
        childPrice: Number,
        minimumPerson: Number,
        maximumPerson: Number,
    seatCapacity: Number,
        times: [String],
        label: { type: String, enum: ["Recommended", "Popular", "Best Value", "Best seller"], default: null },
        from: String,
        to: String,
        details: {
            about: String,
            itinerary: String,
            pickupOption: { type: String, enum: ["admin", "user"] },
            pickupLocations: String,
            dropOffLocations: String,
            pickupGuidelines: String,
            note: String,
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
TransferSchema.index({ slug: 1 }) // For slug-based lookups
TransferSchema.index({ type: 1 }) // For type filtering
TransferSchema.index({ status: 1 }) // For status filtering
TransferSchema.index({ createdAt: -1 }) // For sorting by creation date

import mongoose from 'mongoose';
const TransferModel = mongoose.models.Transfer ? (mongoose.models.Transfer as mongoose.Model<TransferType>) : model<TransferType>("Transfer", TransferSchema);
export default TransferModel;
