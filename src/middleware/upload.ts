import multer from "multer"
import { v2 as cloudinary } from "cloudinary"
import { CloudinaryStorage } from "multer-storage-cloudinary"
import { Request, Response, NextFunction } from "express"
import { env } from "../config/env"

// Configure Cloudinary with validated environment variables
cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
})

// Configure Cloudinary storage for tours
const tourStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "oastel/tours", // Folder in Cloudinary
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [
            {
                width: 1200,
                height: 800,
                crop: "fill",
                quality: "auto:good",
            },
        ],
        public_id: (req: any, file: any) => {
            // Generate unique public ID
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
            return `tour-${uniqueSuffix}`
        },
    } as any,
})

// Configure Cloudinary storage for blogs
const blogStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "oastel/blogs", // Folder in Cloudinary
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [
            {
                width: 1200,
                height: 800,
                crop: "fill",
                quality: "auto:good",
            },
        ],
        public_id: (req: any, file: any) => {
            // Generate unique public ID
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
            return `blog-${uniqueSuffix}`
        },
    } as any,
})

// Configure Cloudinary storage for transfers
const transferStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "oastel/transfers", // Folder in Cloudinary
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [
            {
                width: 1200,
                height: 800,
                crop: "fill",
                quality: "auto:good",
            },
        ],
        public_id: (req: any, file: any) => {
            // Generate unique public ID
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
            return `transfer-${uniqueSuffix}`
        },
    } as any,
})

// Configure Cloudinary storage for review images
const reviewStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "oastel/reviews", // Folder in Cloudinary
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [
            {
                width: 800,
                height: 600,
                crop: "limit",
                quality: "auto:good",
            },
        ],
        public_id: (req: any, file: any) => {
            // Generate unique public ID
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
            return `review-${uniqueSuffix}`
        },
    } as any,
})

// File filter for images only
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype.startsWith("image/")) {
        cb(null, true)
    } else {
        cb(new Error("Only image files are allowed!"))
    }
}

// Configure multer with Cloudinary storage for tours
const tourUpload = multer({
    storage: tourStorage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
})

// Configure multer with Cloudinary storage for blogs
const blogUpload = multer({
    storage: blogStorage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
})

// Configure multer with Cloudinary storage for transfers
const transferUpload = multer({
    storage: transferStorage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
})

// Configure multer with Cloudinary storage for reviews (supports up to 3 images)
const reviewUpload = multer({
    storage: reviewStorage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit per file
    },
})

// No need for image processing middleware - Cloudinary handles it
export const processImage = async (req: Request, res: Response, next: NextFunction) => {
    // Cloudinary automatically processes images, so we just continue
    next()
}

// Delete image from Cloudinary
export const deleteOldImage = async (imagePath: string) => {
    try {
        if (imagePath && imagePath.includes("cloudinary.com")) {
            // Extract public_id from Cloudinary URL
            const urlParts = imagePath.split("/")
            const filename = urlParts[urlParts.length - 1]
            let publicId = ""

            // Determine folder based on URL path
            if (imagePath.includes("/tours/")) {
                publicId = `oastel/tours/${filename.split(".")[0]}`
            } else if (imagePath.includes("/blogs/")) {
                publicId = `oastel/blogs/${filename.split(".")[0]}`
            } else if (imagePath.includes("/transfers/")) {
                publicId = `oastel/transfers/${filename.split(".")[0]}`
            } else if (imagePath.includes("/reviews/")) {
                publicId = `oastel/reviews/${filename.split(".")[0]}`
            }

            if (publicId) {
                await cloudinary.uploader.destroy(publicId)
                console.log(`Deleted image from Cloudinary: ${publicId}`)
            }
        }
    } catch (error) {
        console.error("Error deleting image from Cloudinary:", error)
    }
}

export const uploadTourImage = tourUpload.single("image")
export const uploadBlogImage = blogUpload.single("image")
export const uploadTransferImage = transferUpload.single("image")
export const uploadReviewImages = reviewUpload.array("images", 3) // Max 3 images
