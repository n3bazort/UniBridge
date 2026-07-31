/**
 * Benchmark de la cola de generación documental (UniBridge).
 * Mide el tiempo real que tarda la cola BullMQ en generar N documentos,
 * registrando una serie temporal del progreso para graficarla.
 *
 * Uso:  node benchmarks/benchmark-cola.js [N]
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API = 'http://localhost:3001/api/v1';
const EMAIL = 'j.bazurto@uleam.edu.ec';
const PASS = '@adminadmin007';
const N = parseInt(process.argv[2] || '50', 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const t0 = Date.now();
  const login = await axios.post(`${API}/auth/login`, { email: EMAIL, password: PASS });
  const H = { headers: { Authorization: `Bearer ${login.data.access_token}` } };
  console.log('✔ Autenticado como', login.data.user.firstName, login.data.user.lastName);

  // plantilla de certificado
  const tpls = await axios.get(`${API}/document-templates`, H);
  const list = tpls.data?.data || tpls.data || [];
  const cert = list.find((t) => t.type === 'PDF') || list.find((t) => /certificad/i.test(t.name));

  // Hay dos clases de plantilla en Word —solicitud y designación— y solo la
  // primera sirve aquí. Sin filtrar por su tipo, el script tomaba la que
  // estuviera de primera en la lista y el servidor rechazaba la emisión.
  const esSolicitud = (t) => t.type === 'DOCX' &&
    ((typeof t.content === 'object' && t.content?.kind) || 'SOLICITUD') === 'SOLICITUD';
  const marcada = (t) => typeof t.content === 'object' && t.content?.isDefault === true;
  const sol = list.filter(esSolicitud).find(marcada) || list.find(esSolicitud);

  if (!cert) throw new Error('No hay plantilla PDF de certificado');
  if (!sol) throw new Error('No hay plantilla DOCX de solicitud de prácticas');
  console.log('✔ Plantilla certificado (PDF):', cert.name);
  console.log('✔ Plantilla solicitud (DOCX):', sol.name);

  // estudiantes (excluyendo los que ya tienen certificado vigente)
  const st = await axios.get(`${API}/students?page=1&limit=500`, H);
  const students = st.data?.data || st.data || [];
  let ocupados = new Set();
  try {
    const docs = await axios.get(`${API}/generated-documents?page=1&limit=1000`, H);
    for (const d of (docs.data?.data || docs.data || [])) {
      const sid = d.studentId || d.student?.id;
      if (sid && !d.invalidatedAt) ocupados.add(sid);
    }
  } catch (_) { /* si falla, seguimos */ }
  const studentIds = students.map((s) => s.id).filter((id) => !ocupados.has(id)).slice(0, N);
  console.log(`✔ Estudiantes disponibles: ${studentIds.length} (excluidos ${ocupados.size} con certificado vigente)`);
  if (!studentIds.length) throw new Error('No hay estudiantes sin certificado vigente');

  // 1) Solicitudes (motor docxtemplater) — requisito previo del certificado
  console.log('\n── Generando solicitudes (docxtemplater) ──');
  const tSol = Date.now();
  try {
    await axios.post(`${API}/generated-documents/generate-solicitud`,
      { templateId: sol.id, studentIds, overwrite: true }, { ...H, timeout: 900000 });
  } catch (e) {
    console.log('  (aviso)', e.response?.data?.message || e.message);
  }
  const solMs = Date.now() - tSol;
  console.log(`  solicitudes: ${(solMs / 1000).toFixed(1)} s`);

  // 2) Certificados en lote (cola BullMQ + pdf-lib)
  console.log('\n── Encolando certificados (BullMQ + pdf-lib) ──');
  const tEnq = Date.now();
  const batch = await axios.post(`${API}/generated-documents/generate-batch`,
    { templateId: cert.id, studentIds }, { ...H, timeout: 120000 });
  const batchId = batch.data.batchId;
  const enqueueMs = Date.now() - tEnq;
  console.log(`  encolados ${batch.data.count} jobs en ${enqueueMs} ms  (batch ${batchId})`);

  // 3) Polling del progreso -> serie temporal
  const serie = [];
  const tStart = Date.now();
  let last = -1, done = false;
  while (!done) {
    let d;
    try {
      const p = await axios.get(`${API}/generated-documents/batch/${batchId}/progress`, H);
      d = p.data;
    } catch (e) {
      if (e.response?.status === 429) { await sleep(3000); continue; } // rate limit: reintentar
      throw e;
    }
    const el = (Date.now() - tStart) / 1000;
    serie.push({ t: +el.toFixed(2), completed: d.completed, failed: d.failed, progress: d.progress });
    if (d.completed + d.failed !== last) {
      process.stdout.write(`\r  ${d.completed + d.failed}/${d.total}  (${d.progress}%)   `);
      last = d.completed + d.failed;
    }
    if (d.status !== 'PROCESSING' || d.completed + d.failed >= d.total) done = true;
    else await sleep(2000);
  }
  const totalMs = Date.now() - tStart;
  const fin = serie[serie.length - 1];

  const res = {
    fecha: new Date().toISOString(),
    documentos: studentIds.length,
    completados: fin.completed,
    fallidos: fin.failed,
    encolado_ms: enqueueMs,
    solicitudes_ms: solMs,
    total_s: +(totalMs / 1000).toFixed(2),
    docs_por_segundo: +(fin.completed / (totalMs / 1000)).toFixed(2),
    ms_por_documento: Math.round(totalMs / Math.max(fin.completed, 1)),
    concurrencia: 4,
    serie,
  };
  const out = path.join(__dirname, `resultado-${studentIds.length}.json`);
  fs.writeFileSync(out, JSON.stringify(res, null, 2));

  console.log(`\n\n═══ RESULTADO (${res.documentos} documentos) ═══`);
  console.log(`  Completados : ${res.completados}   Fallidos: ${res.fallidos}`);
  console.log(`  Tiempo total: ${res.total_s} s`);
  console.log(`  Rendimiento : ${res.docs_por_segundo} doc/s  (${res.ms_por_documento} ms/doc)`);
  console.log(`  Guardado en : ${out}`);
  console.log(`  (proceso completo desde login: ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
})().catch((e) => {
  console.error('ERROR:', e.response?.status, e.response?.data?.message || e.message);
  process.exit(1);
});
