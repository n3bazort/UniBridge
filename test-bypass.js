const axios = require('axios');

async function test() {
  try {
    const loginRes = await axios.post('http://localhost:3001/api/v1/auth/login', {
      email: 'admin@uleam.edu.ec',
      password: '@adminadmin007'
    });
    const token = loginRes.data.access_token;
    console.log('Logged in successfully');

    try {
      const pRes = await axios.get('http://localhost:3000/api/v1/practices?page=1&limit=500', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('GET /practices SUCCESS, rows:', pRes.data?.data?.length);
    } catch(e) {
      console.error('GET /practices FAILED:', e.response?.status, e.response?.data);
    }

    try {
      const sRes = await axios.get('http://localhost:3001/api/v1/students?page=1&limit=500&unassignedOnly=true', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('GET /students SUCCESS, rows:', sRes.data?.data?.length);
    } catch(e) {
      console.error('GET /students FAILED:', e.response?.status, e.response?.data);
    }

  } catch(e) {
    console.error('Login failed:', e.response?.status, e.response?.data);
  }
}

test();
