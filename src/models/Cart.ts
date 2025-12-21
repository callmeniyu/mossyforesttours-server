import mongoose, { Schema, Document } from 'mongoose';

// Interface for cart item
export interface ICartItem {
  _id?: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  packageType: 'tour' | 'transfer';
  packageTitle: string;
  packageImage: string;
  packagePrice: number;
  selectedDate: Date;
  selectedTime: string;
  adults: number;
  children: number;
  pickupLocation?: string;
  totalPrice: number;
  addedAt: Date;
  // Private transfer vehicle details
  isVehicleBooking?: boolean;
  vehicleName?: string;
  vehicleSeatCapacity?: number;
}

// Interface for cart document
export interface ICart extends Document {
  userId: mongoose.Types.ObjectId;
  items: ICartItem[];
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Cart item subdocument schema
const CartItemSchema = new Schema<ICartItem>({
  packageId: {
    type: Schema.Types.ObjectId,
    required: true,
    refPath: 'packageType'
  },
  packageType: {
    type: String,
    enum: ['tour', 'transfer'],
    required: true
  },
  packageTitle: {
    type: String,
    required: true
  },
  packageImage: {
    type: String,
    required: true
  },
  packagePrice: {
    type: Number,
    required: true,
    min: 0
  },
  selectedDate: {
    type: Date,
    required: true
  },
  selectedTime: {
    type: String,
    required: true
  },
  adults: {
    type: Number,
    required: true,
    min: 1,
    max: 20
  },
  children: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },
  pickupLocation: {
    type: String,
    default: ''
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  // Private transfer vehicle details
  isVehicleBooking: {
    type: Boolean,
    default: false
  },
  vehicleName: {
    type: String
  },
  vehicleSeatCapacity: {
    type: Number
  }
}, { _id: true });

// Main cart schema
const CartSchema = new Schema<ICart>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [CartItemSchema],
  totalAmount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Indexes for performance
CartSchema.index({ userId: 1 });
CartSchema.index({ 'items.packageId': 1 });
CartSchema.index({ createdAt: -1 });

// Pre-save middleware to calculate total amount
CartSchema.pre('save', function() {
  this.totalAmount = this.items.reduce((total, item) => total + item.totalPrice, 0);
});

// Instance methods
CartSchema.methods.addItem = function(item: ICartItem) {
  // Check if item already exists (same package, date, time)
  const existingItemIndex = this.items.findIndex((cartItem: ICartItem) => 
    cartItem.packageId.toString() === item.packageId.toString() &&
    cartItem.selectedDate.toDateString() === item.selectedDate.toDateString() &&
    cartItem.selectedTime === item.selectedTime
  );

  if (existingItemIndex > -1) {
    // Update existing item
    this.items[existingItemIndex] = item;
  } else {
    // Add new item
    this.items.push(item);
  }
  
  return this.save();
};

CartSchema.methods.removeItem = function(itemId: string) {
  this.items.id(itemId).deleteOne();
  return this.save();
};

CartSchema.methods.updateItem = function(itemId: string, updates: Partial<ICartItem>) {
  const item = this.items.id(itemId);
  if (item) {
    Object.assign(item, updates);
    // Recalculate total price for the item
    if (updates.adults !== undefined || updates.children !== undefined || updates.packagePrice !== undefined) {
      const adults = updates.adults !== undefined ? updates.adults : item.adults;
      const children = updates.children !== undefined ? updates.children : item.children;
      const price = updates.packagePrice !== undefined ? updates.packagePrice : item.packagePrice;
      item.totalPrice = (adults + children) * price;
    }
  }
  return this.save();
};

CartSchema.methods.clearCart = function() {
  this.items = [];
  return this.save();
};

CartSchema.methods.getItemCount = function() {
  return this.items.length;
};

const CartModel = mongoose.models.Cart ? (mongoose.models.Cart as mongoose.Model<ICart>) : mongoose.model<ICart>('Cart', CartSchema);
export default CartModel;
