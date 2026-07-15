const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('http://localhost:3001/api/v1/auth/login', {
      email: 'admin@uleam.edu.ec',
      password: '@adminadmin007'
    });
    const token = res.data.access_token;

    console.log('Fetching directly from NestJS...');
    const pRes = await axios.get('http://localhost:3001/api/v1/practices?page=1&limit=500', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const str = JSON.stringify(pRes.data);
    console.log('Size from Nest:', str.length, 'bytes');

    console.log('Fetching through Next.js Proxy...');
    const nRes = await axios.get('http://localhost:3000/api/v1/practices?page=1&limit=500', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Size from Proxy:', JSON.stringify(nRes.data).length, 'bytes');
  } catch(e) {
    console.error('Error:', e.message, e.response?.data);
  }
}

test();
