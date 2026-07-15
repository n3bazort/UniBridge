import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/** Paleta del reporte, alineada con la identidad visual de UniBridge. */
const C = {
  ink: 'FF111827',
  slate: 'FF64748B',
  line: 'FFE5E9F0',
  blue: 'FF2563EB',
  blueSoft: 'FFEFF6FF',
  green: 'FF059669',
  amber: 'FFD97706',
  red: 'FFDC2626',
  white: 'FFFFFFFF',
  panel: 'FFF8FAFC',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizada',
  DELAYED: 'Atrasada',
  CANCELED: 'Cancelada',
  REJECTED: 'Rechazada',
};

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Reporte ejecutivo en XLSX: portada con KPIs, hojas de datos con gráficos
   * nativos de Excel y detalle completo. Los gráficos se inyectan como XML
   * OOXML porque ExcelJS todavía no expone una API de charts.
   */
  async generateDashboardReport(facultyId?: string): Promise<{ buffer: Buffer; filename: string }> {
    const where = facultyId ? { facultyId } : {};

    const [practices, periodRow] = await Promise.all([
      this.prisma.practice.findMany({
        where,
        include: {
          student: { include: { program: true, user: { select: { email: true } } } },
          company: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.academicPeriod.findFirst({ where: { isActive: true } }),
    ]);

    const docs = await this.prisma.generatedDocument.findMany({
      where: { status: 'VALID' },
      select: { documentType: true, signatureStatus: true, studentId: true },
    });

    // ── Agregaciones ──
    const total = practices.length;
    const byStatus = new Map<string, number>();
    const byCompany = new Map<string, { count: number; hours: number }>();
    const byProgram = new Map<string, number>();
    const byPeriod = new Map<string, number>();
    let totalHours = 0;

    for (const p of practices) {
      byStatus.set(p.status, (byStatus.get(p.status) || 0) + 1);
      const cName = p.company?.name || 'Sin empresa';
      const prev = byCompany.get(cName) || { count: 0, hours: 0 };
      byCompany.set(cName, { count: prev.count + 1, hours: prev.hours + (p.totalHours || 0) });
      const pgName = p.student?.program?.name || 'Sin programa';
      byProgram.set(pgName, (byProgram.get(pgName) || 0) + 1);
      const per = p.academicPeriod || 'Sin periodo';
      byPeriod.set(per, (byPeriod.get(per) || 0) + 1);
      totalHours += p.totalHours || 0;
    }

    const completed = byStatus.get('COMPLETED') || 0;
    const inProgress = byStatus.get('IN_PROGRESS') || 0;
    const alerts = (byStatus.get('DELAYED') || 0) + (byStatus.get('REJECTED') || 0);
    const completionRate = total > 0 ? completed / total : 0;
    const certs = docs.filter((d) => d.documentType === 'CERTIFICADO');
    const signedCerts = certs.filter((d) => d.signatureStatus === 'SIGNED').length;
    const inSignature = certs.filter((d) => d.signatureStatus === 'IN_SIGNING' || d.signatureStatus === 'PARTIALLY_SIGNED').length;
    const solicitudes = docs.filter((d) => d.documentType === 'SOLICITUD').length;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'UniBridge';
    wb.created = new Date();

    // ══════════ Hoja 1: Resumen Ejecutivo ══════════
    const s1 = wb.addWorksheet('Resumen Ejecutivo', {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    });
    s1.columns = [
      { width: 3 }, { width: 26 }, { width: 14 }, { width: 26 }, { width: 14 },
      { width: 26 }, { width: 14 }, { width: 3 },
    ];

    // Título
    s1.mergeCells('B2:G2');
    const title = s1.getCell('B2');
    title.value = 'Reporte de Prácticas Preprofesionales';
    title.font = { name: 'Calibri', size: 20, bold: true, color: { argb: C.ink } };
    s1.getRow(2).height = 30;

    s1.mergeCells('B3:G3');
    const sub = s1.getCell('B3');
    sub.value = `UniBridge · Periodo ${periodRow?.name || periodRow?.code || 'todos'} · Generado el ${new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    sub.font = { name: 'Calibri', size: 10.5, color: { argb: C.slate } };
    s1.getRow(3).height = 18;

    // Tarjetas KPI (2 filas x 3)
    const kpis = [
      { label: 'Prácticas totales', value: total, note: 'registros en el sistema', color: C.blue },
      { label: 'Tasa de culminación', value: completionRate, note: `${completed} de ${total} finalizadas`, color: C.green, pct: true },
      { label: 'Horas acumuladas', value: totalHours, note: 'suma de todas las prácticas', color: C.ink },
      { label: 'En curso', value: inProgress, note: 'prácticas activas ahora', color: C.blue },
      { label: 'Certificados firmados', value: signedCerts, note: `${inSignature} aún en circuito de firma`, color: C.green },
      { label: 'Alertas', value: alerts, note: 'atrasadas o rechazadas', color: alerts > 0 ? C.red : C.slate },
    ];

    let kr = 5;
    kpis.forEach((kpi, i) => {
      const col = 2 + (i % 3) * 2; // B, D, F
      if (i === 3) kr = 9;
      const labelCell = s1.getCell(kr, col);
      const valueCell = s1.getCell(kr + 1, col);
      const noteCell = s1.getCell(kr + 2, col);

      s1.mergeCells(kr, col, kr, col + 1);
      s1.mergeCells(kr + 1, col, kr + 1, col + 1);
      s1.mergeCells(kr + 2, col, kr + 2, col + 1);

      labelCell.value = kpi.label.toUpperCase();
      labelCell.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: C.slate } };
      labelCell.alignment = { vertical: 'middle', indent: 1 };

      valueCell.value = kpi.pct ? kpi.value : kpi.value;
      if (kpi.pct) valueCell.numFmt = '0%';
      else valueCell.numFmt = '#,##0';
      valueCell.font = { name: 'Calibri', size: 22, bold: true, color: { argb: kpi.color } };
      valueCell.alignment = { vertical: 'middle', indent: 1 };

      noteCell.value = kpi.note;
      noteCell.font = { name: 'Calibri', size: 8.5, color: { argb: C.slate } };
      noteCell.alignment = { vertical: 'middle', indent: 1 };

      // Panel visual de la tarjeta
      for (let r = kr; r <= kr + 2; r++) {
        for (let c = col; c <= col + 1; c++) {
          const cell = s1.getCell(r, c);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.panel } };
          cell.border = {
            top: r === kr ? { style: 'thin', color: { argb: C.line } } : undefined,
            bottom: r === kr + 2 ? { style: 'thin', color: { argb: C.line } } : undefined,
            left: c === col ? { style: 'thin', color: { argb: C.line } } : undefined,
            right: c === col + 1 ? { style: 'thin', color: { argb: C.line } } : undefined,
          };
        }
      }
      s1.getRow(kr).height = 16;
      s1.getRow(kr + 1).height = 30;
      s1.getRow(kr + 2).height = 14;
    });

    // Lectura guiada de los números
    s1.mergeCells('B13:G13');
    const readTitle = s1.getCell('B13');
    readTitle.value = 'Cómo leer este reporte';
    readTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: C.ink } };
    s1.getRow(13).height = 22;

    const insights = [
      `De ${total} prácticas registradas, ${completed} llegaron a término (${Math.round(completionRate * 100)}%) y ${inProgress} siguen en curso.`,
      `Se han emitido ${solicitudes} solicitudes y ${certs.length} certificados; ${signedCerts} ya cuentan con las dos firmas y ${inSignature} avanzan en el circuito.`,
      alerts > 0
        ? `Hay ${alerts} práctica(s) atrasada(s) o rechazada(s) que requieren atención — revisa la hoja "Detalle" filtrando por ese estado.`
        : 'No hay prácticas atrasadas ni rechazadas en este corte.',
      `Las ${Math.min(byCompany.size, 10)} empresas con mayor carga concentran el grueso de los estudiantes; el detalle está en la hoja "Empresas".`,
    ];
    insights.forEach((text, i) => {
      const r = 14 + i;
      s1.mergeCells(`B${r}:G${r}`);
      const cell = s1.getCell(`B${r}`);
      cell.value = `•  ${text}`;
      cell.font = { name: 'Calibri', size: 10, color: { argb: C.ink } };
      cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
      s1.getRow(r).height = 17;
    });

    // ══════════ Hoja 2: Estados (con gráfico de pastel) ══════════
    const s2 = wb.addWorksheet('Estados', { views: [{ showGridLines: false }] });
    s2.columns = [{ width: 3 }, { width: 22 }, { width: 12 }, { width: 12 }];
    this.sheetTitle(s2, 'B2', 'Distribución por estado');
    this.tableHeader(s2, 4, ['Estado', 'Prácticas', '% del total']);

    const statusRows = Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1]);
    statusRows.forEach(([status, count], i) => {
      const r = 5 + i;
      s2.getCell(r, 2).value = STATUS_LABEL[status] || status;
      s2.getCell(r, 3).value = count;
      s2.getCell(r, 4).value = total > 0 ? count / total : 0;
      s2.getCell(r, 4).numFmt = '0.0%';
      this.styleDataRow(s2, r, 2, 4);
    });
    const statusEnd = 4 + statusRows.length;
    s2.addConditionalFormatting({
      ref: `C5:C${statusEnd}`,
      rules: [this.dataBarRule(C.blue)],
    });

    // ══════════ Hoja 3: Empresas (con gráfico de barras) ══════════
    const s3 = wb.addWorksheet('Empresas', { views: [{ showGridLines: false }] });
    s3.columns = [{ width: 3 }, { width: 40 }, { width: 12 }, { width: 12 }, { width: 14 }];
    this.sheetTitle(s3, 'B2', 'Carga por empresa');
    this.tableHeader(s3, 4, ['Empresa', 'Estudiantes', '% del total', 'Horas']);

    const companyRows = Array.from(byCompany.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);
    companyRows.forEach(([name, v], i) => {
      const r = 5 + i;
      s3.getCell(r, 2).value = name;
      s3.getCell(r, 3).value = v.count;
      s3.getCell(r, 4).value = total > 0 ? v.count / total : 0;
      s3.getCell(r, 4).numFmt = '0.0%';
      s3.getCell(r, 5).value = v.hours;
      s3.getCell(r, 5).numFmt = '#,##0';
      this.styleDataRow(s3, r, 2, 5);
    });
    const companyEnd = 4 + companyRows.length;
    s3.addConditionalFormatting({
      ref: `C5:C${companyEnd}`,
      rules: [this.dataBarRule(C.green)],
    });

    // ══════════ Hoja 4: Programas y Periodos ══════════
    const s4 = wb.addWorksheet('Programas y Periodos', { views: [{ showGridLines: false }] });
    s4.columns = [{ width: 3 }, { width: 34 }, { width: 12 }, { width: 4 }, { width: 20 }, { width: 12 }];
    this.sheetTitle(s4, 'B2', 'Distribución académica');
    this.tableHeader(s4, 4, ['Programa', 'Prácticas']);

    const programRows = Array.from(byProgram.entries()).sort((a, b) => b[1] - a[1]);
    programRows.forEach(([name, count], i) => {
      const r = 5 + i;
      s4.getCell(r, 2).value = name;
      s4.getCell(r, 3).value = count;
      this.styleDataRow(s4, r, 2, 3);
    });
    const programEnd = 4 + programRows.length;
    s4.addConditionalFormatting({
      ref: `C5:C${programEnd}`,
      rules: [this.dataBarRule(C.blue)],
    });

    // Tabla de periodos al costado
    const ph = s4.getCell(4, 5);
    ph.value = 'Periodo';
    const ph2 = s4.getCell(4, 6);
    ph2.value = 'Prácticas';
    [ph, ph2].forEach((c) => {
      c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ink } };
      c.alignment = { vertical: 'middle', indent: 1 };
    });
    const periodRows = Array.from(byPeriod.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    periodRows.forEach(([per, count], i) => {
      const r = 5 + i;
      s4.getCell(r, 5).value = per;
      s4.getCell(r, 6).value = count;
      this.styleDataRow(s4, r, 5, 6);
    });

    // ══════════ Hoja 5: Detalle ══════════
    const s5 = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    s5.columns = [
      { width: 3 }, { width: 12 }, { width: 28 }, { width: 30 }, { width: 30 },
      { width: 14 }, { width: 9 }, { width: 14 }, { width: 12 },
    ];
    this.sheetTitle(s5, 'B2', `Detalle de prácticas (${total} registros)`);
    this.tableHeader(s5, 4, ['Cédula', 'Estudiante', 'Programa', 'Empresa', 'Estado', 'Horas', 'Tutor', 'Periodo']);

    practices.forEach((p, i) => {
      const r = 5 + i;
      s5.getCell(r, 2).value = p.student?.dni || '—';
      s5.getCell(r, 3).value = `${p.student?.firstName || ''} ${p.student?.lastName || ''}`.trim() || '—';
      s5.getCell(r, 4).value = p.student?.program?.name || '—';
      s5.getCell(r, 5).value = p.company?.name || 'Sin empresa';
      s5.getCell(r, 6).value = STATUS_LABEL[p.status] || p.status;
      s5.getCell(r, 7).value = p.totalHours || 0;
      s5.getCell(r, 8).value = p.tutorName || '—';
      s5.getCell(r, 9).value = p.academicPeriod || '—';
      this.styleDataRow(s5, r, 2, 9);

      // El estado se colorea para escanear la tabla de un vistazo
      const stCell = s5.getCell(r, 6);
      const color = p.status === 'COMPLETED' ? C.green : p.status === 'IN_PROGRESS' ? C.blue : p.status === 'DELAYED' || p.status === 'REJECTED' ? C.red : C.slate;
      stCell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: color } };
    });
    s5.autoFilter = { from: { row: 4, column: 2 }, to: { row: 4 + practices.length, column: 9 } };

    // Gráficos nativos de Excel (post-proceso del XML)
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const withCharts = await this.injectCharts(buffer, {
      statusCount: statusRows.length,
      companyCount: companyRows.length,
      programCount: programRows.length,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return { buffer: withCharts, filename: `UniBridge_Reporte_${stamp}.xlsx` };
  }

  // ── Helpers de estilo ──

  /** Barra de datos dentro de la celda. ExcelJS exige los cfvo min/max. */
  private dataBarRule(argb: string): any {
    return {
      type: 'dataBar',
      priority: 1,
      color: { argb },
      cfvo: [{ type: 'min' }, { type: 'max' }],
      showValue: true,
      gradient: false,
    };
  }

  private sheetTitle(ws: ExcelJS.Worksheet, cellRef: string, text: string) {
    const cell = ws.getCell(cellRef);
    cell.value = text;
    cell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: C.ink } };
    ws.getRow(Number(cellRef.replace(/\D/g, ''))).height = 24;
  }

  private tableHeader(ws: ExcelJS.Worksheet, row: number, labels: string[]) {
    labels.forEach((label, i) => {
      const cell = ws.getCell(row, 2 + i);
      cell.value = label;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ink } };
      cell.alignment = { vertical: 'middle', indent: 1 };
    });
    ws.getRow(row).height = 20;
  }

  private styleDataRow(ws: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number) {
    for (let c = fromCol; c <= toCol; c++) {
      const cell = ws.getCell(row, c);
      if (!cell.font) cell.font = { name: 'Calibri', size: 9.5, color: { argb: C.ink } };
      cell.alignment = { vertical: 'middle', indent: 1 };
      cell.border = { bottom: { style: 'hair', color: { argb: C.line } } };
    }
    ws.getRow(row).height = 16;
  }

  /**
   * ExcelJS no genera charts, así que se inyectan directamente en el paquete
   * OOXML: cada gráfico es un chart{n}.xml + su drawing, referenciados desde
   * la hoja. El resultado son gráficos nativos, editables en Excel.
   */
  private async injectCharts(
    buffer: Buffer,
    counts: { statusCount: number; companyCount: number; programCount: number },
  ): Promise<Buffer> {
    const JSZipMod = require('jszip');
    const zip = await JSZipMod.loadAsync(buffer);

    const charts = [
      {
        id: 1,
        sheetFile: 'sheet2.xml',
        sheetName: 'Estados',
        type: 'pie' as const,
        title: 'Prácticas por estado',
        catRef: `Estados!$B$5:$B$${4 + counts.statusCount}`,
        valRef: `Estados!$C$5:$C$${4 + counts.statusCount}`,
        n: counts.statusCount,
        anchor: { fromCol: 5, fromRow: 3, toCol: 13, toRow: 21 },
      },
      {
        id: 2,
        sheetFile: 'sheet3.xml',
        sheetName: 'Empresas',
        type: 'bar' as const,
        title: 'Top empresas por estudiantes',
        catRef: `Empresas!$B$5:$B$${4 + counts.companyCount}`,
        valRef: `Empresas!$C$5:$C$${4 + counts.companyCount}`,
        n: counts.companyCount,
        anchor: { fromCol: 6, fromRow: 3, toCol: 16, toRow: 25 },
      },
      {
        id: 3,
        sheetFile: 'sheet4.xml',
        sheetName: 'Programas y Periodos',
        type: 'col' as const,
        title: 'Prácticas por programa',
        catRef: `'Programas y Periodos'!$B$5:$B$${4 + counts.programCount}`,
        valRef: `'Programas y Periodos'!$C$5:$C$${4 + counts.programCount}`,
        n: counts.programCount,
        anchor: { fromCol: 7, fromRow: 3, toCol: 16, toRow: 22 },
      },
    ];

    for (const ch of charts) {
      if (ch.n === 0) continue;
      zip.file(`xl/charts/chart${ch.id}.xml`, this.chartXml(ch));
      zip.file(`xl/drawings/drawing${ch.id}.xml`, this.drawingXml(ch.id, ch.anchor));
      zip.file(
        `xl/drawings/_rels/drawing${ch.id}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${ch.id}.xml"/></Relationships>`,
      );

      // Enlazar el drawing con su hoja
      const sheetPath = `xl/worksheets/${ch.sheetFile}`;
      const relsPath = `xl/worksheets/_rels/${ch.sheetFile}.rels`;
      let sheetXml = await zip.file(sheetPath)?.async('string');
      if (!sheetXml) continue;

      const relsFile = zip.file(relsPath);
      const rId = `rIdChart${ch.id}`;
      if (relsFile) {
        let relsXml = await relsFile.async('string');
        relsXml = relsXml.replace(
          '</Relationships>',
          `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${ch.id}.xml"/></Relationships>`,
        );
        zip.file(relsPath, relsXml);
      } else {
        zip.file(
          relsPath,
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${ch.id}.xml"/></Relationships>`,
        );
      }

      if (!sheetXml.includes('<drawing ')) {
        sheetXml = sheetXml.replace('</worksheet>', `<drawing r:id="${rId}"/></worksheet>`);
        zip.file(sheetPath, sheetXml);
      }

      // Declarar el content-type del chart
      const ctPath = '[Content_Types].xml';
      let ct = await zip.file(ctPath)?.async('string');
      if (ct && !ct.includes(`/xl/charts/chart${ch.id}.xml`)) {
        ct = ct.replace(
          '</Types>',
          `<Override PartName="/xl/charts/chart${ch.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing${ch.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`,
        );
        zip.file(ctPath, ct);
      }
    }

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  private chartXml(ch: { type: 'pie' | 'bar' | 'col'; title: string; catRef: string; valRef: string; n: number }): string {
    const palette = ['2563EB', '059669', 'D97706', 'DC2626', '7C3AED', '0891B2', 'DB2777', '65A30D'];
    const dPts =
      ch.type === 'pie'
        ? Array.from({ length: ch.n })
            .map(
              (_, i) =>
                `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${palette[i % palette.length]}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`,
            )
            .join('')
        : '';

    const seriesSpPr =
      ch.type === 'pie' ? '' : `<c:spPr><a:solidFill><a:srgbClr val="2563EB"/></a:solidFill></c:spPr>`;

    const plot =
      ch.type === 'pie'
        ? `<c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${dPts}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls><c:cat><c:strRef><c:f>${ch.catRef}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${ch.valRef}</c:f></c:numRef></c:val></c:ser><c:firstSliceAng val="0"/></c:pieChart>`
        : `<c:barChart><c:barDir val="${ch.type === 'bar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/>${seriesSpPr}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls><c:cat><c:strRef><c:f>${ch.catRef}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${ch.valRef}</c:f></c:numRef></c:val></c:ser><c:gapWidth val="60"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart><c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${ch.type === 'bar' ? 'l' : 'b'}"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="800"/></a:pPr><a:endParaRPr lang="es-EC"/></a:p></c:txPr><c:crossAx val="222222222"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${ch.type === 'bar' ? 'b' : 'l'}"/><c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="E5E9F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="800"/></a:pPr><a:endParaRPr lang="es-EC"/></a:p></c:txPr><c:crossAx val="111111111"/></c:valAx>`;

    const legend = ch.type === 'pie' ? `<c:legend><c:legendPos val="r"/><c:overlay val="0"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="es-EC"/></a:p></c:txPr></c:legend>` : '';

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"><a:solidFill><a:srgbClr val="111827"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="es-EC" sz="1200" b="1"/><a:t>${ch.title}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="E5E9F0"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
  }

  private drawingXml(id: number, a: { fromCol: number; fromRow: number; toCol: number; toRow: number }): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>${a.fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${a.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id + 10}" name="Chart ${id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
  }
}
