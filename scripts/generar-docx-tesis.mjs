import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle,
  ShadingType, convertInchesToTwip, TableLayoutType, VerticalAlign
} from "docx";
import * as fs from "fs";

// ── APA Style Constants ──
const FONT = "Times New Roman";
const FONT_SIZE = 24; // 12pt
const FONT_SIZE_SMALL = 20; // 10pt
const LINE_SPACING = 480; // double spacing
const LINE_SPACING_SINGLE = 240;
const INDENT = convertInchesToTwip(0.5);

// Colors
const HEADING_COLOR = "000000";
const TABLE_HEADER_BG = "2E4057";
const TABLE_HEADER_TEXT = "FFFFFF";
const TABLE_ALT_ROW = "F0F4F8";
const NOTE_BG = "FFF8E1";

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 240 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        font: FONT,
        size: 28,
        bold: true,
        color: HEADING_COLOR,
      }),
    ],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    alignment: AlignmentType.LEFT,
    spacing: { before: 360, after: 200 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: FONT_SIZE,
        bold: true,
        color: HEADING_COLOR,
      }),
    ],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    alignment: AlignmentType.LEFT,
    spacing: { before: 280, after: 160 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: FONT_SIZE,
        bold: true,
        italics: true,
        color: HEADING_COLOR,
      }),
    ],
  });
}

function bodyParagraph(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: LINE_SPACING, after: 120 },
    indent: opts.noIndent ? {} : { firstLine: INDENT },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: FONT_SIZE,
      }),
    ],
  });
}

function bulletItem(textParts) {
  const runs = textParts.map(
    (p) =>
      new TextRun({
        text: p.text,
        font: FONT,
        size: FONT_SIZE,
        bold: p.bold || false,
        italics: p.italics || false,
      })
  );
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: LINE_SPACING, after: 80 },
    indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
    children: [
      new TextRun({ text: "•  ", font: FONT, size: FONT_SIZE }),
      ...runs,
    ],
  });
}

function noteParagraph(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: LINE_SPACING_SINGLE, after: 120 },
    indent: { left: convertInchesToTwip(0.5), right: convertInchesToTwip(0.5) },
    shading: { type: ShadingType.CLEAR, fill: NOTE_BG },
    children: [
      new TextRun({ text: "Nota: ", font: FONT, size: FONT_SIZE_SMALL, bold: true, italics: true }),
      new TextRun({ text, font: FONT, size: FONT_SIZE_SMALL, italics: true }),
    ],
  });
}

function illustrationPlaceholder(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    border: {
      top: { style: BorderStyle.DASHED, size: 1, color: "999999" },
      bottom: { style: BorderStyle.DASHED, size: 1, color: "999999" },
      left: { style: BorderStyle.DASHED, size: 1, color: "999999" },
      right: { style: BorderStyle.DASHED, size: 1, color: "999999" },
    },
    children: [
      new TextRun({
        text: `[${text}]`,
        font: FONT,
        size: FONT_SIZE_SMALL,
        italics: true,
        color: "666666",
      }),
    ],
  });
}

function tableCaption(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({ text: "Tabla X. ", font: FONT, size: FONT_SIZE, bold: true, italics: true }),
      new TextRun({ text, font: FONT, size: FONT_SIZE, italics: true }),
    ],
  });
}

function thinBorder() {
  return { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
}

function makeTable(headers, rows, colWidths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h, i) =>
        new TableCell({
          width: { size: colWidths[i], type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG },
          verticalAlign: VerticalAlign.CENTER,
          borders: {
            top: thinBorder(), bottom: thinBorder(),
            left: thinBorder(), right: thinBorder(),
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 60, after: 60 },
              children: [
                new TextRun({
                  text: h,
                  font: FONT,
                  size: FONT_SIZE_SMALL,
                  bold: true,
                  color: TABLE_HEADER_TEXT,
                }),
              ],
            }),
          ],
        })
    ),
  });

  const dataRows = rows.map(
    (row, rowIdx) =>
      new TableRow({
        children: row.map(
          (cell, i) =>
            new TableCell({
              width: { size: colWidths[i], type: WidthType.PERCENTAGE },
              shading:
                rowIdx % 2 === 1
                  ? { type: ShadingType.CLEAR, fill: TABLE_ALT_ROW }
                  : {},
              verticalAlign: VerticalAlign.CENTER,
              borders: {
                top: thinBorder(), bottom: thinBorder(),
                left: thinBorder(), right: thinBorder(),
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { before: 40, after: 40 },
                  indent: { left: 80 },
                  children: Array.isArray(cell)
                    ? cell.map(
                        (c) =>
                          new TextRun({
                            text: c.text,
                            font: FONT,
                            size: FONT_SIZE_SMALL,
                            bold: c.bold || false,
                            italics: c.italics || false,
                          })
                      )
                    : [
                        new TextRun({
                          text: cell,
                          font: FONT,
                          size: FONT_SIZE_SMALL,
                        }),
                      ],
                }),
              ],
            })
        ),
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...dataRows],
  });
}

// ═══════════════════════════════════════════════════════════
// CONTENT
// ═══════════════════════════════════════════════════════════

const children = [];

children.push(heading1("Capítulo IV: Marco Propositivo — Propuesta Tecnológica"));

// ── 4.1 ──
children.push(heading2("4.1. Descripción de la Propuesta"));

children.push(
  bodyParagraph(
    "La presente propuesta tecnológica plantea la implementación de una plataforma web para sistematizar y automatizar la gestión documental de las prácticas preprofesionales en la Carrera de Tecnologías de la Información de la Universidad Laica Eloy Alfaro de Manabí (ULEAM). El proceso tradicional, apoyado en el seguimiento físico y la edición manual de plantillas, generaba constantes cuellos de botella administrativos y riesgos de discrepancia en los datos. La solución desarrollada busca centralizar la información operativa y agilizar la emisión de oficios, solicitudes y certificados oficiales mediante un entorno digital seguro y parametrizado."
  )
);

children.push(
  bodyParagraph(
    "Una premisa de diseño determinante en la arquitectura del sistema radica en la segregación de accesos: los estudiantes no interactúan directamente con la plataforma. La operatividad del sistema y el manejo de los registros recaen exclusivamente en tres perfiles administrativos:"
  )
);

children.push(
  bulletItem([
    { text: "Administrador (ADMIN): ", bold: true },
    { text: "responsable de la configuración global de la plataforma, la administración de facultades y carreras, la gestión de cuentas de usuario y el mantenimiento técnico del sistema." },
  ])
);
children.push(
  bulletItem([
    { text: "Coordinador o Comisión de Prácticas (COORDINATOR): ", bold: true },
    { text: "encargado del registro de estudiantes y empresas, el seguimiento del ciclo de las prácticas, la carga masiva de datos mediante archivos de hoja de cálculo, la configuración de plantillas documentales y la generación masiva e individual de los documentos." },
  ])
);
children.push(
  bulletItem([
    { text: "Firmante (SIGNER): ", bold: true },
    { text: "rol reservado para el Decano y el Director de Carrera, cuya participación se limita a la revisión y suscripción electrónica de los lotes documentales previamente procesados." },
  ])
);

children.push(
  bodyParagraph(
    "Una vez que los documentos adquieren validez legal mediante la firma digital embebida, su distribución hacia los estudiantes o instituciones receptoras se realiza a través de canales institucionales externos a la plataforma (como correo electrónico o entrega física). Este esquema evita la sobrecarga de usuarios en la aplicación, simplifica las políticas de seguridad y concentra el flujo de trabajo en el personal responsable de la gestión."
  )
);

children.push(
  bodyParagraph(
    "Desde el ámbito técnico, la solución se estructuró bajo una arquitectura de monorepo gestionada con Turborepo. En el backend, se implementó el framework NestJS aplicando principios de Arquitectura Limpia, mientras que la persistencia y el tipado de datos se manejan en PostgreSQL a través de Prisma ORM. La interfaz de usuario (frontend) fue desarrollada con Next.js (App Router), React, Tailwind CSS, Zustand y React Query. Para la generación documental, el sistema integra docxtemplater y LibreOffice headless en la conversión de oficios a PDF, reservando la herramienta pdfme para el diseño visual de certificados. Finalmente, el procesamiento intensivo de archivos se gestiona mediante colas asíncronas con BullMQ y Redis, respaldando los documentos en MinIO, mientras que el flujo de firma digital sigue un esquema secuencial (Decano y posteriormente Director) bajo el estándar CAdES/FirmaEC, todo orquestado en contenedores Docker."
  )
);

// ── 4.2 ──
children.push(heading2("4.2. Determinación de Recursos"));

children.push(
  bodyParagraph(
    "Para garantizar la viabilidad en la construcción del aplicativo web, resultó imprescindible definir con claridad los recursos requeridos. Esto abarca desde el personal involucrado directamente en las fases de concepción, programación y revisión, hasta los equipos y servicios tecnológicos subyacentes, sin dejar de lado la estimación económica que representa el desarrollo del software."
  )
);

children.push(heading3("4.2.1. Recursos Humanos"));

children.push(
  bodyParagraph(
    "El desarrollo de la propuesta tecnológica se apoyó en un equipo compacto pero eficiente, concentrando las labores de ingeniería en un solo desarrollador principal, con la guía y validación constante de un tutor académico. A continuación se detallan los perfiles y funciones desempeñadas:",
    { noIndent: true }
  )
);

children.push(tableCaption("Estructura de Recursos Humanos del Proyecto."));
children.push(
  makeTable(
    ["Rol", "Perfil / Participante", "Funciones principales"],
    [
      [
        "Desarrollador / Investigador",
        "Estudiante egresado de la Carrera de TI",
        "Levantamiento y análisis de requisitos, diseño del modelo de datos, desarrollo full-stack (frontend y backend), configuración del entorno Docker, integración de la firma electrónica, y ejecución de pruebas funcionales.",
      ],
      [
        "Tutor Académico",
        "Docente especialista de la ULEAM",
        "Supervisión metodológica del proyecto, revisión de avances de desarrollo, validación de la lógica de negocio y la arquitectura técnica, corrección de la documentación formal de la tesis.",
      ],
      [
        "Expertos / Stakeholders",
        "Comisión de Prácticas y Autoridades de la Facultad",
        "Provisión de formatos reales de documentos oficiales (plantillas .docx), participación en pruebas de aceptación del usuario, y retroalimentación sobre la usabilidad y adecuación del sistema.",
      ],
    ],
    [20, 25, 55]
  )
);

children.push(heading3("4.2.2. Recursos Tecnológicos y Económicos"));

children.push(
  bodyParagraph(
    "Al tratarse de un proyecto académico con un despliegue focalizado actualmente en un entorno de desarrollo local, los costos económicos asociados se mantuvieron sustancialmente bajos, sustentándose en el uso de hardware personal y licencias de software de código abierto (Open Source). La siguiente tabla desglosa los recursos tecnológicos utilizados y su costo estimado:",
    { noIndent: true }
  )
);

children.push(tableCaption("Desglose de Recursos Tecnológicos y Costos Estimados."));
children.push(
  makeTable(
    ["Categoría", "Recurso / Herramienta", "Propósito", "Costo (USD)"],
    [
      ["Hardware", "Laptop AMD Ryzen 3, 16 GB RAM, SSD 512 GB", "Desarrollo local, ejecución simultánea de contenedores Docker y pruebas.", "$0.00 (Propio)"],
      ["Backend", "Node.js 20 LTS, NestJS 10, Prisma ORM 5, BullMQ", "Framework del servidor, ORM para PostgreSQL, sistema de colas asíncronas.", "$0.00 (Open Source)"],
      ["Frontend", "Next.js 14 (App Router), React 18, Tailwind CSS, Zustand, React Query", "Interfaz de usuario con SSR, gestión de estado y consumo de la API.", "$0.00 (Open Source)"],
      ["Base de datos", "PostgreSQL 15 (contenedor Docker)", "Motor relacional principal para toda la persistencia del sistema.", "$0.00 (Open Source)"],
      ["Caché y Colas", "Redis 7 (contenedor Docker)", "Soporte para BullMQ (procesamiento masivo) y caché de sesiones.", "$0.00 (Open Source)"],
      ["Almacenamiento", "MinIO (contenedor Docker, compatible con S3)", "Almacenamiento de plantillas base y documentos PDF generados/firmados.", "$0.00 (Open Source)"],
      ["Procesamiento documental", "docxtemplater, pdfme, LibreOffice headless", "Inyección de variables en plantillas Word, diseño visual de certificados, conversión DOCX → PDF.", "$0.00 (Open Source)"],
      ["Control de versiones", "Git / GitHub", "Repositorio del código fuente, historial de cambios.", "$0.00 (Plan gratuito)"],
      ["Orquestación", "Docker y Docker Compose", "Contenedorización de todos los servicios del ecosistema.", "$0.00 (Open Source)"],
      ["Monorepo", "Turborepo", "Coordinación de builds y comandos entre apps/ y packages/.", "$0.00 (Open Source)"],
      [
        [{ text: "Gastos operativos", bold: true }],
        "Internet y energía eléctrica (prorrateados, 3 meses)",
        "Servicios básicos durante el período de desarrollo intensivo.",
        "~$150.00"
      ],
      [
        [{ text: "TOTAL", bold: true }],
        "",
        "",
        [{ text: "~$150.00", bold: true }]
      ],
    ],
    [18, 30, 35, 17]
  )
);

children.push(
  noteParagraph(
    "En el momento en que el sistema requiera ser puesto en producción, se deberán considerar los costos de alquiler de servidores virtuales privados (VPS) o servicios en la nube para soportar la infraestructura Docker diseñada, así como la adquisición o renovación de un dominio institucional y certificado SSL."
  )
);

// ── 4.3 ──
children.push(heading2("4.3. Etapas de Acción para el Desarrollo de la Propuesta"));

children.push(
  bodyParagraph(
    "Considerando la necesidad de iterar con rapidez y adaptar el desarrollo a la retroalimentación continua de los coordinadores de prácticas, se adoptó la metodología ágil SCRUM como marco de trabajo. El ciclo de vida del proyecto abarcó aproximadamente tres meses, fragmentados en seis Sprints quincenales orientados a entregar módulos funcionales de forma progresiva. Al finalizar cada Sprint se realizaban demostraciones a las partes interesadas, recogiendo observaciones que se incorporaban en la siguiente iteración."
  )
);

children.push(tableCaption("Cronograma de Actividades y Fases de Desarrollo (SCRUM)."));
children.push(
  makeTable(
    ["Sprint", "Duración", "Objetivos y tareas principales", "Entregable (Incremento)"],
    [
      [
        [{ text: "Sprint 1: ", bold: true }, { text: "Cimientos y Autenticación" }],
        "Semanas 1–2",
        "Configuración del Monorepo con Turborepo. Dockerización del entorno local (PostgreSQL, Redis, MinIO). Diseño inicial del esquema de base de datos con Prisma. Módulo de autenticación (JWT, roles, refresh tokens). Protección de rutas en el frontend con middleware de Next.js.",
        "Estructura base funcional con inicio de sesión operativo y segregación por roles (Admin, Coordinator).",
      ],
      [
        [{ text: "Sprint 2: ", bold: true }, { text: "Gestión Central (CRUD)" }],
        "Semanas 3–4",
        "Módulos de Facultades, Programas y Períodos Académicos. CRUD de Estudiantes y Empresas. Lógica multi-tenant por facultad (nestjs-cls + extensiones Prisma). Importación masiva de estudiantes vía Excel, procesada en segundo plano con BullMQ.",
        "Interfaz de administración poblada. Capacidad de cargar lotes de datos estudiantiles y gestionar empresas.",
      ],
      [
        [{ text: "Sprint 3: ", bold: true }, { text: "Prácticas y Plantillas" }],
        "Semanas 5–6",
        "Módulo de registro y seguimiento de Prácticas. Integración de MinIO para subida de plantillas. Configuración de DocumentTemplates (metadatos JSON). Integración del diseñador visual pdfme en el frontend.",
        "Gestión completa del ciclo de la práctica. Sistema listo para alojar plantillas Word y diseñar certificados PDF.",
      ],
      [
        [{ text: "Sprint 4: ", bold: true }, { text: "Motor de Generación" }],
        "Semanas 7–8",
        "Document Engine: inyección de variables con docxtemplater. Conversión DOCX a PDF (LibreOffice headless). Generación masiva asíncrona por lotes (BullMQ workers). Numeración secuencial automática (DocumentSequence).",
        "Módulo funcional que genera documentos PDF para múltiples estudiantes con un solo clic.",
      ],
      [
        [{ text: "Sprint 5: ", bold: true }, { text: "Flujo de Firmas y Auditoría" }],
        "Semanas 9–10",
        "Auto-registro de firmantes mediante tokens de invitación. Lógica jerárquica de lotes de firma (Decano → Director). Procesamiento criptográfico CAdES/FirmaEC (adbe.pkcs7). Verificación de PDFs firmados. Módulo de auditoría (AuditLog).",
        "Signer Dashboard operativo. Documentos generados recorren el flujo completo de firma digital.",
      ],
      [
        [{ text: "Sprint 6: ", bold: true }, { text: "Pruebas y Cierre" }],
        "Semanas 11–12",
        "Resolución de errores (bug fixing). Optimización de consultas en Prisma. Pulido de la interfaz UI/UX responsiva con Tailwind CSS. Preparación de docker-compose.prod.yml. Documentación técnica.",
        "Versión Release Candidate validada operativamente y lista para la defensa del proyecto.",
      ],
    ],
    [18, 12, 40, 30]
  )
);

children.push(
  illustrationPlaceholder(
    "Ilustración X: Diagrama de Gantt o cronograma visual representando los 6 Sprints del proyecto, con las fases de Cimientos, CRUD, Prácticas, Generación, Firmas y Cierre distribuidas a lo largo de 12 semanas. (Usar la imagen generada de gantt_sprints.html)"
  )
);

// ── 4.4 ──
children.push(heading2("4.4. Etapa de Planificación"));

children.push(
  bodyParagraph(
    "Durante la fase inicial del proyecto se estableció una comunicación directa con las autoridades y los encargados de prácticas preprofesionales de la Carrera de TI, con el propósito de destilar las necesidades operativas en requerimientos técnicos concretos. Las entrevistas y sesiones de observación descritas en el Capítulo III constituyeron la base para esta formalización, cuidando que cada requisito se apegara a la realidad del flujo de trabajo actual, donde el estudiante permanece al margen del uso directo de la aplicación y toda la gestión recae en la Comisión de Prácticas y las autoridades firmantes."
  )
);

children.push(heading3("4.4.1. Requisitos Funcionales"));

children.push(
  bodyParagraph(
    "Los requisitos funcionales delinean las capacidades y comportamientos que el sistema debe ofrecer obligatoriamente para cumplir con los objetivos planteados en esta investigación. Cada uno de ellos fue derivado de las necesidades identificadas durante el levantamiento de información y validado con los actores involucrados.",
    { noIndent: true }
  )
);

const funcReqs = [
  ["RF-01: Autenticación y autorización por roles.", " El sistema debe permitir el inicio de sesión seguro y verificar el nivel de acceso del usuario mediante la asignación de roles (ADMIN, COORDINATOR, SIGNER), utilizando JSON Web Tokens. Cada rol debe tener acceso únicamente a las funcionalidades que le corresponden."],
  ["RF-02: Gestión de la estructura académica.", " Un usuario con rol de Administrador debe poder crear, editar, listar y eliminar de forma lógica (soft delete) las Facultades, Programas académicos y Períodos Académicos que constituyen el marco organizativo de las prácticas."],
  ["RF-03: Administración de cuentas de usuario.", " El administrador debe poder crear nuevas cuentas, asignar roles y facultades, suspender cuentas de forma reversible e inhabilitar usuarios cuando sea necesario, garantizando la gobernanza del acceso al sistema."],
  ["RF-04: Gestión de estudiantes y empresas.", " Los coordinadores deben poder registrar, editar, consultar y listar la información de los estudiantes (cédula, nombres, programa, facultad) y de las empresas receptoras de prácticas (razón social, dirección, contacto, nombre del destinatario de los oficios)."],
  ["RF-05: Importación masiva de datos vía Excel.", " La plataforma debe permitir al coordinador cargar un archivo .xlsx para registrar o actualizar masivamente la base de estudiantes. Este proceso debe ejecutarse en segundo plano (colas asíncronas) para no bloquear la interfaz, mostrando indicadores del estado de la carga y un registro de los errores encontrados."],
  ["RF-06: Registro y seguimiento de prácticas.", " El coordinador debe poder asignar un estudiante a una empresa dentro de un período académico específico, definir las horas planificadas, el tutor académico, el nivel de práctica y el nivel académico. El sistema debe gestionar un ciclo de estados (Pendiente, En Progreso, Completada, Rechazada, Retrasada, Cancelada) que refleje la evolución de cada práctica."],
  ["RF-07: Gestión y diseño de plantillas documentales.", " El sistema debe soportar dos tipos de plantillas: archivos .docx (para oficios y solicitudes) que se cargan directamente al almacenamiento, y plantillas de certificados que se diseñan visualmente desde la interfaz web mediante un editor gráfico interactivo, sin necesidad de conocimientos técnicos."],
  ["RF-08: Generación automática de documentos.", " El usuario con rol de coordinador debe poder seleccionar un grupo de estudiantes y una plantilla, y ordenar al sistema que combine los datos (inyección de variables) para generar los documentos resultantes. Los oficios Word deben convertirse automáticamente a PDF. La generación debe poder realizarse de forma individual o masiva."],
  ["RF-09: Codificación secuencial de documentos.", " Cada documento generado debe recibir un código único institucional autoincremental (por ejemplo, OFICIO-2025-1-00042) asociado al tipo de documento y al período académico vigente, garantizando la unicidad y trazabilidad."],
  ["RF-10: Creación de lotes de firma.", " El coordinador debe poder seleccionar un conjunto de documentos ya generados y empaquetarlos en un «Lote de Firma», asignándole un código identificador y enviándolo a las autoridades para su revisión y firma electrónica."],
  ["RF-11: Registro de firmantes por invitación.", " El sistema debe generar enlaces con tokens de un solo uso para que las autoridades firmantes (Decanos y Directores) se registren de forma autónoma, configurando su perfil de firma sin intervención manual del área de TI."],
  ["RF-12: Flujo secuencial de firma electrónica.", " El panel del Firmante debe permitir visualizar los documentos PDF y gestionar la firma electrónica embebida conforme al estándar CAdES/FirmaEC (adbe.pkcs7). El sistema debe forzar un orden jerárquico: el Decano firma primero; luego se habilita al Director para la firma final."],
  ["RF-13: Invalidación y control de versiones.", " En caso de errores en un documento ya generado, el coordinador debe poder invalidarlo (registrando una razón), generar un documento nuevo que lo sustituya y mantener un historial completo de versiones."],
  ["RF-14: Trazabilidad y auditoría.", " Cualquier operación crítica — creación, edición o eliminación lógica — sobre las tablas principales debe quedar registrada automáticamente en un log de auditoría inmutable, incluyendo la identidad del usuario, la tabla afectada, el registro modificado y las diferencias de datos."],
  ["RF-15: Reportes y panel de seguimiento.", " El sistema debe desplegar un panel principal (Dashboard) que consolide la información operativa relevante: prácticas activas por estado, documentos generados, lotes de firma pendientes, períodos académicos vigentes y estadísticas comparativas."],
];

for (const [label, desc] of funcReqs) {
  children.push(
    bulletItem([
      { text: label, bold: true },
      { text: desc },
    ])
  );
}

children.push(heading3("4.4.2. Requisitos No Funcionales"));

children.push(
  bodyParagraph(
    "En paralelo a las funcionalidades explícitas, se establecieron lineamientos cualitativos para garantizar que la plataforma sea escalable, segura, mantenible y confiable a lo largo del tiempo.",
    { noIndent: true }
  )
);

const nfReqs = [
  ["RNF-01: Arquitectura modular y escalable.", " El diseño del código en el backend debe seguir los principios de Clean Architecture, organizando la lógica en módulos independientes (NestJS modules) con separación de capas (controlador, servicio, repositorio), promoviendo el bajo acoplamiento y facilitando la adición de nuevas funcionalidades."],
  ["RNF-02: Procesamiento asíncrono de operaciones pesadas.", " Toda operación de larga duración — como la conversión masiva de documentos DOCX a PDF o la importación de cientos de registros desde Excel — no debe bloquear el hilo principal de Node.js. Estas tareas deben delegarse a procesos trabajadores gestionados por BullMQ y Redis."],
  ["RNF-03: Seguridad en la gestión de credenciales.", " Las contraseñas deben almacenarse con el algoritmo bcrypt. La sesión operará bajo tokens de acceso JWT que expiran a los 15 minutos, complementados por refresh tokens rotativos válidos por 7 días, revocables ante actividad sospechosa."],
  ["RNF-04: Aislamiento de datos multi-tenant.", " Un coordinador asignado a la Facultad «A» no debe poder visualizar ni modificar los datos de la Facultad «B». Esta segregación se implementa mediante extensiones de Prisma Client y el contexto de solicitud gestionado por nestjs-cls."],
  ["RNF-05: Contenerización integral del entorno.", " Todos los componentes de infraestructura — PostgreSQL, Redis, MinIO, LibreOffice, backend y frontend — deben estar orquestados mediante Docker Compose, permitiendo levantar el ecosistema completo con un único comando."],
  ["RNF-06: Rendimiento de la interfaz de usuario.", " La aplicación web debe ofrecer tiempos de carga reducidos y experiencia fluida, aprovechando el Server-Side Rendering de Next.js App Router y el caché del lado del cliente con React Query."],
  ["RNF-07: Resiliencia del almacenamiento de archivos.", " Los documentos binarios no deben almacenarse en el disco del servidor de base de datos. Deben residir en un sistema de almacenamiento de objetos S3 compatible (MinIO), accesibles mediante URLs prefirmadas de duración limitada."],
];

for (const [label, desc] of nfReqs) {
  children.push(
    bulletItem([
      { text: label, bold: true },
      { text: desc },
    ])
  );
}

// ── 4.5 ──
children.push(heading2("4.5. Diseño de la Base de Datos"));

children.push(
  bodyParagraph(
    "El almacenamiento de los datos constituye la columna vertebral de esta propuesta tecnológica. Se diseñó un modelo relacional robusto sobre el motor PostgreSQL, empleando Prisma como ORM para garantizar el tipado estricto en la capa de la aplicación y gestionar las migraciones de esquema de forma controlada. El modelo resultante ha sido normalizado para evitar redundancias y asegurar la integridad referencial, soportando las reglas de negocio más exigentes del sistema, en particular el aislamiento de la información por facultades y el flujo de firma electrónica de dos niveles."
  )
);

children.push(heading3("4.5.1. Modelo de datos y tablas principales"));

children.push(
  bodyParagraph(
    "A continuación se describe la estructura y el propósito de cada una de las entidades principales que conforman el esquema de la base de datos:",
    { noIndent: true }
  )
);

const dbTables12 = [
  ["users (Usuarios):", " Entidad central de autenticación. Almacena las credenciales de acceso (correo electrónico, contraseña hasheada), el rol asignado (ADMIN, COORDINATOR, STUDENT o SIGNER), timestamps y banderas para borrado lógico (deletedAt) o suspensión temporal de la cuenta (suspendedAt). A partir de esta tabla se derivan las relaciones hacia los perfiles especializados."],
  ["faculties (Facultades):", " Almacena el catálogo de facultades de la institución, incluyendo su nombre, descripción y abreviatura para la codificación de documentos. Actúa como eje de particionamiento lógico de los datos en todo el sistema."],
  ["programs (Programas/Carreras):", " Representa las carreras académicas ofertadas por cada facultad. Cada programa está vinculado a una facultad mediante llave foránea, estableciendo la jerarquía organizativa de la universidad."],
  ["coordinators (Coordinadores):", " Extiende la información del usuario con rol COORDINATOR, vinculándolo a una facultad y opcionalmente a un programa específico. Esta relación determina el alcance de datos al que tiene acceso."],
  ["students (Estudiantes):", " Almacena los datos personales de cada estudiante: cédula de identidad (campo único), nombres, apellidos y teléfono. Cada registro está ligado a un usuario del sistema, a una facultad y a un programa académico."],
  ["companies (Empresas):", " Contiene la información de las instituciones donde los estudiantes realizan sus prácticas: razón social, dirección, datos de contacto y nombre del destinatario de los oficios (recipientName), utilizado en la inyección de variables."],
  ["practices (Prácticas):", " Entidad transaccional crítica que vincula al estudiante, la empresa y el período académico. Registra las fechas de inicio y fin, nivel de práctica, tutor asignado, horas totales y el estado actual, modelado con seis estados posibles (PENDING, IN_PROGRESS, COMPLETED, REJECTED, DELAYED y CANCELED)."],
  ["academic_periods (Períodos Académicos):", " Define los ciclos lectivos institucionales con sus fechas de inicio y fin, el código del período y la bandera de período activo."],
  ["document_templates (Plantillas de Documentos):", " Guarda los metadatos de las plantillas base para oficios y certificados. Indica el tipo de plantilla, su nombre y la facultad a la que pertenece."],
  ["generated_documents (Documentos Generados):", " Representa cada documento finalizado emitido para un estudiante específico. Registra la referencia a la plantilla utilizada, el código institucional, la ruta del archivo en almacenamiento, el estado de validez (VALID, INVALIDATED, SUPERSEDED) y el estado de firma digital (NONE, IN_SIGNING, PARTIALLY_SIGNED, SIGNED, REJECTED)."],
  ["signature_batches (Lotes de Firma):", " Agrupa un conjunto de documentos para ser firmados electrónicamente por las autoridades. Registra un código único por lote, el usuario creador y el estado del flujo (PENDING_DEAN, PENDING_DIRECTOR, COMPLETED o CANCELLED)."],
  ["signature_batch_items (Ítems de Lote):", " Asocia cada documento generado con su lote de firma correspondiente, manteniendo el seguimiento individual del estado de aprobación de cada archivo en el paquete."],
];

for (const [label, desc] of dbTables12) {
  children.push(
    bulletItem([
      { text: label, bold: true, italics: true },
      { text: desc },
    ])
  );
}

children.push(
  bodyParagraph(
    "Para una comprensión integral de las relaciones entre las entidades mencionadas, se presenta a continuación el modelo Entidad-Relación de la base de datos:",
    { noIndent: true }
  )
);

children.push(
  illustrationPlaceholder(
    "Ilustración X: Diagrama Entidad-Relación (ER) de la base de datos relacional del sistema, mostrando las 12 tablas principales y sus relaciones. (Insertar la imagen del diagrama de base de datos)"
  )
);

// ── 4.6 ──
children.push(heading2("4.6. Presentación y Análisis de Resultados"));

children.push(
  bodyParagraph(
    "Una vez completadas las etapas de planificación y desarrollo detalladas en los apartados anteriores, la plataforma tecnológica alcanzó un estado funcional y operativo en un entorno de pruebas controlado. Las decisiones arquitectónicas adoptadas — en particular la delegación de tareas computacionalmente intensivas a BullMQ y el aislamiento seguro de los datos mediante nestjs-cls — resultaron en un sistema con alta cohesión interna y bajo acoplamiento entre módulos."
  )
);

children.push(
  bodyParagraph(
    "Por otra parte, la exclusión deliberada de los estudiantes del uso directo de la plataforma, centralizando el control en las autoridades y coordinadores, demostró ser una estrategia efectiva para simplificar los flujos de seguridad, reducir la superficie de ataque y evitar sobrecargas innecesarias derivadas de una masa de usuarios sin funciones operativas dentro del sistema."
  )
);

children.push(
  bodyParagraph(
    "En términos operativos, el sistema logró unificar procesos que anteriormente se ejecutaban de manera dispersa y descoordinada. La generación de oficios, que antes requería varios minutos por estudiante debido a la transcripción manual de datos en plantillas ofimáticas, ahora se procesa en lotes de decenas de documentos en cuestión de segundos, produciendo archivos PDF consistentes, correctamente codificados y libres de errores tipográficos. Cabe señalar que la integración nativa de los protocolos CAdES para la firma electrónica constituyó uno de los hitos tecnológicos más relevantes del proyecto, al asegurar que los documentos resultantes gocen de completa validez legal dentro del marco normativo ecuatoriano."
  )
);

children.push(
  bodyParagraph(
    "A partir de este escenario arquitectónico consolidado, se hace imperativo demostrar la validez práctica y empírica de la solución construida. Por consiguiente, el siguiente capítulo de esta investigación se centrará en la ejecución de pruebas del sistema, la exhibición visual de las interfaces desarrolladas, la codificación de los módulos principales y el análisis del impacto real que estas herramientas proporcionan sobre los tiempos de respuesta y la calidad documental del departamento de prácticas preprofesionales."
  )
);

// ═══════════════════════════════════════════════════════════
// BUILD DOC
// ═══════════════════════════════════════════════════════════

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: FONT_SIZE },
        paragraph: { spacing: { line: LINE_SPACING } },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
          },
        },
      },
      children,
    },
  ],
});

const outputPath = "c:\\dev\\New Tesis\\tesis-edit\\Capitulo4_MarcoPropositivoAPA.docx";
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
console.log(`✅ Archivo Word actualizado exitosamente: ${outputPath}`);
console.log(`   Tamaño: ${(buffer.length / 1024).toFixed(1)} KB`);
