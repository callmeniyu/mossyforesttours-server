import { Schema, model, Document, Types } from "mongoose"
import { z } from "zod"

// Zod schema for validation
export const userSchemaZod = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
})

export interface Address {
  whatsapp?: string
  phone?: string
  pickupAddresses?: string[]
}

export interface UserType extends Document {
  name: string
  email: string
  passwordHash?: string
  image?: string
  location?: string
  bio?: string
  address?: Address
  cartId?: Types.ObjectId         
  bookings: Types.ObjectId[]      
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<UserType>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String },
    image: { type: String },
    location: { type: String },
    bio: { type: String },
    address: {
      whatsapp: String,
      phone: String,
      pickupAddresses: [String],
    },
    cartId: { type: Schema.Types.ObjectId, ref: "Cart" },
    bookings: [{ type: Schema.Types.ObjectId, ref: "Booking" }],
  },
  { timestamps: true }
)

import mongoose from 'mongoose';
const UserModel = mongoose.models.User ? (mongoose.models.User as mongoose.Model<UserType>) : model<UserType>("User", UserSchema);
export default UserModel;
