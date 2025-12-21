import { Request, Response } from "express"
import { TimeSlotService } from "../services/timeSlot.service"
import { Types } from "mongoose"
import Tour from "../models/Tour"
import Transfer from "../models/Transfer"

/**
 * Generate time slots for a package
 */
export const generateSlots = async (req: Request, res: Response) => {
    try {
        const { packageType, packageId, departureTimes, capacity } = req.body

        console.log("Generate slots request:", { packageType, packageId, departureTimes, capacity })

        if (!packageType || !packageId || !departureTimes || !capacity) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: packageType, packageId, departureTimes, capacity"
            })
        }

        if (!["tour", "transfer"].includes(packageType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid packageType. Must be 'tour' or 'transfer'"
            })
        }

        if (!Array.isArray(departureTimes) || departureTimes.length === 0) {
            return res.status(400).json({
                success: false,
                message: "departureTimes must be a non-empty array"
            })
        }

        // Validate packageId is a valid ObjectId string
        if (typeof packageId !== 'string' || packageId.length !== 24) {
            return res.status(400).json({
                success: false,
                message: "packageId must be a valid 24-character ObjectId string"
            })
        }

        // Get package details to retrieve minimumPerson
        let packageDetails
        if (packageType === "tour") {
            packageDetails = await Tour.findById(packageId)
        } else {
            packageDetails = await Transfer.findById(packageId)
        }

        if (!packageDetails) {
            return res.status(404).json({
                success: false,
                message: "Package not found"
            })
        }

        // ROBUST: Don't pass minimumPerson parameter - let service fetch it
        console.log(`🎯 GENERATING SLOTS: ${packageType} ${packageId}`);
        console.log(`   Package minimumPerson: ${packageDetails.minimumPerson}`);
        console.log(`   Package type: ${packageDetails.type}`);

        await TimeSlotService.generateSlotsForPackage(
            packageType,
            new Types.ObjectId(packageId),
            departureTimes,
            capacity
            // No minimumPerson parameter - service will fetch from package
        )

        res.status(201).json({
            success: true,
            message: "Time slots generated successfully"
        })
    } catch (error: any) {
        console.error("Error generating slots:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

/**
 * Check availability for a specific slot
 */
export const checkAvailability = async (req: Request, res: Response) => {
    try {
        const { packageType, packageId, date, time, persons } = req.query

        if (!packageType || !packageId || !date || !time || !persons) {
            return res.status(400).json({
                success: false,
                message: "Missing required query parameters: packageType, packageId, date, time, persons"
            })
        }

        const availability = await TimeSlotService.checkAvailability(
            packageType as "tour" | "transfer",
            new Types.ObjectId(packageId as string),
            date as string,
            time as string,
            parseInt(persons as string)
        )

        res.json({
            success: true,
            data: availability
        })
    } catch (error: any) {
        console.error("Error checking availability:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

/**
 * Check availability for cart items (no time restrictions)
 */
/**
 * Get available slots for a specific date
 */
export const getAvailableSlots = async (req: Request, res: Response) => {
    try {
        const { packageType, packageId, date } = req.query

        console.log("Get available slots request:", { packageType, packageId, date })

        if (!packageType || !packageId || !date) {
            return res.status(400).json({
                success: false,
                message: "Missing required query parameters: packageType, packageId, date"
            })
        }

        // Validate packageId is a valid ObjectId string
        if (typeof packageId !== 'string' || packageId.length !== 24) {
            return res.status(400).json({
                success: false,
                message: "packageId must be a valid 24-character ObjectId string"
            })
        }

        const slots = await TimeSlotService.getAvailableSlots(
            packageType as "tour" | "transfer",
            new Types.ObjectId(packageId as string),
            date as string
        )

        if (!slots) {
            return res.status(404).json({
                success: false,
                message: "No slots found for the specified date"
            })
        }

        res.json({
            success: true,
            data: slots
        })
    } catch (error: any) {
        console.error("Error getting available slots:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

/**
 * Toggle slot availability for a specific slot
 */
export const toggleSlotAvailability = async (req: Request, res: Response) => {
    try {
        const { packageType, packageId, date, time, isAvailable } = req.body

        console.log("Toggle slot availability request:", { packageType, packageId, date, time, isAvailable })

        if (!packageType || !packageId || !date || !time || typeof isAvailable !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: packageType, packageId, date, time, isAvailable"
            })
        }

        if (!["tour", "transfer"].includes(packageType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid packageType. Must be 'tour' or 'transfer'"
            })
        }

        // Validate packageId is a valid ObjectId string
        if (typeof packageId !== 'string' || packageId.length !== 24) {
            return res.status(400).json({
                success: false,
                message: "packageId must be a valid 24-character ObjectId string"
            })
        }

        const result = await TimeSlotService.toggleSlotAvailability(
            packageType,
            new Types.ObjectId(packageId),
            date,
            time,
            isAvailable
        )

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "Slot not found for the specified parameters"
            })
        }

        res.json({
            success: true,
            message: `Slot ${isAvailable ? 'enabled' : 'disabled'} successfully`,
            data: result
        })
    } catch (error: any) {
        console.error("Error toggling slot availability:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

/**
 * Update slot booking count
 */
export const updateSlotBooking = async (req: Request, res: Response) => {
    try {
        const { packageType, packageId, date, time, personsCount, operation = "add" } = req.body

        if (!packageType || !packageId || !date || !time || personsCount === undefined) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: packageType, packageId, date, time, personsCount"
            })
        }

        if (!["add", "subtract"].includes(operation)) {
            return res.status(400).json({
                success: false,
                message: "Invalid operation. Must be 'add' or 'subtract'"
            })
        }

        const result = await TimeSlotService.updateSlotBooking(
            packageType,
            new Types.ObjectId(packageId),
            date,
            time,
            personsCount,
            operation
        )

        res.json({
            success: true,
            message: `Slot booking ${operation === "add" ? "added" : "subtracted"} successfully`,
            data: { updated: result }
        })
    } catch (error: any) {
        console.error("Error updating slot booking:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

/**
 * Update slots for a package (when package is modified)
 */
export const updateSlotsForPackage = async (req: Request, res: Response) => {
    try {
        const { packageType, packageId, departureTimes, capacity } = req.body

        if (!packageType || !packageId || !departureTimes || !capacity) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: packageType, packageId, departureTimes, capacity"
            })
        }

        if (!Array.isArray(departureTimes) || departureTimes.length === 0) {
            return res.status(400).json({
                success: false,
                message: "departureTimes must be a non-empty array"
            })
        }

        await TimeSlotService.updateSlotsForPackage(
            packageType,
            new Types.ObjectId(packageId),
            departureTimes,
            capacity
        )

        res.json({
            success: true,
            message: "Package slots updated successfully"
        })
    } catch (error: any) {
        console.error("Error updating package slots:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

/**
 * Get slots summary for admin dashboard
 */
export const getSlotsSummary = async (req: Request, res: Response) => {
    try {
        const { packageType, packageId, startDate, endDate } = req.query

        if (!packageType || !packageId) {
            return res.status(400).json({
                success: false,
                message: "Missing required query parameters: packageType, packageId"
            })
        }

        const summary = await TimeSlotService.getSlotsSummary(
            packageType as "tour" | "transfer",
            new Types.ObjectId(packageId as string),
            startDate as string,
            endDate as string
        )

        res.json({
            success: true,
            data: summary
        })
    } catch (error: any) {
        console.error("Error getting slots summary:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

/**
 * Delete all slots for a package
 */
export const deleteSlotsForPackage = async (req: Request, res: Response) => {
    try {
        const { packageType, packageId } = req.params

        if (!packageType || !packageId) {
            return res.status(400).json({
                success: false,
                message: "Missing required parameters: packageType, packageId"
            })
        }

        if (!["tour", "transfer"].includes(packageType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid packageType. Must be 'tour' or 'transfer'"
            })
        }

        await TimeSlotService.deleteSlotsForPackage(
            packageType as "tour" | "transfer",
            new Types.ObjectId(packageId)
        )

        res.json({
            success: true,
            message: "All slots deleted successfully"
        })
    } catch (error: any) {
        console.error("Error deleting slots:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

/**
 * Debug: Get all time slots for a package
 */
export const debugTimeSlots = async (req: Request, res: Response) => {
    try {
        const { packageId } = req.query

        if (!packageId) {
            return res.status(400).json({
                success: false,
                message: "packageId query parameter is required"
            })
        }

        // Import TimeSlot model
        const TimeSlot = (await import("../models/TimeSlot")).default

        // Get all time slots for this package
        const timeSlots = await TimeSlot.find({
            packageId: new Types.ObjectId(packageId as string)
        }).sort({ date: 1 })

        const summary = {
            totalSlots: timeSlots.length,
            dateRange: timeSlots.length > 0 ? {
                start: timeSlots[0].date,
                end: timeSlots[timeSlots.length - 1].date
            } : null,
            sampleSlots: timeSlots.slice(0, 5), // First 5 slots
            uniqueDates: [...new Set(timeSlots.map(slot => slot.date))].length
        }

        res.json({
            success: true,
            data: summary
        })
    } catch (error: any) {
        console.error("Error getting debug time slots:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

/**
 * Update minimum person for a specific time slot
 */
export const updateSlotMinimumPerson = async (req: Request, res: Response) => {
    try {
        const { packageType, packageId, date, time, minimumPerson } = req.body

        if (!packageType || !packageId || !date || !time || minimumPerson === undefined) {
            return res.status(400).json({
                success: false,
                message: "packageType, packageId, date, time, and minimumPerson are required"
            })
        }

        if (!["tour", "transfer"].includes(packageType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid packageType. Must be 'tour' or 'transfer'"
            })
        }

        if (typeof minimumPerson !== 'number' || minimumPerson < 1) {
            return res.status(400).json({
                success: false,
                message: "minimumPerson must be a positive number"
            })
        }

        // Import TimeSlot model
        const TimeSlot = (await import("../models/TimeSlot")).default

        // Find the time slot document and update the specific slot
        const timeSlotDoc = await TimeSlot.findOne({
            packageType,
            packageId: new Types.ObjectId(packageId),
            date
        })

        if (!timeSlotDoc) {
            return res.status(404).json({
                success: false,
                message: "Time slot document not found"
            })
        }

        // Find the specific slot within the document
        const slotIndex = timeSlotDoc.slots.findIndex(slot => slot.time === time)

        if (slotIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Specific time slot not found"
            })
        }

        // Update the minimum person for the specific slot
        timeSlotDoc.slots[slotIndex].minimumPerson = minimumPerson

        // Save the document
        await timeSlotDoc.save()

        res.json({
            success: true,
            message: "Minimum person updated successfully",
            data: {
                packageType,
                packageId,
                date,
                time,
                minimumPerson
            }
        })
    } catch (error: any) {
        console.error("Error updating slot minimum person:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

/**
 * Get server's Malaysia timezone date and time
 */
export const getServerDateTime = async (req: Request, res: Response) => {
    try {
        // Get current time in Malaysia timezone
        const now = new Date();

        // Get Malaysia date without any parsing issues
        const malaysiaDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }); // YYYY-MM-DD
        const malaysiaTime = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kuala_Lumpur'
        });

        // Get Malaysia long date format
        const malaysiaLongDate = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'Asia/Kuala_Lumpur'
        });

        res.json({
            success: true,
            data: {
                date: malaysiaDate,
                time: malaysiaTime,
                longDate: malaysiaLongDate,
                // Send the raw date string to avoid client-side timezone conversion issues
                fullDateTime: malaysiaDate + 'T00:00:00.000Z'
            }
        });
    } catch (error: any) {
        console.error("Error getting server date time:", error)
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
}
