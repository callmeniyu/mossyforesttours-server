import { Router, Request, Response, NextFunction } from "express";
import {
  createReview,
  getReviews,
  checkUserReview,
  deleteReview,
  getAllReviews,
  getPackagesWithReviews,
} from "../controllers/review.controller";
import { uploadReviewImages } from "../middleware/upload";

const router = Router();

// Error handling middleware for multer errors
const handleMulterError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: "Image file too large. Please reduce the file size to under 5MB per image."
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      message: "Too many images. Maximum 3 images allowed per review."
    });
  }
  if (err.message === "Only image files are allowed!") {
    return res.status(400).json({
      success: false,
      message: "Invalid file type. Please upload only image files (JPG, PNG, WEBP)."
    });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: "Unexpected field name for file upload"
    });
  }
  next(err);
};

// Create a new review (requires authentication on client-side)
// Supports optional image uploads (max 3 images)
router.post("/", (req: Request, res: Response, next: NextFunction) => {
  uploadReviewImages(req, res, (err: any) => {
    if (err) {
      return handleMulterError(err, req, res, next);
    }
    next();
  });
}, createReview);

// Get packages with reviews (admin)
router.get("/admin/packages", getPackagesWithReviews);

// Get all reviews (admin) - Must be before /:packageType/:packageId
router.get("/admin/all", getAllReviews);

// Check if user has reviewed a package - Must be before /:packageType/:packageId
router.get("/check/:packageType/:packageId/:userEmail", checkUserReview);

// Get all reviews for a specific package
router.get("/:packageType/:packageId", getReviews);

// Delete a review (admin only)
router.delete("/:reviewId", deleteReview);

export default router;
