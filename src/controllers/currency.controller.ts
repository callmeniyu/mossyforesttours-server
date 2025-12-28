import { Request, Response } from 'express';
import { currencyService } from '../services/currency.service';

/**
 * Get current exchange rates
 */
export const getExchangeRates = async (req: Request, res: Response) => {
  try {
    const rates = await currencyService.getExchangeRates();
    
    res.json({
      success: true,
      data: {
        USD: rates.USD,
        EUR: rates.EUR,
        lastUpdated: rates.lastUpdated,
        baseCurrency: 'MYR',
      },
    });
  } catch (error: any) {
    console.error('Error fetching exchange rates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch exchange rates',
      error: error.message,
    });
  }
};

/**
 * Convert MYR amount to USD and EUR
 */
export const convertCurrency = async (req: Request, res: Response) => {
  try {
    const { amount } = req.query;

    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount parameter',
      });
    }

    const myrAmount = Number(amount);
    const rates = await currencyService.getExchangeRates();

    res.json({
      success: true,
      data: {
        MYR: myrAmount,
        USD: Math.round(myrAmount * rates.USD),
        EUR: Math.round(myrAmount * rates.EUR),
        rates: {
          USD: rates.USD,
          EUR: rates.EUR,
        },
        lastUpdated: rates.lastUpdated,
      },
    });
  } catch (error: any) {
    console.error('Error converting currency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to convert currency',
      error: error.message,
    });
  }
};

/**
 * Force refresh exchange rates (admin only)
 */
export const refreshExchangeRates = async (req: Request, res: Response) => {
  try {
    const rates = await currencyService.getFreshRates();
    
    res.json({
      success: true,
      message: 'Exchange rates refreshed successfully',
      data: {
        USD: rates.USD,
        EUR: rates.EUR,
        lastUpdated: rates.lastUpdated,
      },
    });
  } catch (error: any) {
    console.error('Error refreshing exchange rates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh exchange rates',
      error: error.message,
    });
  }
};
