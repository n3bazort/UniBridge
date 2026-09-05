# Kit de demostración — UniBridge

Todo lo necesario para recorrer el sistema de punta a punta delante del
tribunal: desde importar el padrón hasta que un tercero verifique un
certificado firmado con solo la cédula, sin cuenta.

## Qué hay aquí

| Carpeta | Contenido |
|---|---|
| `datos-demo.cjs` | Los datos de la demostración, en un solo sitio |
| `01-excel/` | Los dos libros de Excel: el limpio y el roto |
| `02-actas/` | Las dos actas en PDF y su verificación |
| `03-firma/` | Cómo simular el circuito de firma sin `.p12` |
| `04-benchmark/` | La emisión de los 124 certificados en vivo |
| `05-limpieza/` | Dejar un período como estaba, para repetir la demostración |

**Todo se ejecuta con doble clic.** Cada carpeta trae sus `.bat`, numerados
donde el orden importa. Los que borran datos enseñan primero qué se llevarían y
piden que escribas `BORRAR` antes de tocar nada.

**Por qué un solo archivo de datos.** El Excel y las actas tienen que hablar de
las mismas personas: si un acta nombra a alguien que no se importó, ese
estudiante no recibe su punto verde y la demostración se cae. Los dos
generadores leen de `datos-demo.cjs`, así que no pueden desincronizarse.

## Regenerar los archivos

Solo hace falta si cambias algo en `datos-demo.cjs`. Si no, los archivos ya
están hechos y son los que vas a subir.

| Doble clic en | Qué hace |
|---|---|
| `01-excel/GENERAR-EXCEL.bat` | Rehace los dos libros de Excel |
| `02-actas/GENERAR-ACTAS.bat` | Rehace las dos actas en PDF |
| `02-actas/VERIFICAR-ACTAS.bat` | Comprueba que el sistema sepa leerlas |

Ninguno toca la base de datos: solo escriben archivos en su propia carpeta.

---

## Los datos

**20 estudiantes · 4 empresas · 5 docentes**, cédulas `1315900001`–`1315900020`.

| Empresa | Estudiantes | Docentes |
|---|---:|---|
| ALTURA S.A. | 4 | Sendón Varela |
| ATUKHOSTING | 8 | Loor Zambrano (4) · Mendoza Bravo (4) |
| GAD MUNICIPAL DE JARAMIJÓ | 4 | Vera Macías |
| EPAM SERVICIOS | 4 | Cedeño Alcívar |

ATUKHOSTING lleva ocho repartidos entre dos docentes a propósito: es el caso
que demuestra que un mismo oficio de empresa convive con dos bloques de tutor.

### Aislamiento respecto al benchmark

|  | Benchmark de los 124 | Demostración |
|---|---|---|
| Cédulas | `9024xxxxxx` | `13159000xx` |
| Período | `2024-1` | `2025-2` |

`limpiar-periodo-2024-1.cjs` borra **solo** el prefijo `9024`. Los dos juegos
de datos no se tocan ni por accidente.

---

## El recorrido

### Fase 0 · Preparación (ADMIN)

- [ ] Período activo con **decano** y **responsable de prácticas** configurados
- [ ] Plantillas subidas: certificado PDF, solicitud DOCX, designación DOCX
- [ ] Cuentas de los dos firmantes creadas y con sesión abierta en otro navegador

### Fase 1 · Roles y permisos

- [ ] Entrar como **ADMIN**: ve Configuración, períodos, cuentas
- [ ] Entrar como **COORDINADOR**: comprueba qué desaparece del menú
- [ ] Confirmar que el coordinador **no** puede crear períodos ni cuentas
- [ ] Confirmar que sí puede importar, emitir oficios y certificados

> Es la parte menos probada del sistema. Conviene recorrerla sin prisa.

### Fase 2 · Importación con errores

- [ ] Subir `01-excel/Demo - Datos con errores.xlsx`
- [ ] Recorrer el informe de validación con el tribunal
- [ ] **No confirmar la importación**

El detalle de los 16 defectos está en `01-excel/ERRORES-SEMBRADOS.md`.

### Fase 3 · Importación limpia

- [ ] Subir `01-excel/Demo - Datos correctos.xlsx`
- [ ] Confirmar: 20 estudiantes, 4 empresas, 5 docentes
- [ ] Los 20 aparecen con el punto **gris**: aún sin acta

### Fase 4 · Oficios

- [ ] Marcar los 4 de ALTURA → **Solicitud** → DOCX
- [ ] Marcar los 8 de ATUKHOSTING → **Designación** → observar los dos bloques de tutor
- [ ] Marcar estudiantes de **dos empresas a la vez** → un oficio por empresa
- [ ] Anular una designación → comprobar que arrastra su solicitud

### Fase 5 · Actas

- [ ] Subir `02-actas/Acta 1207141 …Sendon Varela.pdf`
- [ ] Subir `02-actas/Acta 1207142 …Loor Zambrano.pdf`
- [ ] **6 puntos se ponen verdes** — los que aprobaron
- [ ] Los 2 que reprobaron siguen en gris, y los 12 sin acta también

Ese contraste es el argumento: el certificado depende del acta del docente,
no de lo que decida la pantalla.

### Fase 6 · Certificados y firma

- [ ] Emitir certificados de los 6 aptos
- [ ] Intentar emitir a uno sin acta → el sistema lo omite y dice por qué
- [ ] Enviar el lote a firma
- [ ] **Responsable** firma (ver `03-firma/`)
- [ ] **Decano** firma
- [ ] Comprobar que el orden se respeta: el decano no puede firmar primero
- [ ] Descargar el ZIP final desde coordinación
- [ ] Verificar un certificado en el repositorio público **solo con la cédula**

### Fase 7 · Los 124 en vivo

Ver `04-benchmark/LEEME.md`.

---

## Repetir la demostración desde cero

En `05-limpieza/`, por orden:

| Doble clic en | Qué hace |
|---|---|
| `1 - VER QUE SE BORRARIA.bat` | Simulacro: enseña qué se iría, no toca nada |
| `2 - BORRAR SOLO LOS DE LA DEMO.bat` | Borra las 20 prácticas de la demo y sus estudiantes. **Tus registros propios no se tocan** |
| `3 - BORRAR TODO EL PERIODO.bat` | Borra el período entero, lo tuyo incluido |
| `4 - BORRAR ESTUDIANTES SIN PRACTICAS.bat` | Los que quedaron sueltos tras borrar sus prácticas |

**Por qué existe el 4.** Borrar una práctica no borra al estudiante: puede
tener prácticas en otros períodos. Si te quedas a medias, al reimportar sale
«ya está registrado» porque la cédula sigue en la base. El 4 los limpia.

Ninguno borra un certificado firmado: si lo encuentra, se detiene y te dice
cuál. Eso se anula desde la aplicación, que deja registrado el motivo.

## Si algo falla a mitad

**La sesión expira a los 15 minutos.** Si una pantalla aparece vacía —sin
plantillas, sin prácticas— casi siempre es eso: vuelve a entrar. No se ha
perdido nada.
