# Estructura del proyecto

Monorepo gestionado con Turborepo. Cada carpeta tiene una responsabilidad única.

```
New Tesis/
├── apps/
│   ├── api/                  API en NestJS: módulos, colas y motor documental
│   └── web/                  Interfaz en Next.js
│       └── public/templates/ Plantillas oficiales que descarga el usuario
├── packages/
│   └── db/                   Esquema de Prisma y cliente compartido
├── benchmarks/               Mediciones de rendimiento y del circuito de firma
│   └── evidencia/            Registros de cada ejecución (respaldo del Anexo I)
├── scripts/                  Utilidades de mantenimiento y generación
│   ├── plantillas/           Construcción de las plantillas DOCX oficiales
│   └── windows/              Atajos .bat para el entorno local
├── docs/                     Documentación técnica y diagramas
│   └── formatos-oficiales/   Formatos de la Facultad, sin versionar (datos reales)
├── certificados-prueba/      Certificados autofirmados, solo para ensayo
├── tesis-edit/               Documento de titulación (fuera del control de versiones)
└── _local/                   Archivos personales ajenos al proyecto
```

## Qué se versiona y qué no

**Se versiona:** el código de las dos aplicaciones, el esquema de la base de datos,
las plantillas oficiales de `apps/web/public/templates/`, los scripts, la
documentación de `docs/` y la evidencia de las mediciones de `benchmarks/`.

**No se versiona:**

| Ruta | Motivo |
|---|---|
| `*.p12`, `*.pfx`, `certificados-prueba/` | credenciales de firma; se regeneran con OpenSSL |
| `.env` y variantes | secretos de entorno |
| `tesis-edit/`, `*.docx`, `*.pdf` | documento de titulación, ajeno al sistema |
| `_local/` | archivos personales |
| `node_modules/`, `dist/`, `.next/`, `.turbo/` | dependencias y compilados |
| `uploads/`, `capturas/` | artefactos locales |

La única excepción dentro de `certificados-prueba/` es su `README.md`, que explica
cómo regenerar los certificados sin necesidad de que estén en el repositorio.

## Scripts disponibles

| Script | Para qué sirve |
|---|---|
| `scripts/generar-excel-prueba.js` | Regenera la plantilla maestra y los datos de prueba |
| `scripts/purgar-invalidados.js` | Borra documentos no vigentes; sin `--ejecutar` solo simula |
| `scripts/generar-docx-tesis.mjs` | Herramienta de composición del documento de titulación |
| `scripts/plantillas/plantilla-solicitud.js` | Rehace la plantilla de la solicitud desde el formato oficial |
| `scripts/plantillas/plantilla-designacion.js` | Rehace la plantilla de la designación desde el formato oficial |
| `scripts/plantillas/probar-plantilla.js` | Rellena una plantilla con datos de prueba para revisarla |
| `benchmarks/benchmark-cola.js` | Mide la emisión de un lote de extremo a extremo |
| `benchmarks/benchmark-motor.js` | Mide solo el motor de renderizado |
| `benchmarks/firmar-lote-de-prueba.js` | Firma un lote descargado con certificados de ensayo |
