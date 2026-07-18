# Notas para la próxima sesión — UniBridge

_Última actualización: 17 de julio de 2026_

---

## 0. Decisiones de diseño (para la defensa)

### Entrega de certificados a estudiantes — Opción A adoptada
Los estudiantes **NO tienen cuenta** en el sistema. El coordinador descarga el
ZIP de certificados firmados (botón "ZIP de todos los firmados", por lote, o de
lotes seleccionados) y los distribuye por correo/aula. Menos superficie de
seguridad, cero soporte de contraseñas olvidadas, cero cuentas muertas.

- **Ya implementado:** no requiere código nuevo, la función de ZIP ya existe.
- **Evolución futura (Opción B, mencionar en la defensa):** cada certificado
  firmado podría exponer un link público con token (`/verificar/<token>` + QR).
  Sirve para autoservicio del estudiante Y para que un empleador verifique la
  autenticidad del documento sin necesidad de cuentas. Es la evolución natural
  porque un documento firmado digitalmente cobra valor cuando cualquiera puede
  verificarlo.

### Envío de correos (recuperación de contraseña) — falta activar el "cartero"
El flujo de recuperación (token 1h, un solo uso, reset, cierre de sesiones)
está **completo y probado**. Lo único pendiente para que envíe correos reales
en producción:
1. `npm install nodemailer` en `apps/api`
2. Variables en el `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   `SMTP_FROM` (correo institucional de la ULEAM)

El código ya está escrito para usarlas apenas existan. En desarrollo, sin SMTP,
el link se muestra en pantalla (modo dev) — suficiente para demostrar el flujo.

---

## 1. Tu pregunta: ¿aguanta 500 certificados de golpe?

**Respuesta corta: sí, la arquitectura aguanta, pero hay 3 cuellos de botella reales que conviene arreglar antes de intentarlo en producción.**

### Lo que ya está bien resuelto

El sistema **no** genera los documentos dentro del request HTTP. Cuando presionas "Emitir certificados":

1. La API valida todo (autoridades configuradas, solicitud vigente por estudiante) y **encola** los trabajos en BullMQ/Redis.
2. Responde de inmediato con un `batchId` — el navegador nunca espera 500 PDFs.
3. Un worker procesa **4 documentos en paralelo** ([document-generation.processor.ts:14](apps/api/src/modules/generated-documents/document-generation.processor.ts#L14)) con 3 reintentos y backoff exponencial.
4. La UI consulta el progreso cada 1.2 s y pinta la barra.

Esto significa que **500 documentos no tumban el servidor**: se procesan de a poco. Si la API se reinicia a mitad del lote, Redis conserva los trabajos pendientes y siguen al volver. Ese diseño ya es el correcto.

### Los 3 cuellos de botella a resolver

**(a) Rate limit global vs. el polling del progreso — el más urgente**

El `ThrottlerModule` permite 300 req/min por IP. Un lote de 500 documentos tarda unos ~4–8 min; con polling cada 1.2 s son ~50 req/min solo de progreso, más las recargas de listas. Con 2–3 coordinadores trabajando a la vez **se puede alcanzar el 429**. Además, en producción detrás de un proxy/NAT **todos comparten la misma IP**, así que el límite es efectivamente global.

Recomendación:
- Excluir `/generated-documents/batch/:id/progress` del throttler (`@SkipThrottle()`), o darle su propio límite generoso.
- Configurar `trust proxy` en Express para que el throttler vea la IP real y no la del balanceador.
- Mejor aún: cambiar el polling por **SSE o WebSocket** para el progreso — 1 conexión en vez de 250 requests.

**(b) Puppeteer es el verdadero limitante de memoria**

Cada certificado PDF abre una página de Chromium. Hoy hay **un solo navegador compartido** (bien) con concurrencia 4 (razonable). Estimación: ~50–80 MB por página activa → con 4 en paralelo son ~300 MB estables. 500 documentos secuenciados de 4 en 4 ≈ **4–8 minutos**.

Riesgos a vigilar:
- Si una página queda colgada (`page.close()` que no se ejecuta por una excepción), se filtra memoria. **Revisar que el `finally` cierre siempre la página.**
- En Docker, Chromium necesita `--disable-dev-shm-usage` (ya está) y `shm_size: 1gb` en el compose, o crashea en lotes grandes.
- Recomendación: subir concurrencia a 6–8 **solo si** el contenedor tiene ≥2 GB de RAM; medir antes.

**(c) Límite de tamaño de lote y numeración**

Hoy no hay tope: puedes encolar 5000 si seleccionas 5000. Recomendaciones:
- Validar en el DTO un máximo (p. ej. **200 por lote**) y sugerir dividir. Protege de un error de click.
- `generateSequence` usa un `upsert` con `increment` — es atómico a nivel de fila, así que **no hay riesgo de códigos duplicados** aunque 4 workers pidan número a la vez. Esto ya está correcto.
- MinIO aguanta sin problema; los keys ya son únicos por periodo/tipo/código.

### Veredicto

> Para tu defensa de tesis: **500 documentos es perfectamente viable** y es un buen número para demostrar. El sistema los procesará en ~5–8 minutos sin bloquear la interfaz. Antes de la demo en vivo, aplica el arreglo del throttler en el endpoint de progreso (a) — es 5 minutos de trabajo y es el único que puede romper la demo visiblemente.

---

## 2. Mejoras pendientes del proceso principal (documentos)

### Prioridad alta

- [ ] **Excluir el endpoint de progreso del rate limit** (ver arriba). Riesgo real de 429 en demo.
- [ ] **Progreso por SSE en vez de polling.** Elimina el 90% del tráfico y da progreso instantáneo.
- [ ] **Verificar cierre de páginas de Puppeteer en el `finally`** de `pdf.driver.ts` — es la fuente clásica de fugas en lotes largos.
- [ ] **Tope de lote (200) con mensaje claro** en `GenerateBatchDto`.
- [ ] **Reanudar lotes interrumpidos**: hoy si cierras el navegador a mitad, el lote sigue en el servidor pero la UI ya no lo muestra. Falta una vista de "lotes en proceso" al volver a entrar.

### Prioridad media

- [ ] **Deduplicación de certificados**: hoy `generate()` no verifica si el estudiante ya tiene un certificado VALID; se puede emitir dos veces el mismo. La solicitud sí tiene esa validación (`checkExistingSolicitud`) — falta el equivalente para certificados.
- [ ] **Dead-letter queue**: los jobs que fallan 3 veces se cuentan como `failed` pero no queda registro consultable de *por qué*. Guardar el error en la BD para diagnóstico.
- [ ] **La plantilla DOCX asume una sola empresa por lote.** Si en el futuro se agrupa distinto, `generateSolicitudGrouped` toma `students[0].practices[0].company` — frágil.
- [ ] **Reintento manual desde la UI** para los documentos que fallaron.

### Prioridad baja / deuda técnica

- [ ] `apps/api/src/modules/queues/document-generation.processor.ts` está vacío y obsoleto — se puede borrar (el real vive en `generated-documents/`).
- [ ] La sección "PASO 4: Fallback antiguo" de [imports/page.tsx](apps/web/src/app/(dashboard)/imports/page.tsx) fue eliminada por conflictos de variables. Si necesitas soportar el Excel de formato viejo, hay que reescribirla.
- [ ] Los avatares usan `api.dicebear.com` (servicio externo). En una demo sin internet no cargan.

---

## 3. Lo que se implementó en esta sesión (15 jul 2026)

### Requisitos y validaciones
- **Autoridades obligatorias**: ningún documento se genera si el periodo no tiene Decano y Responsable de Prácticas configurados en Configuración.
- **Solicitud → Certificado**: no se emite un certificado si el estudiante no tiene una solicitud (oficio) vigente vinculada. Valida individual y en lote, antes de encolar.
- **Reasignación de empresa**: invalida en cascada el oficio de todo el grupo (es un documento grupal), con candados si hay certificado emitido o firma en curso, y "Deshacer" de 10 s.

### Plantillas corregidas
- El certificado PDF decía literalmente "[Nombre de la Decana]" → ahora usa `{{deanName}}` y `{{directorName}}`.
- El oficio DOCX tenía grabado "Ing. Hiraida Santana Cedeño, Mg." → ahora usa `{{directorName}}`.

### UX
- **Barra de acciones flotante** en Prácticas y Certificados: sigue el scroll, se esconde al subir. Ya no hay que volver arriba para actuar.
- **Elegibilidad visible**: si un seleccionado no cumple, la barra se pone ámbar, explica por qué y ofrece "Quitar los N bloqueantes" en un click.
- **Palomita de auto-firma**: al emitir certificados decides si el lote entra solo al circuito Decano → Director. Recuerda tu preferencia.
- **Solicitud solo grupal**: se eliminó la posibilidad de generar una solicitud individual (el oficio siempre lista al equipo completo).
- **Íconos de documento** ahora llevan a `/certificates?highlight=<id>` con scroll y resaltado, en vez de abrir el archivo directo.
- **Certificados rediseñada**: agrupada por empresa (el nombre se escribe una vez), un solo badge de estado que fusiona vigencia + etapa de firma, filtros por estado, KPIs clicables.

### Reporte Excel
- Nuevo `GET /reports/dashboard.xlsx`: portada con 6 KPIs, hoja de estados (gráfico de pastel), empresas (barras), programas/periodos (columnas) y detalle con autofiltro. **Gráficos nativos de Excel**, inyectados como XML OOXML porque ExcelJS no tiene API de charts.

---

## 4. Recordatorios operativos

- **El proyecto vive en `C:\dev\New Tesis`** (ya no en OneDrive — el file-watcher de Turbopack no funcionaba ahí). Hay un acceso directo en el escritorio.
- **Credenciales demo**: `admin@uleam.edu.ec` / `@adminadmin007`. Los firmantes son `decano@uleam.edu.ec` y `director@uleam.edu.ec` con la misma contraseña.
- ⚠️ **En Configuración, el periodo 2024-1 tiene nombres de prueba** ("Dra. Marcia Bazurto", "Ing. Carlos Loor"). **Cámbialos por los reales antes de la defensa.** El periodo 2025-2 no tiene autoridades → la generación estará bloqueada ahí hasta configurarlas.
- Para levantar todo: `cd C:\dev\New Tesis && npm run dev` (necesita Docker corriendo para Postgres/Redis/MinIO).
