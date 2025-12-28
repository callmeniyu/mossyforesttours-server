import { Router } from "express";
import {
  createReview,
  getReviews,
  checkUserReview,
  deleteReview,
  getAllReviews,
  getPackagesWithReviews,
} from "../controllers/review.controller";

const router = Router();

// Create a new review (requires authentication on client-side)
router.post("/", createReview);

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
