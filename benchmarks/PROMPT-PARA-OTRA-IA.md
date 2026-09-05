# Encargo: prueba de rendimiento de emisión masiva de certificados (UniBridge)

Eres un agente de código trabajando en el repositorio **UniBridge** (monorepo, raíz
`C:\dev\New Tesis`). Sistema: Windows 11, PowerShell, con Git Bash disponible. El backend
es **NestJS + Prisma + PostgreSQL + Redis + MinIO**, todo dockerizado. Los certificados se
generan con **pdf-lib** y se procesan por una **cola BullMQ** con 4 trabajos en paralelo.

## Objetivo

Ejecutar una prueba de rendimiento REAL de la emisión masiva de **124 certificados** y
producir la evidencia (transcripción + **capturas de pantalla**) para un **anexo de tesis**.
El número 124 es el volumen real de un cierre de período (2025-1) según los registros
institucionales; no es inventado.

La tesis contrasta esto contra el proceso manual: **6 minutos por certificado**, dato que
la responsable declaró en entrevista (Anexo A, pregunta 2) para el mejor caso. 124 × 6 min
≈ **12,4 horas** de trabajo manual. Hay que mostrar cuánto tarda el sistema frente a eso.

## IMPORTANTE — honestidad de los datos

En `benchmarks/evidencia/` hay capturas ANTIGUAS (`captura1_arranque.png`, etc.) que son
**recreaciones falsas** (tienen barra de macOS en una máquina Windows). NO las uses. Y hay
un `resultado-124.json` viejo que reporta 8,17 s para 124 — es irreal (el pdf-lib puro son
7 ms, pero el camino completo con MinIO+BD es ~3 s por certificado). Genera datos NUEVOS y
reales, y captura pantallas REALES de tu propia terminal.

## Estado ya preparado (no lo rehagas)

Ya existen y funcionan estos scripts en `benchmarks/`:

- **`sembrar-periodo-2024-1.cjs`** — siembra 124 estudiantes con prácticas aptas para
  certificar en el período `2024-1` (que está vacío y activo). Cédulas con prefijo `9024`.
  Es idempotente e invalida certificados vigentes previos. Uso: `node benchmarks/sembrar-periodo-2024-1.cjs 124`
- **`prueba-rendimiento.cjs`** — encola 124 vía HTTP y sondea el progreso, imprimiendo una
  tabla ordenada (equipo, fecha, serie temporal, resultado, contraste con lo manual).
  Uso: `node benchmarks/prueba-rendimiento.cjs 124`
- **`medir-drenado.cjs`** — mide el drenado observando Redis directamente (no depende del
  token HTTP). Uso cuando los 124 ya están encolados y esperando.

Credenciales de la API embebidas en los scripts: usuario `j.bazurto@uleam.edu.ec`.
La conexión a Postgres se lee de `apps/api/.env` (`DATABASE_URL`). Contenedores docker:
`ppp_postgres`, `ppp_redis`, `ppp_minio`.

## ⚠️ EL BUG que te va a frenar (y su solución)

Hay un bug en `apps/api/src/app.module.ts`, en la config de BullMQ:

```ts
BullModule.forRootAsync({
  useFactory: async (configService) => ({
    connection: {
      host: configService.get('REDIS_HOST'),
      port: configService.get('REDIS_PORT'),
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      retryStrategy: () => null,   // <-- ESTO rompe el worker
    },
  }),
  ...
})
```

`retryStrategy: () => null` impide que la conexión de bloqueo del worker se reestablezca.
**Síntoma:** el worker drena un lote justo tras arrancar la API, pero si queda inactivo y le
mandas un lote nuevo, NO despierta — los trabajos se quedan en `wait` con `active=0` y
`completed=0` para siempre. Lotes pequeños (3-5) a veces pasan; el de 124 se queda en 0 %.

**Tienes dos caminos. Elige UNO:**

### Opción A (recomendada): arreglar la config y reconstruir

1. En `apps/api/src/app.module.ts`, quita la línea `retryStrategy: () => null,` (y valora
   quitar también `enableOfflineQueue: false,`). Deja `maxRetriesPerRequest: null,`.
2. Reconstruye: `cd "C:\dev\New Tesis\apps\api" && npm run build`
3. Ejecuta el flujo normal (abajo). Con esto el worker despierta siempre y
   `prueba-rendimiento.cjs` funciona de principio a fin sin trucos.

⚠️ Es un cambio de código de producción. Si el usuario NO quiere tocar el código antes de la
defensa, usa la Opción B.

### Opción B (sin tocar código): arrancar el worker con la cola ya cargada

El worker SÍ procesa los trabajos que ya están esperando cuando ARRANCA. Así que:

1. Encola los 124 (contra una API viva), deja que se queden en `wait`.
2. Reinicia la API. Al arrancar, el worker encuentra los 124 esperando y los drena.
3. Mide con `medir-drenado.cjs` (que observa Redis, no la API).

## Reglas de oro para no repetir mis errores

- **UNA sola instancia de la API a la vez.** Antes de arrancar, MATA todo node y confirma
  que el puerto 3001 está libre; dos instancias pelean por el puerto y por la cola y todo
  se rompe con errores confusos (`EADDRINUSE`, lotes huérfanos que reaparecen):
  ```bash
  powershell -Command "taskkill /F /IM node.exe; Start-Sleep 2"
  # confirmar: 0 procesos node y nada escuchando en 3001
  ```
- **Entre corrida y corrida, resetea el estado de la cola** para partir de cero:
  ```bash
  docker exec ppp_redis redis-cli FLUSHDB
  ```
  (Redis solo tiene colas y caché; Postgres y MinIO quedan intactos.)
- **Reseedea antes de cada corrida.** Si una corrida generó certificados, esos estudiantes
  quedan bloqueados como "ya tiene certificado vigente". `sembrar-periodo-2024-1.cjs` los
  invalida. Verifica que queden 0 vigentes:
  ```bash
  docker exec ppp_postgres psql -U ppp_user -d ppp_db -t -A -c "SELECT count(*) FROM generated_documents g JOIN students s ON s.id=g.\"studentId\" WHERE s.dni LIKE '9024%' AND g.\"documentType\"='CERTIFICADO' AND g.status='VALID';"
  ```
- **Cuidado con lotes huérfanos.** Si una corrida se interrumpe (timeout, Ctrl-C), el worker
  del servidor SIGUE procesando el lote. Verifica `active`/`wait` en Redis antes de empezar
  otra, o reinicia la API.

## Flujo completo (Opción A, la recomendada)

```bash
# 0. Docker arriba (Docker Desktop). Confirmar contenedores:
docker ps --format "table {{.Names}}\t{{.Status}}"

# 1. Arreglar app.module.ts (quitar retryStrategy) y reconstruir
cd "C:/dev/New Tesis/apps/api" && npm run build

# 2. Matar node viejo, confirmar puerto libre
powershell -Command "taskkill /F /IM node.exe; Start-Sleep 2"

# 3. Limpiar cola y sembrar 124
docker exec ppp_redis redis-cli FLUSHDB
cd "C:/dev/New Tesis" && node benchmarks/sembrar-periodo-2024-1.cjs 124

# 4. Arrancar la API (dejar corriendo en su propia terminal)
cd "C:/dev/New Tesis/apps/api" && node dist/src/main.js
#   esperar a "Nest application successfully started"

# 5. En OTRA terminal, correr la prueba (aquí se toman las capturas)
cd "C:/dev/New Tesis" && node benchmarks/prueba-rendimiento.cjs 124
```

## Capturas de pantalla a tomar (para el anexo)

Toma capturas REALES de tu terminal, del proceso de verdad:

1. **Arranque/preparación** — la cabecera de `prueba-rendimiento.cjs`: equipo, fecha,
   período, plantilla, 124 seleccionados.
2. **Progreso** — la tabla de la serie temporal avanzando (t, generados, progreso %).
3. **Resultado** — el bloque RESULTADO: 124 generados, 0 fallidos, tiempo total, ms/certificado.
4. **Contraste** — el bloque que compara con las ~12 h del proceso manual.

Los scripts ya guardan `benchmarks/evidencia/prueba-124-AAAA-MM-DD.json` y `.txt`. El `.txt`
es la transcripción completa lista para el anexo; el `.json` son los datos crudos.

## Qué reportar al final

- Tiempo total real para 124 certificados y ms por certificado (número honesto, ~3 s/cert
  en un Ryzen 3 modesto; NO el 8,17 s viejo).
- El contraste: 124 en X minutos vs ~12,4 horas manuales → factor de mejora.
- Confirma 0 fallidos.
- Rutas de las capturas y del `.txt`/`.json` de evidencia.

El objetivo del anexo es cerrar el círculo que la tesis abre en la diapositiva 2 (6 min ×
124) y que hoy no cierra: pasar de "cumplí 15/15 requisitos" a "resolví el problema".
