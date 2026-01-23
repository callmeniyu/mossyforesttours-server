/**
 * Migration Script: Migrate reviewCount to adminReviewCount
 * 
 * This script migrates existing tour and transfer data to separate
 * admin-defined review counts from actual user review counts.
 * 
 * What it does:
 * 1. Copies existing reviewCount to adminReviewCount (preserving admin's value)
 * 2. Recalculates reviewCount based on actual reviews in the database
 * 3. Updates both Tour and Transfer collections
 * 
 * Run: npx ts-node scripts/migrate-review-counts.ts
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";

// Load environment variables
config({ path: path.resolve(__dirname, "../.env") });

// Import models
import Tour from "../src/models/Tour";
import Transfer from "../src/models/Transfer";
import Review from "../src/models/Review";

async function migrateReviewCounts() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI or MONGODB_URI not found in environment variables");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // Migrate Tours
    console.log("=== Migrating Tours ===");
    const tours = await Tour.find({});
    console.log(`Found ${tours.length} tours to migrate`);

    for (const tour of tours) {
      const currentReviewCount = tour.reviewCount || 0;
      
      // Count actual reviews for this tour
      const actualReviews = await Review.countDocuments({
        packageId: tour._id,
        packageType: "tour",
      });

      // Set adminReviewCount to current value (admin's predefined count)
      // Set reviewCount to actual reviews from database
      await Tour.findByIdAndUpdate(tour._id, {
        adminReviewCount: currentReviewCount,
        reviewCount: actualReviews,
      });

      console.log(
        `✅ Tour: ${tour.title.substring(0, 40)}... | Admin: ${currentReviewCount} | Actual: ${actualReviews} | Total will be: ${currentReviewCount + actualReviews}`
      );
    }

    console.log("\n=== Migrating Transfers ===");
    const transfers = await Transfer.find({});
    console.log(`Found ${transfers.length} transfers to migrate`);

    for (const transfer of transfers) {
      const currentReviewCount = transfer.reviewCount || 0;
      
      // Count actual reviews for this transfer
      const actualReviews = await Review.countDocuments({
        packageId: transfer._id,
        packageType: "transfer",
      });

      // Set adminReviewCount to current value (admin's predefined count)
      // Set reviewCount to actual reviews from database
      await Transfer.findByIdAndUpdate(transfer._id, {
        adminReviewCount: currentReviewCount,
        reviewCount: actualReviews,
      });

      console.log(
        `✅ Transfer: ${transfer.title.substring(0, 40)}... | Admin: ${currentReviewCount} | Actual: ${actualReviews} | Total will be: ${currentReviewCount + actualReviews}`
      );
    }

    console.log("\n=== Migration Summary ===");
    console.log(`✅ Migrated ${tours.length} tours`);
    console.log(`✅ Migrated ${transfers.length} transfers`);
    console.log("\n✅ Migration completed successfully!");
    console.log("\nNote: The frontend will now show adminReviewCount + actual reviews as the total.");

  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n✅ Disconnected from MongoDB");
    process.exit(0);
  }
}

// Run migration
migrateReviewCounts();
