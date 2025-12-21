import { Request, Response } from "express"
import { Types } from "mongoose"
import TransferModel, { TransferType } from "../models/Transfer"
import VehicleModel from "../models/Vehicle"
import { generateSlug } from "../utils/generateSlug"
import { TimeSlotService } from "../services/timeSlot.service"

export const createTransfer = async (req: Request, res: Response) => {
    try {
        const transferData = req.body
        // Debug: log incoming vehicle field to help trace missing vehicle issues
        console.log('createTransfer - incoming vehicle:', transferData?.vehicle)
        console.log('createTransfer - incoming keys:', Object.keys(transferData || {}))

        // Ensure packageType is always 'transfer'
        transferData.packageType = "transfer"

        // Generate slug if not provided
        if (!transferData.slug) {
            transferData.slug = generateSlug(transferData.title)
        }

        // Validate slug uniqueness
        const existingTransfer = await TransferModel.findOne({ slug: transferData.slug })
        if (existingTransfer) {
            return res.status(400).json({
                success: false,
                message: "A transfer with this slug already exists",
            })
        }

        // Filter out empty FAQ items
        if (transferData.details && transferData.details.faq) {
            transferData.details.faq = transferData.details.faq.filter(
                (faq: any) => faq.question.trim() && faq.answer.trim()
            )
        }

        // Handle label - convert "None" to null
        if (transferData.label === "None") {
            transferData.label = null
        }

        // Ensure vehicle field is preserved when provided by clients
        if (typeof transferData.vehicle === 'undefined' && transferData?.details?.vehicle) {
            transferData.vehicle = transferData.details.vehicle
        }
        // Normalize empty strings to undefined so mongoose doesn't store empty values
        if (transferData.vehicle === "") {
            console.log('createTransfer - vehicle was empty string, deleting it')
            delete transferData.vehicle
        } else if (transferData.vehicle) {
            console.log('createTransfer - vehicle field present:', transferData.vehicle)
        } else {
            console.log('createTransfer - vehicle field missing or undefined')
        }

        // Validate that Private transfers have a vehicle
        if (transferData.type === "Private" && (!transferData.vehicle || transferData.vehicle.trim() === "")) {
            return res.status(400).json({
                success: false,
                message: "Vehicle name is required for Private transfers",
            })
        }

        // For Private transfers, set minimumPerson to 1 (vehicle booking, not person-based)
        if (transferData.type === "Private") {
            transferData.minimumPerson = 1
        }

        const transfer = new TransferModel(transferData)
        const savedTransfer = await transfer.save()
        // Debug: log saved document vehicle to verify persistence
        try {
            console.log('createTransfer - savedTransfer.vehicle:', savedTransfer.vehicle)
            console.log('createTransfer - savedTransfer keys:', Object.keys(savedTransfer.toObject ? savedTransfer.toObject() : savedTransfer))
        } catch (err) {
            console.warn('createTransfer - failed to log savedTransfer details', err)
        }

        // Generate time slots for the transfer (90 days ahead)
        try {
            // Determine capacity based on transfer type
            let capacity
            if (transferData.type === "Private" && transferData.vehicle) {
                // For Private transfers: use vehicle.units (number of vehicles available)
                try {
                    const vehicleDoc = await VehicleModel.findOne({ name: transferData.vehicle }).lean()
                    if (vehicleDoc && typeof vehicleDoc.units === 'number') {
                        capacity = vehicleDoc.units
                    } else {
                        capacity = 1 // Default to 1 vehicle if vehicle not found
                    }
                } catch (err) {
                    console.warn('Failed to lookup vehicle for private transfer slot capacity, using default 1', err)
                    capacity = 1
                }
            } else {
                // For Non-Private transfers (Shared/Both): use maximumPerson (number of person seats)
                capacity = transferData.maximumPerson || 10
            }

            await TimeSlotService.generateSlotsForPackage(
                "transfer",
                savedTransfer._id as Types.ObjectId,
                transferData.times || [],
                capacity
            )
            console.log(`Time slots generated for transfer: ${savedTransfer._id}`)
        } catch (slotError) {
            console.error("Error generating time slots for transfer:", slotError)
            // Don't fail the transfer creation if slot generation fails
        }

        res.status(201).json({
            success: true,
            message: "Transfer created successfully",
            data: savedTransfer,
        })
    } catch (error: any) {
        console.error("Error creating transfer:", error)

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: error.errors,
            })
        }

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "A transfer with this slug already exists",
            })
        }

        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const getTransfers = async (req: Request, res: Response) => {
    try {
        const { page = 1, limit = 10, type, vehicle, search } = req.query

        const query: any = {}

        if (type && type !== "all") {
            query.type = type
        }

        if (vehicle) {
            query.vehicle = vehicle
        }

        if (search) {
            query.$or = [{ title: { $regex: search, $options: "i" } }, { desc: { $regex: search, $options: "i" } }]
        }

        const skip = (Number(page) - 1) * Number(limit)

        const transfers = await TransferModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean() // Use lean() for better performance

        const total = await TransferModel.countDocuments(query)

        res.json({
            success: true,
            data: transfers,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit)),
            },
        })
    } catch (error: any) {
        console.error("Error fetching transfers:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const getTransferById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const transfer = await TransferModel.findById(id).lean() // Use lean() for better performance

        if (!transfer) {
            return res.status(404).json({
                success: false,
                message: "Transfer not found",
            })
        }

        res.json({
            success: true,
            data: transfer,
        })
    } catch (error: any) {
        console.error("Error fetching transfer:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const getTransferBySlug = async (req: Request, res: Response) => {
    try {
        const { slug } = req.params
        const transfer = await TransferModel.findOne({ slug }).lean() // Use lean() for better performance

        // Debug: log FAQ count and a short sample to help diagnose production truncation issues
        try {
            if (transfer && transfer.details && Array.isArray(transfer.details.faq)) {
                console.log(`getTransferBySlug - slug=${slug} - faqCount=${transfer.details.faq.length}`)
                console.log(`getTransferBySlug - faqSample=`, transfer.details.faq.slice(0, 5))
            } else {
                console.log(`getTransferBySlug - slug=${slug} - no faqs present`)
            }
        } catch (logErr) {
            console.warn('getTransferBySlug - failed to log faq info', logErr)
        }

        if (!transfer) {
            return res.status(404).json({
                success: false,
                message: "Transfer not found",
            })
        }

        res.json({
            success: true,
            data: transfer,
        })
    } catch (error: any) {
        console.error("Error fetching transfer:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const getLastTransfer = async (req: Request, res: Response) => {
    try {
        const transfer = await TransferModel.findOne({}).sort({ createdAt: -1 }).lean()
        if (!transfer) {
            return res.status(404).json({ success: false, message: 'No transfers found' })
        }
        res.json({ success: true, data: transfer })
    } catch (error: any) {
        console.error('Error fetching last transfer:', error)
        res.status(500).json({ success: false, message: 'Internal server error' })
    }
}

export const updateTransfer = async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const transferData = req.body
        // Debug: log incoming vehicle field for update
        try {
            console.log('updateTransfer - incoming vehicle:', transferData?.vehicle)
            console.log('updateTransfer - incoming keys:', Object.keys(transferData || {}))
            // print snapshot of incoming transferData (safe stringify)
            console.log('updateTransfer - incoming snapshot:', JSON.stringify(transferData))
        } catch (err) {
            console.warn('updateTransfer - error logging incoming data', err)
        }

        // Get existing transfer to check if image changed
        const existingTransfer = await TransferModel.findById(id)
        if (!existingTransfer) {
            return res.status(404).json({
                success: false,
                message: "Transfer not found",
            })
        }

        // Ensure packageType is always 'transfer'
        transferData.packageType = "transfer"

        // Ensure vehicle field is preserved on update if provided (avoid accidental omission)
        if (typeof transferData.vehicle === 'undefined' && req.body.vehicle) {
            transferData.vehicle = req.body.vehicle
        }
        if (transferData.vehicle === "") {
            // allow clearing vehicle by sending null explicitly
            if (req.body.vehicle === "") {
                transferData.vehicle = null
            } else {
                delete transferData.vehicle
            }
        }

        // Validate that Private transfers have a vehicle
        if (transferData.type === "Private" && (!transferData.vehicle || transferData.vehicle.trim() === "")) {
            return res.status(400).json({
                success: false,
                message: "Vehicle name is required for Private transfers",
            })
        }

        // For Private transfers, set minimumPerson to 1 (vehicle booking, not person-based)
        if (transferData.type === "Private") {
            transferData.minimumPerson = 1
        }

        // Handle label - convert "None" to null
        if (transferData.label === "None") {
            transferData.label = null
        }

        // Filter out empty FAQ items
        if (transferData.details && transferData.details.faq) {
            transferData.details.faq = transferData.details.faq.filter(
                (faq: any) => faq.question.trim() && faq.answer.trim()
            )
        }

        // Note: With Cloudinary, we don't need to delete old images locally
        // Cloudinary handles storage and we can optionally clean up old images via their API

        // Ensure vehicle field is not accidentally omitted when updating
        // (transferData may or may not include vehicle; passing transferData as-is lets mongoose update provided fields)
        const transfer = await TransferModel.findByIdAndUpdate(id, transferData, { new: true, runValidators: true })
        try {
            console.log('updateTransfer - updated transfer vehicle:', transfer?.vehicle)
        } catch (err) {
            console.warn('updateTransfer - failed to log updated transfer', err)
        }

        if (!transfer) {
            return res.status(404).json({
                success: false,
                message: "Transfer not found",
            })
        }

        // Update time slots if times or capacity changed
        try {
            const times = transferData.times || existingTransfer.times
            // Determine capacity based on transfer type (same logic as creation)
            let capacity
            const transferType = transferData.type || existingTransfer.type
            const vehicleName = transferData.vehicle || existingTransfer.vehicle

            if (transferType === "Private" && vehicleName) {
                // For Private transfers: use vehicle.units (number of vehicles available)
                try {
                    const vehicleDoc = await VehicleModel.findOne({ name: vehicleName }).lean()
                    if (vehicleDoc && typeof vehicleDoc.units === 'number') {
                        capacity = vehicleDoc.units
                    } else {
                        capacity = 1 // Default to 1 vehicle if vehicle not found
                    }
                } catch (err) {
                    console.warn('Failed to lookup vehicle for private transfer update, using default 1', err)
                    capacity = 1
                }
            } else {
                // For Non-Private transfers (Shared/Both): use maximumPerson (number of person seats)
                capacity = transferData.maximumPerson || existingTransfer.maximumPerson || 10
            }

            // Calculate existing capacity to compare for changes
            let existingCapacity
            if (existingTransfer.type === "Private" && existingTransfer.vehicle) {
                try {
                    const vehicleDoc = await VehicleModel.findOne({ name: existingTransfer.vehicle }).lean()
                    existingCapacity = (vehicleDoc && typeof vehicleDoc.units === 'number') ? vehicleDoc.units : 1
                } catch (err) {
                    existingCapacity = 1
                }
            } else {
                existingCapacity = existingTransfer.maximumPerson || 10
            }

            if (JSON.stringify(times) !== JSON.stringify(existingTransfer.times) || capacity !== existingCapacity) {
                await TimeSlotService.updateSlotsForPackage(
                    "transfer",
                    transfer._id as Types.ObjectId,
                    times,
                    capacity
                )
                console.log(`Time slots updated for transfer: ${transfer._id}`)
            }
        } catch (slotError) {
            console.error("Error updating time slots for transfer:", slotError)
            // Don't fail the transfer update if slot update fails
        }

        res.json({
            success: true,
            message: "Transfer updated successfully",
            data: transfer,
        })
    } catch (error: any) {
        console.error("Error updating transfer:", error)

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

export const deleteTransfer = async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const transfer = await TransferModel.findByIdAndDelete(id)

        if (!transfer) {
            return res.status(404).json({
                success: false,
                message: "Transfer not found",
            })
        }

        // Delete all time slots for this transfer
        try {
            await TimeSlotService.deleteSlotsForPackage("transfer", transfer._id as Types.ObjectId)
            console.log(`Time slots deleted for transfer: ${transfer._id}`)
        } catch (slotError) {
            console.error("Error deleting time slots for transfer:", slotError)
            // Don't fail the transfer deletion if slot deletion fails
        }

        res.json({
            success: true,
            message: "Transfer deleted successfully",
        })
    } catch (error: any) {
        console.error("Error deleting transfer:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const updateTransferStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { status } = req.body

        if (!status || !["active", "sold"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status. Must be 'active' or 'sold'",
            })
        }

        const transfer = await TransferModel.findByIdAndUpdate(id, { status }, { new: true, runValidators: true })

        if (!transfer) {
            return res.status(404).json({
                success: false,
                message: "Transfer not found",
            })
        }

        res.json({
            success: true,
            message: "Transfer status updated successfully",
            data: transfer,
        })
    } catch (error: any) {
        console.error("Error updating transfer status:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const checkSlugAvailability = async (req: Request, res: Response) => {
    try {
        const { slug } = req.params
        const { excludeId } = req.query

        const query: any = { slug }
        if (excludeId) {
            query._id = { $ne: excludeId }
        }

        const existingTransfer = await TransferModel.findOne(query)

        res.json({
            success: true,
            available: !existingTransfer,
        })
    } catch (error: any) {
        console.error("Error checking slug availability:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

// Toggle transfer availability (enable/disable booking)
export const toggleTransferAvailability = async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { isAvailable } = req.body

        if (typeof isAvailable !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: "isAvailable must be a boolean value",
            })
        }

        const transfer = await TransferModel.findByIdAndUpdate(
            id,
            { isAvailable },
            { new: true, runValidators: true }
        )

        if (!transfer) {
            return res.status(404).json({
                success: false,
                message: "Transfer not found",
            })
        }

        res.json({
            success: true,
            message: `Transfer ${isAvailable ? 'enabled' : 'disabled'} successfully`,
            data: transfer,
        })
    } catch (error: any) {
        console.error("Error toggling transfer availability:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}

export const getVehicles = async (req: Request, res: Response) => {
    try {
        // Get unique vehicles from private transfers
        const vehicles = await TransferModel.distinct("vehicle", {
            type: "Private",
            vehicle: { $exists: true, $nin: [null, ""] }
        })

        res.json({
            success: true,
            data: vehicles,
        })
    } catch (error: any) {
        console.error("Error fetching vehicles:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
        })
    }
}
