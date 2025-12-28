import { Router } from 'express';
import {
  getExchangeRates,
  convertCurrency,
  refreshExchangeRates,
} from '../controllers/currency.controller';

const router = Router();

/**
 * @route   GET /api/currency/rates
 * @desc    Get current exchange rates (MYR to USD and EUR)
 * @access  Public
 */
router.get('/rates', getExchangeRates);

/**
 * @route   GET /api/currency/convert
 * @desc    Convert MYR amount to USD and EUR
 * @query   amount - MYR amount to convert
 * @access  Public
 */
router.get('/convert', convertCurrency);

/**
 * @route   POST /api/currency/refresh
 * @desc    Force refresh exchange rates (admin only)
 * @access  Admin
 */
router.post('/refresh', refreshExchangeRates);

export default router;
