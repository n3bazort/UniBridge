/**
 * E2E del circuito de firma digital.
 *
 * Requiere la stack de desarrollo levantada (docker compose up -d: postgres,
 * redis y minio) y la BD con `prisma db push` + seed aplicados.
 * Ejecutar con: npm run test:e2e -w @ppp/api
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

// PDF mínimo con marcadores de firma digital (suficiente para la verificación ligera)
const SIGNED_PDF = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Sig /SubFilter /ETSI.CAdES.detached /ByteRange [0 1 2 3] >>\nendobj\n%%EOF',
  'latin1',
);
const UNSIGNED_PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF', 'latin1');

describe('Circuito de firma digital (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let deanToken: string;
  let directorToken: string;
  let studentToken: string;

  const login = async (email: string, password: string) => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.access_token || res.body.accessToken;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    adminToken = await login('admin@uleam.edu.ec', '@adminadmin007');
    deanToken = await login('decano@uleam.edu.ec', '@adminadmin007');
    directorToken = await login('director@uleam.edu.ec', '@adminadmin007');
    studentToken = await login('student@uleam.edu.ec', '@adminadmin007');
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  describe('Gestión de firmantes (ADMIN)', () => {
    it('lista los firmantes seed', async () => {
      const res = await request(app.getHttpServer())
        .get('/signatures/signers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const roles = res.body.map((s: any) => s.signerRole);
      expect(roles).toEqual(expect.arrayContaining(['DEAN', 'DIRECTOR']));
    });

    it('rechaza la gestión de firmantes a un estudiante', async () => {
      await request(app.getHttpServer())
        .get('/signatures/signers')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('genera una invitación con link y token', async () => {
      const res = await request(app.getHttpServer())
        .post('/signatures/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ signerRole: 'DEAN' })
        .expect(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.link).toContain('/signer-register?token=');
    });

    it('valida el token de una invitación (endpoint público)', async () => {
      const inv = await request(app.getHttpServer())
        .post('/signatures/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ signerRole: 'DIRECTOR', email: 'nuevo.director@uleam.edu.ec' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/signatures/invitations/validate')
        .query({ token: inv.body.token })
        .expect(200);
      expect(res.body.signerRole).toBe('DIRECTOR');
      expect(res.body.email).toBe('nuevo.director@uleam.edu.ec');
    });

    it('rechaza un token de invitación inexistente', async () => {
      await request(app.getHttpServer())
        .get('/signatures/invitations/validate')
        .query({ token: 'token-invalido' })
        .expect(404);
    });
  });

  describe('Lotes de firma', () => {
    let batchId: string;
    let documentCode: string;

    it('el admin crea un lote con un documento generado', async () => {
      // Toma un documento generado existente (o genera uno si hay template+student)
      const docs = await request(app.getHttpServer())
        .get('/generated-documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const candidate = docs.body.find(
        (d: any) => d.status === 'VALID' && (!d.signatureStatus || d.signatureStatus === 'NONE'),
      );
      if (!candidate) {
        console.warn('No hay documentos generados disponibles; genera uno antes de correr este spec.');
        return;
      }

      const res = await request(app.getHttpServer())
        .post('/signatures/batches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ documentIds: [candidate.id], name: 'Lote e2e' })
        .expect(201);

      batchId = res.body.id;
      documentCode = candidate.documentCode;
      expect(res.body.status).toBe('PENDING_DEAN');
      expect(res.body.items).toHaveLength(1);
    });

    it('el decano ve el lote pendiente; el director todavía no', async () => {
      if (!batchId) return;
      const deanRes = await request(app.getHttpServer())
        .get('/signatures/batches/pending')
        .set('Authorization', `Bearer ${deanToken}`)
        .expect(200);
      expect(deanRes.body.some((b: any) => b.id === batchId)).toBe(true);

      const dirRes = await request(app.getHttpServer())
        .get('/signatures/batches/pending')
        .set('Authorization', `Bearer ${directorToken}`)
        .expect(200);
      expect(dirRes.body.some((b: any) => b.id === batchId)).toBe(false);
    });

    it('rechaza la subida de un PDF sin firma digital', async () => {
      if (!batchId || !documentCode) return;
      const res = await request(app.getHttpServer())
        .post(`/signatures/batches/${batchId}/upload`)
        .set('Authorization', `Bearer ${deanToken}`)
        .attach('files', UNSIGNED_PDF, `${documentCode}.pdf`)
        .expect(201);
      expect(res.body.failed).toBe(1);
      expect(res.body.results[0].error).toMatch(/firma digital/);
    });

    it('acepta el PDF firmado del decano y avanza el lote al director', async () => {
      if (!batchId || !documentCode) return;
      const res = await request(app.getHttpServer())
        .post(`/signatures/batches/${batchId}/upload`)
        .set('Authorization', `Bearer ${deanToken}`)
        .attach('files', SIGNED_PDF, `${documentCode}-signed.pdf`)
        .expect(201);
      expect(res.body.uploaded).toBe(1);
      expect(res.body.batchStatus).toBe('PENDING_DIRECTOR');
    });

    it('el director sube su firma y el lote se completa', async () => {
      if (!batchId || !documentCode) return;
      const res = await request(app.getHttpServer())
        .post(`/signatures/batches/${batchId}/upload`)
        .set('Authorization', `Bearer ${directorToken}`)
        .attach('files', SIGNED_PDF, `${documentCode}-signed.pdf`)
        .expect(201);
      expect(res.body.uploaded).toBe(1);
      expect(res.body.batchStatus).toBe('COMPLETED');
    });

    it('el documento queda SIGNED y visible en el detalle del lote', async () => {
      if (!batchId) return;
      const res = await request(app.getHttpServer())
        .get(`/signatures/batches/${batchId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.items[0].status).toBe('SIGNED');
    });
  });

  describe('Permisos de descarga', () => {
    it('un estudiante no puede descargar documentos de otro estudiante', async () => {
      const docs = await request(app.getHttpServer())
        .get('/generated-documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      if (docs.body.length === 0) return;

      // El estudiante seed intenta descargar el primer documento del sistema;
      // si no es suyo, debe recibir 403.
      const myDocs = await request(app.getHttpServer())
        .get('/generated-documents/me')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);
      const foreign = docs.body.find((d: any) => !myDocs.body.some((m: any) => m.id === d.id));
      if (!foreign) return;

      await request(app.getHttpServer())
        .get(`/generated-documents/${foreign.id}/download`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('sin token no se puede descargar nada', async () => {
      await request(app.getHttpServer())
        .get('/generated-documents/00000000-0000-0000-0000-000000000000/download')
        .expect(401);
    });
  });
});
