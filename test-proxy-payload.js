const axios = require('axios');

async function test() {
  const students = [];
  for (let i = 0; i < 500; i++) {
    students.push({
      dni: `06${10000000 + i}`,
      firstName: 'Test',
      lastName: `User ${i}`,
      email: `test${i}@live.uleam.edu.ec`,
      programName: 'Software',
      companyName: 'Test Company',
      tutorName: 'Tutor',
      practiceLevel: 'Level 1',
      academicLevel: 'Level 1',
      totalHours: 100,
    });
  }

  try {
    const res = await axios.post('http://localhost:3001/api/v1/auth/login', {
      email: 'admin@uleam.edu.ec',
      password: '@adminadmin007'
    });
    const token = res.data.access_token;

    console.log('Sending payload to PORT 3000 (Next.js proxy)...', JSON.stringify(students).length, 'bytes');
    const importRes = await axios.post('http://localhost:3000/api/v1/practices/bulk-import', {
      programName: 'Test Program',
      students,
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Success:', importRes.data);
  } catch (err) {
    if (err.response) {
      console.error('API Error:', err.response.status, typeof err.response.data === 'string' ? err.response.data.slice(0, 100) : err.response.data);
    } else {
      console.error('Request failed:', err.message);
    }
  }
}

test();
