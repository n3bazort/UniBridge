const axios = require('axios');

async function test() {
  const students = [];
  for (let i = 0; i < 50; i++) {
    students.push({
      dni: `09${10000000 + i}`,
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
    const res = await axios.post('http://localhost:3001/api/v1/practices/bulk-import', {
      programName: 'Test Program',
      students,
    });
    console.log(res.data);
  } catch (err) {
    console.error(err.message);
    if (err.response) console.error(err.response.data);
  }
}

test();
