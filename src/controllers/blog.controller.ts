import { Request, Response } from "express"
import BlogModel, { BlogType } from "../models/Blog"
import { generateSlug } from "../utils/generateSlug"

export const createBlog = async (req: Request, res: Response) => {
    try {
        const blogData = req.body

        // Generate slug if not provided
        if (!blogData.slug) {
            blogData.slug = generateSlug(blogData.title)
        }

        // Validate slug uniqueness
        const existingBlog = await BlogModel.findOne({ slug: blogData.slug })
        if (existingBlog) {
            return res.status(400).json({
                success: false,
                message: "A blog with this slug already exists",
            })
        }

        // Validate required fields
        const requiredFields = ["title", "description", "category", "image", "content", "publishDate"]
        for (const field of requiredFields) {
            if (!blogData[field]) {
                return res.status(400).json({
                    success: false,
                    message: `${field} is required`,
                })
            }
        }

        // Ensure views is a number
        if (!blogData.views) {
            blogData.views = 0
        }

        const blog = new BlogModel(blogData)
        const savedBlog = await blog.save()

        res.status(201).json({
            success: true,
            message: "Blog created successfully",
            data: savedBlog,
        })
    } catch (error: any) {
        console.error("Error creating blog:", error)

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: error.errors,
            })
        }

        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const getBlogs = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1
        const limit = parseInt(req.query.limit as string) || 10
        const category = req.query.category as string
        const sortBy = (req.query.sortBy as string) || "createdAt"
        const sortOrder = (req.query.sortOrder as string) || "desc"
        const featuredOnly = req.query.featured === "true"

        const skip = (page - 1) * limit
        const query: any = {}

        // Filter by category if provided
        if (category && category !== "all") {
            query.category = category
        }

        // Build sort object
        const sort: any = {}
        sort[sortBy] = sortOrder === "desc" ? -1 : 1

        // If requesting featured blogs only, ignore pagination and return top featured by rank
        if (featuredOnly) {
            const featured = await BlogModel.find({ featuredRank: { $gt: 0 } }).sort({ featuredRank: 1 }).limit(3)
            return res.json({ success: true, data: featured })
        }

        const blogs = await BlogModel.find(query).sort(sort).skip(skip).limit(limit)

        const total = await BlogModel.countDocuments(query)
        const totalPages = Math.ceil(total / limit)

        res.json({
            success: true,
            data: blogs,
            pagination: {
                page,
                limit,
                total,
                pages: totalPages,
            },
        })
    } catch (error) {
        console.error("Error fetching blogs:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const getBlogById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const blog = await BlogModel.findById(id)

        if (!blog) {
            return res.status(404).json({
                success: false,
                message: "Blog not found",
            })
        }

        res.json({
            success: true,
            data: blog,
        })
    } catch (error) {
        console.error("Error fetching blog:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const getBlogBySlug = async (req: Request, res: Response) => {
    try {
        const { slug } = req.params
        const blog = await BlogModel.findOne({ slug })

        if (!blog) {
            return res.status(404).json({
                success: false,
                message: "Blog not found",
            })
        }

        // Increment views
        blog.views += 1
        await blog.save()

        res.json({
            success: true,
            data: blog,
        })
    } catch (error) {
        console.error("Error fetching blog:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const updateBlog = async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const blogData = req.body

        // Check if blog exists
        const existingBlog = await BlogModel.findById(id)
        if (!existingBlog) {
            return res.status(404).json({
                success: false,
                message: "Blog not found",
            })
        }

        // Check slug uniqueness if slug is being updated
        if (blogData.slug && blogData.slug !== existingBlog.slug) {
            const duplicateBlog = await BlogModel.findOne({ slug: blogData.slug })
            if (duplicateBlog) {
                return res.status(400).json({
                    success: false,
                    message: "A blog with this slug already exists",
                })
            }
        }

        const updatedBlog = await BlogModel.findByIdAndUpdate(id, blogData, {
            new: true,
            runValidators: true,
        })

        res.json({
            success: true,
            message: "Blog updated successfully",
            data: updatedBlog,
        })
    } catch (error: any) {
        console.error("Error updating blog:", error)

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: error.errors,
            })
        }

        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const deleteBlog = async (req: Request, res: Response) => {
    try {
        const { id } = req.params

        const deletedBlog = await BlogModel.findByIdAndDelete(id)

        if (!deletedBlog) {
            return res.status(404).json({
                success: false,
                message: "Blog not found",
            })
        }

        res.json({
            success: true,
            message: "Blog deleted successfully",
        })
    } catch (error) {
        console.error("Error deleting blog:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const incrementBlogViews = async (req: Request, res: Response) => {
    try {
        const { id } = req.params

        const blog = await BlogModel.findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })

        if (!blog) {
            return res.status(404).json({
                success: false,
                message: "Blog not found",
            })
        }

        res.json({
            success: true,
            message: "Blog views updated",
            data: blog,
        })
    } catch (error) {
        console.error("Error updating blog views:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

// Set or unset featured rank for a blog. Body: { featuredRank: number }
export const setBlogFeature = async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { featuredRank } = req.body

        if (typeof featuredRank !== 'number' || featuredRank < 0 || featuredRank > 3) {
            return res.status(400).json({ success: false, message: 'featuredRank must be a number between 0 and 3' })
        }

        const blog = await BlogModel.findById(id)
        if (!blog) {
            return res.status(404).json({ success: false, message: 'Blog not found' })
        }

        // If setting to 0 -> unset feature for this blog
        if (featuredRank === 0) {
            blog.featuredRank = 0
            await blog.save()
            return res.json({ success: true, message: 'Blog unfeatured', data: blog })
        }

        // Ensure unique ranks: if another blog already has this rank, swap or set it to 0
        const existing = await BlogModel.findOne({ featuredRank })
        if (existing && (existing as any)._id.toString() !== id) {
            // Unset existing or swap ranks. We'll unset the existing to avoid collisions.
            (existing as any).featuredRank = 0
            await (existing as any).save()
        }

        blog.featuredRank = featuredRank
        await blog.save()

        // Ensure at most 3 featured blogs: if more than 3 exist, remove highest rank >3 (shouldn't happen)
        const featuredCount = await BlogModel.countDocuments({ featuredRank: { $gt: 0 } })
        if (featuredCount > 3) {
            // Remove extras by clearing the highest featuredRank entries beyond the first 3
            const extras = await BlogModel.find({ featuredRank: { $gt: 0 } }).sort({ featuredRank: 1 }).skip(3)
            for (const ex of extras) {
                (ex as any).featuredRank = 0
                await (ex as any).save()
            }
        }

        return res.json({ success: true, message: 'Blog featured updated', data: blog })
    } catch (error) {
        console.error('Error setting blog feature:', error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
}
