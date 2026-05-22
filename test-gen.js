const fetch = require('node-fetch') || globalThis.fetch;
async function main() {
  const login = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@uleam.edu.ec', password: 'Admin123!' })
  });
  const token = (await login.json()).access_token;

  const practicesRes = await fetch('http://localhost:3001/api/v1/practices', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  const practices = await practicesRes.json();
  const studentId = practices[0].studentId;

  const templatesRes = await fetch('http://localhost:3001/api/v1/document-templates', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  const templates = await templatesRes.json();
  const templateId = templates.find(t => t.type === 'PDF').id;

  console.log('Testing with Template:', templateId, 'Student:', studentId);

  const res = await fetch('http://localhost:3001/api/v1/generated-documents/generate', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, studentId })
  });
  console.log(await res.json());
}
main().catch(console.error);
