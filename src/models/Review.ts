import { Schema, model, Document, Types } from "mongoose";

export interface ReviewType extends Document {
  packageId: Types.ObjectId;
  packageType: "tour" | "transfer";
  userId: Types.ObjectId;
  userName: string;
  userEmail: string;
  rating: number; // 1-5 stars
  comment: string;
  images?: string[]; // Optional array of image URLs (max 3)
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<ReviewType>(
  {
    packageId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    packageType: {
      type: String,
      enum: ["tour", "transfer"],
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: function(v: string[]) {
          return v.length <= 3; // Max 3 images
        },
        message: 'A review can have a maximum of 3 images'
      }
    },
  },
  { timestamps: true }
);

// Compound unique index to ensure one review per user per package
ReviewSchema.index(
  { userId: 1, packageId: 1, packageType: 1 },
  { unique: true }
);

// Index for fetching reviews by package
ReviewSchema.index({ packageId: 1, packageType: 1, createdAt: -1 });

export default model<ReviewType>("Review", ReviewSchema);
