const fs = require('fs');
const file = 'src/utils/commercepay.utils.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /const now = Date\.now\(\);\s+const drift = Math\.abs\(now - numeric\);\s+if \(drift > 5 \* 60 \* 1000\)/,
  `const now = Date.now();
  // Handle both seconds and milliseconds (if length is < 13, probably seconds)
  const isSeconds = numeric < 20000000000;
  const numericMs = isSeconds ? numeric * 1000 : numeric;
  const drift = Math.abs(now - numericMs);
  if (drift > 5 * 60 * 1000)`
);

code = code.replace(
  /const rawTimestamp = paymentData\.timestamp \?\? Date\.now\(\);\s+let numericTimestamp: number;\s+if \(typeof rawTimestamp === 'string'\) \{\s+numericTimestamp = Date\.parse\(rawTimestamp\);\s+\} else \{\s+numericTimestamp = Number\(rawTimestamp\);\s+\}/,
  `const rawTimestamp = paymentData.timestamp ?? Date.now();
  let numericTimestamp: number;

  if (typeof rawTimestamp === 'string') {
    numericTimestamp = Math.floor(Date.parse(rawTimestamp) / 1000);
  } else {
    // If it looks like milliseconds, convert to seconds
    const val = Number(rawTimestamp);
    numericTimestamp = val > 20000000000 ? Math.floor(val / 1000) : val;
  }`
);

fs.writeFileSync(file, code);
console.log('Patched timestamp logic');
