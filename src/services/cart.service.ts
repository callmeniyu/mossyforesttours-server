import Cart, { ICart, ICartItem } from '../models/Cart';
import User from '../models/User';
import Tour from '../models/Tour';
import Transfer from '../models/Transfer';
import { parseDateAsMalaysiaTimezone } from '../utils/dateUtils';
import mongoose from 'mongoose';

export class CartService {
  // Get or create cart for user with caching optimization
  async getCart(userEmail: string): Promise<ICart> {
    try {
      // Find user by email
      let user: any = await User.findOne({ email: userEmail }).select('_id name email');
      if (!user) {
        // Auto-create minimal user record if it doesn't exist (helps when auth provider created session but no local user doc)
        const localPart = (userEmail && userEmail.split('@')?.[0]) || 'guest';
        const defaultName = localPart.length >= 2 ? localPart : `guest${Date.now()}`;
        try {
          user = await User.create({ email: userEmail, name: defaultName });
        } catch (createErr) {
          console.error('Failed to auto-create user:', createErr);
          throw new Error('User not found');
        }
      }

      // Find or create cart
      let cart = await Cart.findOne({ userId: user._id });

      if (!cart) {
        cart = new Cart({
          userId: user._id,
          items: [],
          totalAmount: 0
        });
        await cart.save();
      }

      return cart;
    } catch (error) {
      console.error('Error getting cart:', error);
      throw error;
    }
  }

  // Add item to cart with optimization
  async addToCart(userEmail: string, item: {
    packageId: string;
    packageType: 'tour' | 'transfer';
    selectedDate: string;
    selectedTime: string;
    adults: number;
    children: number;
    pickupLocation?: string;
  }): Promise<ICart> {
    try {
      const cart = await this.getCart(userEmail);

      // Get package details with minimal fields for performance
      let packageDoc: any;
      const selectFields = 'title image images newPrice price type vehicle seatCapacity';

      if (item.packageType === 'tour') {
        packageDoc = await Tour.findById(item.packageId).select(selectFields).lean();
      } else {
        packageDoc = await Transfer.findById(item.packageId).select(selectFields).lean();
      }

      if (!packageDoc) {
        throw new Error('Package not found');
      }

      // Calculate total price
      const packagePrice = packageDoc.newPrice || packageDoc.price || 0;
      const totalPrice = (item.adults + item.children) * packagePrice;

      // Create cart item
      const cartItem: ICartItem = {
        packageId: new mongoose.Types.ObjectId(item.packageId),
        packageType: item.packageType,
        packageTitle: packageDoc.title,
        packageImage: packageDoc.images?.[0] || packageDoc.image || '',
        packagePrice: packagePrice,
        selectedDate: parseDateAsMalaysiaTimezone(item.selectedDate), // Parse as Malaysia timezone to avoid off-by-one errors
        selectedTime: item.selectedTime,
        adults: item.adults,
        children: item.children,
        pickupLocation: item.pickupLocation || '',
        totalPrice: totalPrice,
        addedAt: new Date(),
        // Add vehicle information for private transfers
        isVehicleBooking: item.packageType === 'transfer' && packageDoc.type === 'Private',
        vehicleName: item.packageType === 'transfer' && packageDoc.type === 'Private' ? packageDoc.vehicle : undefined,
        vehicleSeatCapacity: item.packageType === 'transfer' && packageDoc.type === 'Private' ? packageDoc.seatCapacity : undefined
      };

      // Check if item already exists (same package, date, time)
      const existingItemIndex = cart.items.findIndex((cartItem: ICartItem) =>
        cartItem.packageId.toString() === item.packageId &&
        cartItem.selectedDate.toDateString() === parseDateAsMalaysiaTimezone(item.selectedDate).toDateString() &&
        cartItem.selectedTime === item.selectedTime
      );

      if (existingItemIndex > -1) {
        // Update existing item (merge quantities)
        const existingItem = cart.items[existingItemIndex];
        existingItem.adults = item.adults;
        existingItem.children = item.children;
        existingItem.totalPrice = totalPrice;
        existingItem.pickupLocation = item.pickupLocation || existingItem.pickupLocation;
        existingItem.addedAt = new Date(); // Update timestamp
      } else {
        // Add new item
        cart.items.push(cartItem);
      }

      await cart.save();

      return cart;
    } catch (error) {
      console.error('Error adding to cart:', error);
      throw error;
    }
  }

  // Update cart item
  async updateCartItem(userEmail: string, itemId: string, updates: {
    adults?: number;
    children?: number;
    selectedDate?: string;
    selectedTime?: string;
    pickupLocation?: string;
  }): Promise<ICart> {
    try {
      const cart = await this.getCart(userEmail);

      const item = cart.items.find(item => item._id?.toString() === itemId);
      if (!item) {
        throw new Error('Cart item not found');
      }

      // Update fields
      if (updates.adults !== undefined) item.adults = updates.adults;
      if (updates.children !== undefined) item.children = updates.children;
      if (updates.selectedDate) item.selectedDate = parseDateAsMalaysiaTimezone(updates.selectedDate);
      if (updates.selectedTime) item.selectedTime = updates.selectedTime;
      if (updates.pickupLocation !== undefined) item.pickupLocation = updates.pickupLocation;

      // Recalculate total price
      item.totalPrice = (item.adults + item.children) * item.packagePrice;

      await cart.save();
      return cart;
    } catch (error) {
      console.error('Error updating cart item:', error);
      throw error;
    }
  }

  // Remove item from cart
  async removeFromCart(userEmail: string, itemId: string): Promise<ICart> {
    try {
      const cart = await this.getCart(userEmail);

      // Remove item by _id
      // Remove the item from the cart
      cart.items = cart.items.filter((item: ICartItem) => item._id?.toString() !== itemId);

      await cart.save();
      return cart;
    } catch (error) {
      console.error('Error removing from cart:', error);
      throw error;
    }
  }

  // Clear entire cart
  async clearCart(userEmail: string): Promise<ICart> {
    try {
      const cart = await this.getCart(userEmail);
      cart.items = [];
      await cart.save();
      return cart;
    } catch (error) {
      console.error('Error clearing cart:', error);
      throw error;
    }
  }

  // Get cart item count
  async getCartItemCount(userEmail: string): Promise<number> {
    try {
      const cart = await this.getCart(userEmail);
      return cart.items.length;
    } catch (error) {
      console.error('Error getting cart item count:', error);
      return 0;
    }
  }

  // Get cart with populated package details
  async getCartWithDetails(userEmail: string): Promise<any> {
    try {
      const cart = await this.getCart(userEmail);

      // Manually populate package details
      const populatedItems = await Promise.all(
        cart.items.map(async (item: ICartItem) => {
          let packageDetails = null;

          if (item.packageType === 'tour') {
            packageDetails = await Tour.findById(item.packageId).select('title image newPrice oldPrice slug duration');
          } else {
            packageDetails = await Transfer.findById(item.packageId).select('title image newPrice oldPrice slug duration');
          }

          return {
            ...(item as any).toObject ? (item as any).toObject() : item,
            packageDetails: packageDetails ? {
              title: packageDetails.title,
              image: (packageDetails as any).image || '',
              price: (packageDetails as any).newPrice || (packageDetails as any).oldPrice || 0,
              slug: (packageDetails as any).slug,
              duration: (packageDetails as any).duration,
            } : null
          };
        })
      );

      return {
        ...(cart as any).toObject ? (cart as any).toObject() : cart,
        items: populatedItems
      };
    } catch (error) {
      console.error('Error getting cart with details:', error);
      throw error;
    }
  }
}

export const cartService = new CartService();
