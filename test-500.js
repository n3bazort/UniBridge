const axios = require('axios');

async function test() {
  try {
    // 1. Login as admin
    const loginRes = await axios.post('http://localhost:3001/api/v1/auth/login', {
      email: 'admin@uleam.edu.ec',
      password: '@adminadmin007'
    });
    const token = loginRes.data.access_token;

    // 2. Fetch practices
    const res = await axios.get('http://localhost:3001/api/v1/practices?page=1&limit=500', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Success, rows:', res.data?.data?.length);
  } catch (err) {
    if (err.response) {
      console.error('API Error:', err.response.status, err.response.data);
    } else {
      console.error('Request failed:', err.message);
    }
  }
}

test();
