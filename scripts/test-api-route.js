#!/usr/bin/env node

const http = require('http');

console.log('🧪 Testing API route: /api/matches/test-match/games');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/matches/test-match/games',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  }
};

const req = http.request(options, (res) => {
  console.log(`📡 Response Status: ${res.statusCode}`);
  console.log(`📋 Response Headers:`, JSON.stringify(res.headers, null, 2));

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\n📄 Response Body:');
    try {
      const jsonData = JSON.parse(data);
      console.log(JSON.stringify(jsonData, null, 2));
    } catch (e) {
      console.log('Raw response (not JSON):');
      console.log(data);
    }

    if (res.statusCode === 200) {
      console.log('\n✅ API route is working correctly');
    } else if (res.statusCode === 405) {
      console.log('\n❌ Method Not Allowed - API route configuration issue');
    } else {
      console.log(`\n⚠️  Unexpected status code: ${res.statusCode}`);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

// Set a timeout
req.setTimeout(5000, () => {
  console.error('❌ Request timeout');
  req.destroy();
});

req.end();