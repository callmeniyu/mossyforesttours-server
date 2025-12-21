import { Schema, model, Document } from "mongoose";

export interface BlackoutDateType extends Document {
  date: Date;
  packageType: "tour" | "transfer";
  description?: string;
}

const BlackoutDateSchema = new Schema<BlackoutDateType>({
  date: { type: Date, required: true, unique: true },
  packageType: { type: String, enum: ["tour", "transfer"], required: true },
  description: { type: String, default: "" },
});

import mongoose from 'mongoose';
const BlackoutDate = mongoose.models.BlackoutDate ? (mongoose.models.BlackoutDate as mongoose.Model<BlackoutDateType>) : model<BlackoutDateType>("BlackoutDate", BlackoutDateSchema);

export default BlackoutDate;
