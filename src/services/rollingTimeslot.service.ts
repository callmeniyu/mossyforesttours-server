import { Types } from "mongoose";
import Tour from "../models/Tour";
import Transfer from "../models/Transfer";
import Vehicle from "../models/Vehicle"; 
import { TimeSlotService } from "./timeSlot.service";

/**
 * Service for maintaining rolling window of timeslots (always have next 90 days available)
 */
export class RollingTimeslotService {
    
    /**
     * Generate timeslots for all active packages to maintain rolling 90-day window
     * Should be called daily by cron job
     */
    static async generateRollingTimeslots(): Promise<{
        success: boolean;
        packagesProcessed: number;
        slotsGenerated: number;
        errors: string[];
    }> {
        const result = {
            success: true,
            packagesProcessed: 0,
            slotsGenerated: 0,
            errors: [] as string[]
        };

        try {
            console.log('🔄 Starting rolling timeslot generation...');
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + 90); // Always maintain 90 days ahead

            // Process all active tours
            const activeTours = await Tour.find({ status: 'active' }).lean();
            for (const tour of activeTours) {
                try {
                    const generated = await this.generateSlotsForPackage(
                        'tour',
                        tour._id,
                        tour,
                        targetDate
                    );
                    result.slotsGenerated += generated;
                    result.packagesProcessed++;
                } catch (error: any) {
                    result.errors.push(`Tour ${tour._id}: ${error.message}`);
                    result.success = false;
                }
            }

            // Process all active transfers
            const activeTransfers = await Transfer.find({ status: 'active' }).lean();
            for (const transfer of activeTransfers) {
                try {
                    const generated = await this.generateSlotsForPackage(
                        'transfer',
                        transfer._id,
                        transfer,
                        targetDate
                    );
                    result.slotsGenerated += generated;
                    result.packagesProcessed++;
                } catch (error: any) {
                    result.errors.push(`Transfer ${transfer._id}: ${error.message}`);
                    result.success = false;
                }
            }

            console.log(`✅ Rolling timeslot generation complete: ${result.packagesProcessed} packages, ${result.slotsGenerated} slots generated`);
            if (result.errors.length > 0) {
                console.error(`⚠️ Errors encountered: ${result.errors.length}`);
                result.errors.forEach(error => console.error(`  - ${error}`));
            }

        } catch (error: any) {
            console.error('❌ Rolling timeslot generation failed:', error);
            result.success = false;
            result.errors.push(`System error: ${error.message}`);
        }

        return result;
    }

    /**
     * Generate slots for a specific package up to target date
     */
    private static async generateSlotsForPackage(
        packageType: 'tour' | 'transfer',
        packageId: any,
        packageData: any,
        targetDate: Date
    ): Promise<number> {
        
        // Determine the starting date for generation
        const lastGenerated = packageData.lastSlotsGeneratedAt 
            ? new Date(packageData.lastSlotsGeneratedAt)
            : new Date(packageData.createdAt);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Start generating from the day after last generated date, or today if never generated
        const startDate = new Date(Math.max(
            lastGenerated.getTime() + (24 * 60 * 60 * 1000), // Day after last generated
            today.getTime() // Or today, whichever is later
        ));

        // If start date is already past target date, nothing to generate
        if (startDate > targetDate) {
            console.log(`📅 Package ${packageId} slots already up to date`);
            return 0;
        }

        // Determine departure times and capacity
        let departureTimes: string[] = [];
        let capacity: number = 0;

        if (packageType === 'tour') {
            departureTimes = packageData.departureTimes || [];
            capacity = packageData.maximumPerson || 15;
        } else {
            departureTimes = packageData.times || [];
            
            // Determine capacity based on transfer type
            if (packageData.type === "Private" && packageData.vehicle) {
                try {
                    const vehicleDoc = await Vehicle.findOne({ name: packageData.vehicle }).lean();
                    capacity = (vehicleDoc && typeof vehicleDoc.units === 'number') ? vehicleDoc.units : 1;
                } catch (err) {
                    console.warn(`Failed to lookup vehicle for private transfer ${packageId}, using default 1`);
                    capacity = 1;
                }
            } else {
                capacity = packageData.maximumPerson || 10;
            }
        }

        if (departureTimes.length === 0) {
            console.warn(`⚠️ No departure times configured for ${packageType} ${packageId}`);
            return 0;
        }

        // Generate slots using existing TimeSlotService, but only for the missing date range
        console.log(`📅 Generating slots for ${packageType} ${packageId} from ${startDate.toISOString().split('T')[0]} to ${targetDate.toISOString().split('T')[0]}`);
        
        // Calculate how many slots we'll generate (rough estimate)
        const daysToGenerate = Math.ceil((targetDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        const estimatedSlots = daysToGenerate * departureTimes.length;

        // Use the existing generation method but modify the date range
        await this.generateSlotsForDateRange(
            packageType,
            new Types.ObjectId(packageId),
            departureTimes,
            capacity,
            startDate,
            targetDate,
            packageData.minimumPerson || 1
        );

        // Update the lastSlotsGeneratedAt field
        if (packageType === 'tour') {
            await Tour.findByIdAndUpdate(packageId, {
                lastSlotsGeneratedAt: targetDate
            });
        } else {
            await Transfer.findByIdAndUpdate(packageId, {
                lastSlotsGeneratedAt: targetDate
            });
        }

        console.log(`  ✅ Generated ~${estimatedSlots} slots for ${packageType} ${packageId}`);
        return estimatedSlots;
    }

    /**
     * Generate slots for a specific date range (modified version of TimeSlotService.generateSlotsForPackage)
     */
    private static async generateSlotsForDateRange(
        packageType: "tour" | "transfer",
        packageId: Types.ObjectId,
        departureTimes: string[],
        capacity: number,
        startDate: Date,
        endDate: Date,
        minimumPerson: number
    ): Promise<void> {
        try {
            const TimeSlot = (await import("../models/TimeSlot")).default;
            
            const currentDate = new Date(startDate);
            const slotsToCreate: any[] = [];

            while (currentDate <= endDate) {
                const dateString = this.formatDateToMYT(currentDate);
                
                // Check if slots already exist for this date (idempotent)
                const existingSlot = await TimeSlot.findOne({
                    packageType,
                    packageId,
                    date: dateString
                });

                if (!existingSlot) {
                    const slots = departureTimes.map(time => ({
                        time,
                        capacity,
                        bookedCount: 0,
                        isAvailable: true,
                        minimumPerson
                    }));

                    slotsToCreate.push({
                        packageType,
                        packageId,
                        date: dateString,
                        slots,
                        capacity
                    });
                }

                currentDate.setDate(currentDate.getDate() + 1);
            }

            // Bulk insert all new slots
            if (slotsToCreate.length > 0) {
                await TimeSlot.insertMany(slotsToCreate);
                console.log(`    📝 Created ${slotsToCreate.length} new timeslot documents`);
            }

        } catch (error) {
            console.error("Error generating slots for date range:", error);
            throw error;
        }
    }

    /**
     * Format date to Malaysia timezone (same as TimeSlotService)
     * Uses proper timezone API for accurate conversion
     */
    private static formatDateToMYT(date: Date): string {
        if (!(date instanceof Date) || isNaN(date.getTime())) {
            throw new Error('Invalid Date object provided');
        }
        
        return date.toLocaleDateString("en-CA", {
            timeZone: "Asia/Kuala_Lumpur",
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    /**
     * Check which packages need slot generation (utility method)
     */
    static async checkPackagesNeedingSlots(): Promise<{
        tours: any[];
        transfers: any[];
    }> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const warningThreshold = new Date(today);
        warningThreshold.setDate(today.getDate() + 30); // Warn if less than 30 days remaining

        const tours = await Tour.find({ 
            status: 'active',
            $or: [
                { lastSlotsGeneratedAt: { $exists: false } }, // Never generated
                { lastSlotsGeneratedAt: { $lt: warningThreshold } } // Generated but running low
            ]
        }).lean();

        const transfers = await Transfer.find({ 
            status: 'active',
            $or: [
                { lastSlotsGeneratedAt: { $exists: false } }, // Never generated
                { lastSlotsGeneratedAt: { $lt: warningThreshold } } // Generated but running low
            ]
        }).lean();

        return { tours, transfers };
    }

    /**
     * Generate slots for a specific package manually (useful for testing)
     */
    static async generateSlotsForSpecificPackage(
        packageType: 'tour' | 'transfer',
        packageId: string
    ): Promise<{ success: boolean; message: string; slotsGenerated: number }> {
        try {
            // Find package based on type
            let packageData: any;
            if (packageType === 'tour') {
                packageData = await Tour.findById(packageId).lean();
            } else {
                packageData = await Transfer.findById(packageId).lean();
            }
            
            if (!packageData) {
                return {
                    success: false,
                    message: `Package ${packageId} not found`,
                    slotsGenerated: 0
                };
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + 90);

            const slotsGenerated = await this.generateSlotsForPackage(
                packageType,
                packageId,
                packageData,
                targetDate
            );

            return {
                success: true,
                message: `Successfully generated ${slotsGenerated} slots for ${packageType} ${packageId}`,
                slotsGenerated
            };

        } catch (error: any) {
            return {
                success: false,
                message: `Error generating slots: ${error.message}`,
                slotsGenerated: 0
            };
        }
    }
}
