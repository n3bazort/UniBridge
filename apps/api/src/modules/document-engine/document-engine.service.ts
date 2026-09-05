import { Injectable, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { PdfDriver, KonvaTemplateJson } from './pdf.driver';
import { DocxDriver } from './docx.driver';
import { MinioService } from '../minio/minio.service';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Rutas donde suele vivir LibreOffice (usado para convertir DOCX → PDF). */
const SOFFICE_CANDIDATES = [
  process.env.LIBREOFFICE_PATH,
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
].filter(Boolean) as string[];

@Injectable()
export class DocumentEngineService implements OnModuleInit {
  private readonly logger = new Logger(DocumentEngineService.name);
  /** Ruta de soffice resuelta una sola vez (la búsqueda toca disco). */
  private sofficePath: string | null | undefined;

  /** Cuánto se reutiliza un fondo ya descargado. Ver `conFondoIncrustado`. */
  private static readonly VIGENCIA_FONDO_MS = 5 * 60 * 1000;
  /** Fondos ya traídos del almacenamiento, indexados por su referencia. */
  private readonly fondos = new Map<string, { dataUri: string; traidoEn: number }>();

  constructor(
    private readonly pdfDriver: PdfDriver,
    private readonly docxDriver: DocxDriver,
    private readonly minioService: MinioService
  ) {}

  /**
   * Precalienta LibreOffice al arrancar la API.
   *
   * El primer `soffice` de cada arranque paga ~16 s (crea el perfil de
   * usuario y carga sus librerías); los siguientes bajan a ~6 s. Sin esto,
   * ese costo lo pagaba el primer oficio que alguien pidiera en PDF, que
   * además es cuando hay alguien esperando en pantalla.
   *
   * Corre en segundo plano a propósito: si falla o LibreOffice no está
   * instalado, la API arranca igual y el error real aparecerá al convertir.
   */
  onModuleInit(): void {
    const soffice = this.findSoffice();
    if (!soffice) {
      this.logger.warn('LibreOffice no encontrado: la generación de oficios en PDF no estará disponible');
      return;
    }
    this.limpiarCerrojoHuerfano();
    void this.prewarm(soffice);
  }

  /**
   * Borra el cerrojo que LibreOffice deja en su perfil si lo matan a medias.
   *
   * Cuando el servidor se detiene de golpe durante una conversión, queda un
   * `.lock` en el directorio de perfil y **todas** las conversiones posteriores
   * fallan, aunque LibreOffice esté perfectamente instalado. El síntoma es
   * desconcertante: la emisión en Word sigue funcionando y solo el PDF revienta
   * con un error genérico, así que conviene descartarlo al arrancar.
   *
   * Es seguro hacerlo aquí: el perfil lo usa en exclusiva este servicio, y si
   * la API está arrancando es que no hay ninguna conversión suya en curso.
   */
  private limpiarCerrojoHuerfano(): void {
    const cerrojo = path.join(os.tmpdir(), 'soffice_profile', '.lock');
    try {
      if (fs.existsSync(cerrojo)) {
        fs.unlinkSync(cerrojo);
        this.logger.log('Se retiró un cerrojo huérfano de LibreOffice de un cierre anterior');
      }
    } catch (e: any) {
      this.logger.warn(`No se pudo retirar el cerrojo de LibreOffice: ${e?.message || e}`);
    }
  }

  private async prewarm(soffice: string): Promise<void> {
    const inicio = Date.now();
    try {
      const dir = path.join(os.tmpdir(), 'unibridge-docs');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // Un .txt mínimo basta: lo que se quiere es que LibreOffice cree el
      // perfil y cargue sus librerías, no convertir nada útil.
      const semilla = path.join(dir, `prewarm-${crypto.randomUUID()}.txt`);
      fs.writeFileSync(semilla, 'prewarm');
      await execFileAsync(soffice, [...this.sofficeBaseArgs(), '--convert-to', 'pdf', '--outdir', dir, semilla], {
        timeout: 120_000,
        windowsHide: true,
      });
      for (const f of [semilla, semilla.replace(/\.txt$/, '.pdf')]) {
        try { fs.unlinkSync(f); } catch {}
      }
      this.logger.log(`LibreOffice precalentado en ${Math.round((Date.now() - inicio) / 1000)}s`);
    } catch (e: any) {
      this.logger.warn(`No se pudo precalentar LibreOffice: ${e?.message || e}`);
    }
  }

  /** Banderas comunes: sin wizards, sin splash, sin locks de perfil. */
  private sofficeBaseArgs(): string[] {
    const profileDir = path.join(os.tmpdir(), 'soffice_profile');
    if (!fs.existsSync(profileDir)) {
      try { fs.mkdirSync(profileDir, { recursive: true }); } catch {}
    }
    return [
      `-env:UserInstallation=file:///${profileDir.replace(/\\/g, '/')}`,
      '--headless',
      '--norestore',
      '--nofirststartwizard',
      '--nologo',
      '--nodefault',
    ];
  }

  /** Localiza el binario de LibreOffice; null si no está instalado. */
  private findSoffice(): string | null {
    if (this.sofficePath !== undefined) return this.sofficePath;
    this.sofficePath = null;
    for (const candidate of SOFFICE_CANDIDATES) {
      try {
        if (fs.existsSync(candidate)) { this.sofficePath = candidate; break; }
      } catch {}
    }
    return this.sofficePath;
  }

  /**
   * Convierte varios DOCX a PDF en UN solo arranque de LibreOffice.
   *
   * Arrancar `soffice` cuesta ~6 s aunque el documento sea trivial; convertir
   * en sí apenas suma. Por eso emitir N oficios uno por uno costaba N×6 s,
   * mientras que pasarlos todos juntos paga el arranque una sola vez.
   * Medido con 4 oficios reales: 14,6 s en lote contra ~26 s por separado.
   *
   * Todos los archivos deben vivir en el mismo directorio (LibreOffice
   * escribe los PDF en un único `--outdir`).
   */
  async convertDocxToPdfBatch(docxPaths: string[]): Promise<string[]> {
    if (docxPaths.length === 0) return [];

    const soffice = this.findSoffice();
    if (!soffice) {
      throw new BadRequestException(
        'No se puede generar la solicitud en PDF: el servidor no tiene LibreOffice instalado (necesario para la conversión). Genera el DOCX o instala LibreOffice.',
      );
    }

    const outDir = path.dirname(docxPaths[0]);
    const inicio = Date.now();

    await execFileAsync(
      soffice,
      [...this.sofficeBaseArgs(), '--convert-to', 'pdf', '--outdir', outDir, ...docxPaths],
      {
        // El límite crece con el lote: 2 min de base más 30 s por documento.
        timeout: 120_000 + docxPaths.length * 30_000,
        windowsHide: true,
      },
    );

    const pdfPaths = docxPaths.map((d) => d.replace(/\.docx$/i, '.pdf'));
    const faltantes = pdfPaths.filter((p) => !fs.existsSync(p));
    if (faltantes.length > 0) {
      throw new BadRequestException(
        `La conversión a PDF no produjo ${faltantes.length} de ${pdfPaths.length} archivo(s) esperado(s)`,
      );
    }

    this.logger.log(
      `${pdfPaths.length} DOCX convertido(s) a PDF en ${Math.round((Date.now() - inicio) / 1000)}s (un solo arranque)`,
    );
    return pdfPaths;
  }

  /**
   * Convierte un DOCX a PDF con LibreOffice headless. Devuelve la ruta del
   * PDF generado. Lanza un error claro si LibreOffice no está disponible.
   */
  async convertDocxToPdf(docxPath: string): Promise<string> {
    const [pdfPath] = await this.convertDocxToPdfBatch([docxPath]);
    return pdfPath;
  }

  /**
   * Genera el documento y lo sube a MinIO.
   * @param objectKey key único destino en el bucket (ej. "2026-1/CERTIFICADO/CERT-2026-1-00042.pdf")
   * @param options.convertToPdf para DOCX: entrega un PDF (vía LibreOffice)
   * @returns objectKey almacenado
   */
  async generateDocument(
    type: 'PDF' | 'DOCX',
    templateContent: any,
    data: Record<string, any>,
    objectKey: string,
    options?: { convertToPdf?: boolean },
  ): Promise<string> {

    // El PDF no pasa por el disco: pdf-lib devuelve los bytes y se suben tal
    // cual. Antes se escribía un temporal, se volvía a leer entero para
    // subirlo y se borraba: tres operaciones de disco por documento.
    if (type === 'PDF') {
      const tpl = await this.conFondoIncrustado(templateContent as KonvaTemplateJson);
      const pdfBytes = await this.pdfDriver.generatePdf(tpl, data);
      return this.minioService.uploadBuffer(Buffer.from(pdfBytes), objectKey, 'application/pdf');
    }

    if (type !== 'DOCX') {
      throw new BadRequestException('Tipo de documento no soportado');
    }

    // El DOCX sí necesita un archivo: la plantilla se rellena escribiendo en
    // disco y LibreOffice, cuando hay que convertir, solo sabe leer rutas.
    const outputDir = path.join(os.tmpdir(), 'unibridge-docs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Nombre temporal aleatorio para evitar colisiones entre jobs concurrentes
    const outputPath = path.join(outputDir, `${crypto.randomUUID()}.docx`);

    // Las plantillas DOCX viven en MinIO (key "templates/..."); las antiguas
    // pueden seguir siendo rutas del filesystem local (compatibilidad).
    // El content puede ser un string (key/ruta) o un objeto { path, ... }
    // con la configuración de numeración.
    const docxPath: string = typeof templateContent === 'string'
      ? templateContent
      : templateContent?.path || '';
    const source = docxPath.startsWith('templates/')
      ? await this.minioService.getObjectBuffer(docxPath)
      : docxPath;
    await this.docxDriver.generateDocx(source, data, outputPath);

    // Opcional: entregar la solicitud como PDF (mismo contenido, otro formato)
    if (options?.convertToPdf) {
      const pdfPath = await this.convertDocxToPdf(outputPath);
      try { fs.unlinkSync(outputPath); } catch {}
      const storedKeyPdf = await this.minioService.uploadFile(pdfPath, objectKey, 'application/pdf');
      try { fs.unlinkSync(pdfPath); } catch {}
      return storedKeyPdf;
    }

    const storedKey = await this.minioService.uploadFile(
      outputPath,
      objectKey,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    try {
      fs.unlinkSync(outputPath);
    } catch (e) {
      console.error('Error cleaning up temp file', e);
    }

    return storedKey;
  }

  /**
   * Devuelve la plantilla con su imagen de fondo ya incrustada como data URI.
   *
   * El fondo se guarda aparte, en el almacenamiento de objetos, pero pdf-lib
   * lo necesita incrustado. Traerlo y codificarlo a base64 cuesta lo mismo
   * para el primer certificado que para el número ciento veinticuatro, y en
   * una emisión masiva todos comparten plantilla: sin caché, el mismo archivo
   * se descargaba y se codificaba una vez por documento para desecharlo acto
   * seguido.
   *
   * La caché se indexa por la referencia del fondo y caduca a los cinco
   * minutos. Ese límite existe para que reemplazar el fondo de una plantilla
   * se vea sin reiniciar la API: dentro de un lote, que dura mucho menos, el
   * archivo se trae una sola vez.
   */
  private async conFondoIncrustado(tpl: KonvaTemplateJson): Promise<KonvaTemplateJson> {
    const bg = (tpl as any)?.background;
    if (typeof bg !== 'string' || !bg || bg.startsWith('data:image')) return tpl;

    const enCache = this.fondos.get(bg);
    if (enCache && Date.now() - enCache.traidoEn < DocumentEngineService.VIGENCIA_FONDO_MS) {
      return { ...tpl, background: enCache.dataUri };
    }

    try {
      const keyMatch = bg.match(/(templates\/backgrounds\/[^\?#]+)/);
      const key = keyMatch ? keyMatch[1] : (bg.startsWith('templates/') ? bg : null);

      let buf: Buffer | null = null;
      if (key) {
        buf = await this.minioService.getObjectBuffer(key);
      } else if (bg.startsWith('http')) {
        const resp = await fetch(bg);
        if (resp.ok) buf = Buffer.from(await resp.arrayBuffer());
      }

      if (!buf) return tpl;

      const extMatch = (key || bg).match(/\.(jpg|jpeg|png|webp|gif)$/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
      const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
      const dataUri = `data:${mime};base64,${buf.toString('base64')}`;

      this.fondos.set(bg, { dataUri, traidoEn: Date.now() });
      return { ...tpl, background: dataUri };
    } catch (e: any) {
      // Un fondo que no carga degrada el documento, no lo impide: el
      // certificado sale sin membrete antes que no salir.
      this.logger.error(`No se pudo cargar el fondo para el PDF: ${e?.message || e}`);
      return tpl;
    }
  }
}
