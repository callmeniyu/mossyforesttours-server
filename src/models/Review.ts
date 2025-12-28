import { Schema, model, Document, Types } from "mongoose";

export interface ReviewType extends Document {
  packageId: Types.ObjectId;
  packageType: "tour" | "transfer";
  userId: Types.ObjectId;
  userName: string;
  userEmail: string;
  rating: number; // 1-5 stars
  comment: string;
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
