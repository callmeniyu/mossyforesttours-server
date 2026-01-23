import { Request, Response } from "express";
import Review from "../models/Review";
import Tour from "../models/Tour";
import Transfer from "../models/Transfer";
import User from "../models/User";
import { Types } from "mongoose";

// Create a new review
export async function createReview(req: Request, res: Response) {
  try {
    const { packageId, packageType, userName, userEmail, rating, comment } = req.body;

    // Validate required fields
    if (!packageId || !packageType || !userName || !userEmail || !rating || !comment) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Validate package type
    if (packageType !== "tour" && packageType !== "transfer") {
      return res.status(400).json({
        success: false,
        message: "Invalid package type",
      });
    }

    // Validate packageId format
    if (!Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package ID",
      });
    }

    // Find user by email
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user has already reviewed this package
    const existingReview = await Review.findOne({
      userId: user._id,
      packageId: new Types.ObjectId(packageId),
      packageType,
    });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this package",
      });
    }

    // Handle image uploads from multer
    const images: string[] = [];
    if (req.files && Array.isArray(req.files)) {
      // Multer stores uploaded files in req.files
      for (const file of req.files) {
        images.push((file as any).path); // Cloudinary URL is in file.path
      }
    }

    // Validate max 3 images
    if (images.length > 3) {
      return res.status(400).json({
        success: false,
        message: "Maximum 3 images allowed per review",
      });
    }

    // Create the review
    const review = new Review({
      packageId: new Types.ObjectId(packageId),
      packageType,
      userId: user._id,
      userName,
      userEmail,
      rating,
      comment,
      images: images.length > 0 ? images : undefined, // Only include if images exist
    });

    await review.save();

    // Update package rating and review count
    await updatePackageRating(packageId, packageType);

    return res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: review,
    });
  } catch (error: any) {
    console.error("Error creating review:", error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this package",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create review",
      error: error.message,
    });
  }
}

// Get all reviews for a package
export async function getReviews(req: Request, res: Response) {
  try {
    const { packageId, packageType } = req.params;

    // Validate package type
    if (packageType !== "tour" && packageType !== "transfer") {
      return res.status(400).json({
        success: false,
        message: "Invalid package type",
      });
    }

    const reviews = await Review.find({
      packageId: new Types.ObjectId(packageId),
      packageType,
    })
      .populate('userId', 'name image')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: reviews,
      count: reviews.length,
    });
  } catch (error: any) {
    console.error("Error fetching reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
}

// Check if user has reviewed a package
export async function checkUserReview(req: Request, res: Response) {
  try {
    const { packageId, packageType, userEmail } = req.params;

    // Validate packageId format
    if (!Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid package ID",
      });
    }

    // Find user by email
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(200).json({
        success: true,
        hasReviewed: false,
        review: null,
      });
    }

    const review = await Review.findOne({
      userId: user._id,
      packageId: new Types.ObjectId(packageId),
      packageType,
    });

    return res.status(200).json({
      success: true,
      hasReviewed: !!review,
      review: review || null,
    });
  } catch (error: any) {
    console.error("Error checking user review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check user review",
      error: error.message,
    });
  }
}

// Delete a review (admin only)
export async function deleteReview(req: Request, res: Response) {
  try {
    const { reviewId } = req.params;

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    const { packageId, packageType } = review;

    await Review.findByIdAndDelete(reviewId);

    // Update package rating and review count
    await updatePackageRating(packageId.toString(), packageType);

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete review",
      error: error.message,
    });
  }
}

// Get packages with reviews (admin only)
export async function getPackagesWithReviews(req: Request, res: Response) {
  try {
    const { packageType } = req.query;

    const filter: any = {};
    if (packageType && (packageType === "tour" || packageType === "transfer")) {
      filter.packageType = packageType;
    }

    // Get all reviews grouped by package
    const reviewsGrouped = await Review.aggregate([
      ...(Object.keys(filter).length > 0 ? [{ $match: filter }] : []),
      {
        $group: {
          _id: { packageId: "$packageId", packageType: "$packageType" },
          reviewCount: { $sum: 1 },
          averageRating: { $avg: "$rating" },
          latestReview: { $max: "$createdAt" },
        },
      },
      { $sort: { latestReview: -1 } },
    ]);

    // Fetch package details
    const packagesWithReviews = await Promise.all(
      reviewsGrouped.map(async (group) => {
        let packageInfo = null;
        
        if (group._id.packageType === "tour") {
          packageInfo = await Tour.findById(group._id.packageId)
            .select("title slug image")
            .lean();
        } else {
          packageInfo = await Transfer.findById(group._id.packageId)
            .select("title slug image")
            .lean();
        }

        return {
          packageId: group._id.packageId,
          packageType: group._id.packageType,
          reviewCount: group.reviewCount,
          averageRating: Math.round(group.averageRating * 10) / 10,
          latestReview: group.latestReview,
          package: packageInfo,
        };
      })
    );

    // Filter out packages that don't exist anymore
    const validPackages = packagesWithReviews.filter(p => p.package !== null);

    return res.status(200).json({
      success: true,
      data: validPackages,
      count: validPackages.length,
    });
  } catch (error: any) {
    console.error("Error fetching packages with reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch packages",
      error: error.message,
    });
  }
}

// Get all reviews (admin only)
export async function getAllReviews(req: Request, res: Response) {
  try {
    const { packageType } = req.query;

    const filter: any = {};
    if (packageType && (packageType === "tour" || packageType === "transfer")) {
      filter.packageType = packageType;
    }

    const reviews = await Review.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    // Group reviews by package
    const reviewsWithPackages = await Promise.all(
      reviews.map(async (review) => {
        let packageInfo = null;
        
        if (review.packageType === "tour") {
          packageInfo = await Tour.findById(review.packageId).select("title slug image").lean();
        } else {
          packageInfo = await Transfer.findById(review.packageId).select("title slug image").lean();
        }

        return {
          ...review,
          package: packageInfo,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: reviewsWithPackages,
      count: reviewsWithPackages.length,
    });
  } catch (error: any) {
    console.error("Error fetching all reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
}

// Helper function to update package rating and review count
async function updatePackageRating(packageId: string, packageType: string) {
  try {
    const reviews = await Review.find({
      packageId: new Types.ObjectId(packageId),
      packageType,
    });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews
      : 0;

    const roundedRating = Math.round(averageRating * 10) / 10;

    // Update only the rating, do NOT update reviewCount or adminReviewCount
    // Frontend fetches actual reviews dynamically and adds to admin's predefined count
    // reviewCount = admin's predefined value (set in admin panel)
    // adminReviewCount = new field for admin's predefined value (migration target)
    // Both should be preserved and never overwritten by this function
    if (packageType === "tour") {
      await Tour.findByIdAndUpdate(packageId, {
        rating: roundedRating,
        // Do NOT update reviewCount - it contains admin's predefined value
        // Do NOT update adminReviewCount - it's set by admin only
      });
    } else {
      await Transfer.findByIdAndUpdate(packageId, {
        rating: roundedRating,
        // Do NOT update reviewCount - it contains admin's predefined value
        // Do NOT update adminReviewCount - it's set by admin only
      });
    }
  } catch (error) {
    console.error("Error updating package rating:", error);
  }
}
