import { Request, Response } from "express";
import Booking from "../models/Booking";

export const getRevenueData = async (req: Request, res: Response) => {
  console.log("Revenue controller hit with query:", req.query);

  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "From date and to date are required",
      });
    }

    // Create date range for query
    let fromDate: Date, toDate: Date;
    try {
      fromDate = new Date(from as string);
      toDate = new Date(to as string);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }
      // Set start of fromDate and end of toDate for full day coverage
      fromDate.setHours(0, 0, 0, 0);
      toDate.setHours(23, 59, 59, 999);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Error parsing dates"
      });
    }

    // Debug logging
    console.log("Revenue Query:", {
      fromDate,
      toDate,
      from,
      to
    });

    // Only filter by Date type, matching Booking schema
    const bookings = await Booking.find({
      date: {
        $gte: fromDate,
        $lte: toDate
      },
      status: { $ne: "cancelled" }
    })
      .populate({
        path: "packageId",
        select: "title packageType newPrice",
      })
      .sort({ date: -1 });

    console.log(`Found ${bookings.length} bookings for range.`);

    res.json({
      success: true,
      bookings,
    });
  } catch (error) {
    console.error("Error fetching revenue data:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
