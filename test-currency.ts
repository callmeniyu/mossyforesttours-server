import { CurrencyService } from './src/services/currency.service';

async function testCurrencyService() {
  console.log('🧪 Testing Currency Service...\n');

  try {
    // Test getting exchange rates
    console.log('1️⃣ Testing getExchangeRates()...');
    const rates = await CurrencyService.getExchangeRates();
    console.log('✅ Exchange Rates:', rates);
    console.log('   Last Updated:', rates.lastUpdated);
    console.log('   USD Rate:', rates.USD);
    console.log('   EUR Rate:', rates.EUR);
    console.log('   Is from cache:', rates.fromCache);
    console.log('');

    // Test converting to USD
    console.log('2️⃣ Testing convertToUSD()...');
    const myrAmount = 100;
    const usdAmount = await CurrencyService.convertToUSD(myrAmount);
    console.log(`✅ RM ${myrAmount} = $${usdAmount}`);
    console.log('');

    // Test converting to EUR
    console.log('3️⃣ Testing convertToEUR()...');
    const eurAmount = await CurrencyService.convertToEUR(myrAmount);
    console.log(`✅ RM ${myrAmount} = €${eurAmount}`);
    console.log('');

    // Test with different amounts
    console.log('4️⃣ Testing with various amounts...');
    const testAmounts = [50, 150, 300, 500];
    for (const amount of testAmounts) {
      const usd = await CurrencyService.convertToUSD(amount);
      const eur = await CurrencyService.convertToEUR(amount);
      console.log(`   RM ${amount} = $${usd} / €${eur}`);
    }

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testCurrencyService();
