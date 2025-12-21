import { Schema, model, Document } from "mongoose"

export interface VehicleType extends Document {
  name: string
  units: number // number of identical vehicles available
  seats: number // seats per vehicle
  createdAt: Date
  updatedAt: Date
}

const VehicleSchema = new Schema<VehicleType>(
  {
    name: { type: String, required: true, unique: true },
    units: { type: Number, required: true, default: 1 },
    seats: { type: Number, required: true, default: 4 },
  },
  { timestamps: true }
)

VehicleSchema.index({ name: 1 })

import mongoose from 'mongoose';
const VehicleModel = mongoose.models.Vehicle ? (mongoose.models.Vehicle as mongoose.Model<VehicleType>) : model<VehicleType>("Vehicle", VehicleSchema);
export default VehicleModel;
