import axios from 'axios';

interface ExchangeRates {
  USD: number;
  EUR: number;
  lastUpdated: Date;
}

class CurrencyService {
  private rates: ExchangeRates | null = null;
  private readonly CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
  
  // Fallback rates in case API fails
  private readonly FALLBACK_RATES = {
    USD: 0.224,
    EUR: 0.214,
  };

  /**
   * Fetch latest exchange rates from ExchangeRate-API
   * Free tier: 1,500 requests/month
   */
  private async fetchRatesFromAPI(): Promise<{ USD: number; EUR: number }> {
    try {
      // Using exchangerate-api.com - free tier, no API key required
      const response = await axios.get(
        'https://open.er-api.com/v6/latest/MYR',
        { timeout: 5000 }
      );

      if (response.data && response.data.rates) {
        return {
          USD: response.data.rates.USD,
          EUR: response.data.rates.EUR,
        };
      }

      throw new Error('Invalid API response');
    } catch (error) {
      console.error('Failed to fetch exchange rates from API:', error);
      
      // Try alternative free API as backup
      try {
        const backupResponse = await axios.get(
          'https://api.exchangerate-api.com/v4/latest/MYR',
          { timeout: 5000 }
        );

        if (backupResponse.data && backupResponse.data.rates) {
          return {
            USD: backupResponse.data.rates.USD,
            EUR: backupResponse.data.rates.EUR,
          };
        }
      } catch (backupError) {
        console.error('Backup API also failed:', backupError);
      }

      // Return fallback rates if all APIs fail
      console.log('Using fallback exchange rates');
      return this.FALLBACK_RATES;
    }
  }

  /**
   * Get current exchange rates (cached or fresh)
   */
  async getExchangeRates(): Promise<ExchangeRates> {
    const now = new Date();

    // Return cached rates if still valid
    if (this.rates && this.rates.lastUpdated) {
      const timeSinceUpdate = now.getTime() - this.rates.lastUpdated.getTime();
      if (timeSinceUpdate < this.CACHE_DURATION) {
        console.log('Returning cached exchange rates');
        return this.rates;
      }
    }

    // Fetch fresh rates
    console.log('Fetching fresh exchange rates...');
    try {
      const rates = await this.fetchRatesFromAPI();
      this.rates = {
        ...rates,
        lastUpdated: now,
      };
      console.log('Exchange rates updated:', this.rates);
      return this.rates;
    } catch (error) {
      console.error('Failed to update exchange rates:', error);
      
      // If we have old cached rates, return them
      if (this.rates) {
        console.log('Returning expired cached rates due to API failure');
        return this.rates;
      }

      // Last resort: return fallback rates
      this.rates = {
        ...this.FALLBACK_RATES,
        lastUpdated: now,
      };
      return this.rates;
    }
  }

  /**
   * Convert MYR to USD
   */
  async convertToUSD(myrAmount: number): Promise<number> {
    const rates = await this.getExchangeRates();
    return Math.round(myrAmount * rates.USD);
  }

  /**
   * Convert MYR to EUR
   */
  async convertToEUR(myrAmount: number): Promise<number> {
    const rates = await this.getExchangeRates();
    return Math.round(myrAmount * rates.EUR);
  }

  /**
   * Get rates without caching (for testing)
   */
  async getFreshRates(): Promise<ExchangeRates> {
    const rates = await this.fetchRatesFromAPI();
    return {
      ...rates,
      lastUpdated: new Date(),
    };
  }
}

export const currencyService = new CurrencyService();
