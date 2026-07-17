/**
 * Crea (o restablece la contraseña de) la cuenta de administrador raíz.
 *
 * El correo DEBE estar en ROOT_ADMIN_EMAILS del .env — de lo contrario la
 * cuenta no tendría privilegio root aunque exista.
 *
 * Uso:
 *   node create-root.js <correo> <contraseña>
 *   node create-root.js                         (usa valores por defecto)
 */
const fs = require('fs');
const path = require('path');

// Cargar DATABASE_URL del .env de la base
const dbEnv = fs.readFileSync(path.resolve(__dirname, '../../packages/db/.env'), 'utf8');
process.env.DATABASE_URL = dbEnv.match(/DATABASE_URL="?([^"\n]+)"?/)[1];

// Leer ROOT_ADMIN_EMAILS del .env de la API
let rootEmails = [];
try {
  const apiEnv = fs.readFileSync(path.resolve(__dirname, '.env'), 'utf8');
  const m = apiEnv.match(/ROOT_ADMIN_EMAILS="?([^"\n]+)"?/);
  if (m) rootEmails = m[1].split(',').map((e) => e.trim().toLowerCase());
} catch {}

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

const email = (process.argv[2] || 'rootdev@uleam.edu.ec').toLowerCase();
const password = process.argv[3] || 'RootDev#2026Seguro';

(async () => {
  if (!rootEmails.includes(email)) {
    console.error(`\n⚠  ADVERTENCIA: ${email} NO está en ROOT_ADMIN_EMAILS del .env.`);
    console.error(`   La cuenta se creará como ADMIN normal, sin privilegio root.`);
    console.error(`   Añade el correo a ROOT_ADMIN_EMAILS y reinicia la API.\n`);
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hashed, role: 'ADMIN', suspendedAt: null, deletedAt: null },
    create: { email, password: hashed, role: 'ADMIN' },
  });

  console.log('\n✓ Cuenta root lista');
  console.log('  Correo:     ', user.email);
  console.log('  Contraseña: ', password);
  console.log('  Root real:  ', rootEmails.includes(email) ? 'SÍ (privilegio total)' : 'NO — falta en ROOT_ADMIN_EMAILS');
  console.log('\n  Cambia la contraseña tras el primer ingreso.\n');
  await prisma.$disconnect();
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
