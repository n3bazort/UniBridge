/**
 * Prueba de rendimiento de la emisión masiva de certificados (UniBridge).
 *
 * Mide cuánto tarda el sistema en emitir el mismo volumen de certificados que la
 * Comisión de Prácticas emitió a mano en un cierre de período real: 124, según la
 * carpeta compartida del período 2025-1 (apartado 3.9.1 de la tesis).
 *
 * La salida está pensada para capturarse en pantalla y adjuntarse como anexo, así
 * que imprime también el equipo, la fecha y el alcance de lo que se está midiendo.
 *
 * A diferencia del benchmark anterior, este NO genera solicitudes antes. El propio
 * sistema dejó de exigirlas para certificar (ver `canIssueCertificate`), y medirlas
 * junto al lote mezclaba dos motores distintos —docxtemplater y pdf-lib— en una
 * sola cifra. Aquí se mide solo lo que la cifra declara: la emisión del certificado.
 *
 * Uso:  node benchmarks/prueba-rendimiento.cjs [N]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ENV = path.join(__dirname, '..', 'apps', 'api', '.env');
if (fs.existsSync(ENV)) {
  for (const linea of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const http = require('http');
const axios = require('axios');

// Un lote grande tarda varios minutos y el sondeo hace cientos de peticiones:
// sin keep-alive, abrir un socket nuevo cada vez agota los puertos y provoca
// ECONNRESET. Con keep-alive se reutiliza una sola conexión.
const keepAlive = new http.Agent({ keepAlive: true, maxSockets: 4 });

const API = process.env.BENCH_API || 'http://localhost:3001/api/v1';
const EMAIL = process.env.BENCH_EMAIL || 'j.bazurto@uleam.edu.ec';
const PASS = process.env.BENCH_PASS || '@adminadmin007';
const N = parseInt(process.argv[2] || '124', 10);
const PERIODO = '2024-1';
const PREFIJO_DNI = '9024';        // los estudiantes que siembra el script de siembra
const MINUTOS_MANUAL = 6;          // dato de la entrevista, Anexo A, pregunta 2

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ANCHO = 74;
const linea = (c) => c.repeat(ANCHO);

/** Acumula todo lo impreso para dejar además una transcripción en texto plano. */
const transcripcion = [];
function say(s = '') {
  console.log(s);
  transcripcion.push(s);
}
/** Etiqueta a la izquierda, valor alineado a la derecha de una columna fija. */
function fila(etiqueta, valor, col = 34) {
  say('  ' + etiqueta.padEnd(col) + valor);
}
function titulo(t) {
  say('');
  say('  ' + linea('─').slice(0, ANCHO - 2));
  say('  ' + t);
  say('  ' + linea('─').slice(0, ANCHO - 2));
}
function hhmm(minutos) {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
const dosDec = (n) => n.toFixed(2);

(async () => {
  const ahora = new Date();
  const sello = ahora.toISOString().slice(0, 19).replace('T', ' ');
  const cpu = os.cpus()[0]?.model?.replace(/\s+/g, ' ').trim() || 'desconocido';

  say('');
  say('  ' + linea('═').slice(0, ANCHO - 2));
  say('  UniBridge · Prueba de rendimiento de emisión masiva de certificados');
  say('  ' + linea('═').slice(0, ANCHO - 2));
  say('');
  fila('Fecha y hora', sello);
  fila('Período académico', PERIODO);
  fila('Certificados a emitir', String(N));
  fila('Equipo', `${cpu} · ${os.cpus().length} núcleos`);
  fila('Memoria', `${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`);
  fila('Sistema', `${os.platform()} ${os.release()} · Node ${process.version}`);
  fila('Concurrencia de la cola', '4 trabajos simultáneos');

  // ── Preparación ────────────────────────────────────────────────────────────
  titulo('PREPARACIÓN');

  // El token de acceso caduca a los 15 min y un lote grande puede tardar más,
  // así que se renueva a demanda. `H()` devuelve siempre la cabecera vigente.
  let token = null;
  let nombreUsuario = '';
  async function login() {
    const r = await axios.post(`${API}/auth/login`, { email: EMAIL, password: PASS }, { httpAgent: keepAlive });
    token = r.data.access_token;
    nombreUsuario = `${r.data.user.firstName} ${r.data.user.lastName}`;
  }
  const H = () => ({ headers: { Authorization: `Bearer ${token}` }, httpAgent: keepAlive });

  await login();
  fila('Autenticado', nombreUsuario);

  const tpls = await axios.get(`${API}/document-templates`, H());
  const lista = tpls.data?.data || tpls.data || [];
  const cert = lista.find((t) => t.type === 'PDF' && /certificad/i.test(t.name)) ||
               lista.find((t) => t.type === 'PDF');
  if (!cert) throw new Error('No hay plantilla PDF de certificado.');
  fila('Plantilla', `${cert.name} (${cert.type})`);

  const st = await axios.get(`${API}/students?page=1&limit=500`, H());
  const todos = st.data?.data || st.data || [];
  const sembrados = todos.filter((s) => String(s.dni || '').startsWith(PREFIJO_DNI));
  const studentIds = sembrados.slice(0, N).map((s) => s.id);
  fila('Estudiantes del período', `${sembrados.length} sembrados`);
  fila('Seleccionados para el lote', String(studentIds.length));

  if (studentIds.length < N) {
    throw new Error(
      `Solo hay ${studentIds.length} estudiantes sembrados y se piden ${N}. ` +
      'Ejecuta primero: node benchmarks/sembrar-periodo-2024-1.cjs ' + N,
    );
  }

  // ── Ejecución ──────────────────────────────────────────────────────────────
  titulo('EJECUCIÓN');

  const tEnq = Date.now();
  const batch = await axios.post(
    `${API}/generated-documents/generate-batch`,
    { templateId: cert.id, studentIds },
    { ...H(), timeout: 180000 },
  );
  const encoladoMs = Date.now() - tEnq;
  const batchId = batch.data.batchId;
  fila('Trabajos encolados', `${batch.data.count} en ${encoladoMs} ms`);
  fila('Identificador del lote', batchId);
  say('');
  say('     t (s)    generados    fallidos    progreso');
  say('     ─────    ─────────    ────────    ────────');

  const serie = [];
  const tStart = Date.now();
  let hecho = false;
  while (!hecho) {
    let d;
    try {
      d = (await axios.get(`${API}/generated-documents/batch/${batchId}/progress`, H())).data;
    } catch (e) {
      const codigo = e.code || '';
      // El token caducó a mitad del lote: se renueva y se reintenta sin perder la serie.
      if (e.response?.status === 401) { await login(); continue; }
      if (e.response?.status === 429) { await sleep(3000); continue; }
      // Caídas transitorias de red durante un lote largo: se reintenta en vez de abortar.
      if (['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE'].includes(codigo) ||
          /socket hang up/i.test(e.message)) { await sleep(2000); continue; }
      throw e;
    }
    const t = (Date.now() - tStart) / 1000;
    serie.push({ t: +t.toFixed(2), completados: d.completed, fallidos: d.failed, progreso: d.progress });
    say(
      '     ' + dosDec(t).padStart(5) +
      String(d.completed).padStart(13) +
      String(d.failed).padStart(12) +
      (String(d.progress) + ' %').padStart(12),
    );
    if (d.status !== 'PROCESSING' || d.completed + d.failed >= d.total) hecho = true;
    else await sleep(1500);
  }

  const totalMs = Date.now() - tStart;
  const fin = serie[serie.length - 1];
  const totalS = totalMs / 1000;
  const msPorDoc = totalMs / Math.max(fin.completados, 1);

  // ── Resultado ──────────────────────────────────────────────────────────────
  titulo('RESULTADO');
  fila('Certificados solicitados', String(studentIds.length));
  fila('Generados correctamente', String(fin.completados));
  fila('Fallidos', String(fin.fallidos));
  fila('Tiempo total del lote', `${dosDec(totalS)} s`);
  fila('Tiempo medio por certificado', `${Math.round(msPorDoc)} ms`);
  fila('Rendimiento', `${dosDec(fin.completados / totalS)} certificados/s`);

  // ── Contraste ──────────────────────────────────────────────────────────────
  const minutosManual = studentIds.length * MINUTOS_MANUAL;
  titulo('CONTRASTE CON EL PROCEDIMIENTO MANUAL');
  fila('Procedimiento manual', `${MINUTOS_MANUAL} min × ${studentIds.length} = ${hhmm(minutosManual)}`);
  fila('UniBridge', `${dosDec(totalS)} s para los ${studentIds.length}`);
  fila('Jornadas de 8 h equivalentes', dosDec(minutosManual / 60 / 8));

  titulo('ALCANCE DE LA MEDICIÓN');
  say('  Se mide la emisión: desde que el lote se encola hasta que el último');
  say('  certificado queda generado y almacenado. No incluye el tiempo humano');
  say('  de seleccionar los estudiantes ni de revisar el resultado.');
  say('');
  say(`  Los ${MINUTOS_MANUAL} min del procedimiento manual son el dato declarado por la`);
  say('  responsable en la entrevista (Anexo A, pregunta 2) para el mejor caso,');
  say('  «cuando todo está en orden». El contraste es, por tanto, conservador.');

  // ── Evidencia ──────────────────────────────────────────────────────────────
  // El sello lleva la HORA, no solo el día. Con solo el día, dos corridas de
  // la misma jornada escribían el mismo archivo y la segunda borraba la
  // evidencia de la primera —justo lo que hay que conservar cuando se compara
  // un antes y un después—. La evidencia de una medición no se sobrescribe.
  const stamp = ahora.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const dirEv = path.join(__dirname, 'evidencia');
  fs.mkdirSync(dirEv, { recursive: true });
  const base = path.join(dirEv, `prueba-${studentIds.length}-${stamp}`);

  const resultado = {
    fecha: ahora.toISOString(),
    periodo: PERIODO,
    documentos: studentIds.length,
    completados: fin.completados,
    fallidos: fin.fallidos,
    encolado_ms: encoladoMs,
    total_s: +totalS.toFixed(2),
    ms_por_documento: Math.round(msPorDoc),
    docs_por_segundo: +(fin.completados / totalS).toFixed(2),
    concurrencia: 4,
    minutos_manual_por_certificado: MINUTOS_MANUAL,
    equivalente_manual_min: minutosManual,
    entorno: {
      cpu, nucleos: os.cpus().length,
      ram_gb: +(os.totalmem() / 1024 ** 3).toFixed(1),
      plataforma: `${os.platform()} ${os.release()}`,
      node: process.version,
    },
    serie,
  };

  titulo('EVIDENCIA GUARDADA');
  fs.writeFileSync(`${base}.json`, JSON.stringify(resultado, null, 2));
  fila('Datos', path.relative(path.join(__dirname, '..'), `${base}.json`));
  fila('Transcripción', path.relative(path.join(__dirname, '..'), `${base}.txt`));
  say('');
  fs.writeFileSync(`${base}.txt`, transcripcion.join('\n') + '\n');
})().catch((e) => {
  console.error('\n  ERROR:', e.response?.status || '', e.response?.data?.message || e.message, '\n');
  process.exit(1);
});
