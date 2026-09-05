# Guion de sustentación — UniBridge

Lunes 24 de agosto de 2026 · Dilian Josué Bazurto García

---

## Antes de empezar: tres reglas

**1. No leas la diapositiva.** El tribunal sabe leer. La diapositiva es tu
apoyo, no tu texto. Si una lámina dice «124 certificados», tú dices *por qué*
son 124.

**2. Cada número que digas, di de dónde salió.** «Seis minutos» no es una
estimación: es lo que declaró la responsable en la entrevista, Anexo A,
pregunta 2. Esa costumbre desarma la mitad de las preguntas antes de que te las
hagan.

**3. Cuando no sepas algo, dilo y remite.** «Eso no lo medí» es una respuesta
profesional. Inventar una cifra delante de un tribunal es el único error del
que no se vuelve.

---

# El guion, diapositiva por diapositiva

## 1 · Portada

> «Buenos días. Mi nombre es Dilian Josué Bazurto García y presento el trabajo
> de titulación *Aplicación web para la gestión automatizada de solicitudes y
> certificados de prácticas preprofesionales en la Carrera de Tecnologías de la
> Información*, dirigido por el Ing. John Antonio Cevallos Macías.»

**15 segundos. No más.** Nadie recuerda una portada larga.

---

## 2 · El trámite hoy

Esta lámina es tu problema. Si el tribunal no lo compra aquí, el resto no
importa.

> «El procedimiento actual es enteramente manual. Arranca con dos oficios que
> se elaboran modificando plantillas de Word una por una: la solicitud de
> vacantes y la designación del estudiante con su tutor.
>
> Al cierre de período se emiten más de ciento veinte certificados, y cada uno
> exige llenar a mano todas sus variables. **Seis minutos por certificado**, que
> es el dato que declaró la responsable en la entrevista para el mejor caso,
> cuando todo está en orden.
>
> Y hay un tercer problema que no se ve en el tiempo: el estudiante no tiene
> forma de obtener su copia. Depende de que alguien la busque, la filtre y se la
> envíe.»

**Remate:**

> «Ciento veinticuatro certificados por seis minutos son doce horas y
> veinticuatro minutos: más de una jornada y media de una sola persona,
> transcribiendo datos que el sistema académico ya tiene.»

---

## 3 · Diagrama causa–efecto

> «Las nueve causas se agrupan en cuatro categorías. No las voy a recorrer una
> por una; lo que importa es que todas convergen en la misma pregunta de
> investigación:»

Y ahí **lees la pregunta**, que es la única cosa que sí conviene leer literal:

> «¿De qué manera una aplicación web puede automatizar la emisión de
> solicitudes, designaciones y certificados, reduciendo los tiempos de atención
> y asegurando la trazabilidad de los documentos oficiales?»

---

## 4 · Objetivos

> «El objetivo general es desarrollar la aplicación web. Se desagrega en cuatro
> específicos, y cada uno responde a una etapa del trabajo:
>
> **Fundamento** — analizar el procedimiento actual para establecer los
> requerimientos.
> **Ingeniería** — determinar arquitectura, herramientas y metodología.
> **Construcción** — desarrollar de forma iterativa.
> **Comprobación** — validar mediante pruebas formales.
>
> Cada uno se retoma al cierre con su conclusión.»

**Tip:** memoriza las cuatro palabras —*fundamento, ingeniería, construcción,
comprobación*— y el resto sale solo.

---

## 5 · Antecedentes

El error clásico aquí es narrar tres investigaciones. **No lo hagas.** Di qué
te llevaste de cada una:

> «Revisé tres trabajos, y de cada uno recogí una decisión técnica concreta, no
> una descripción.
>
> De **Delgado y Osorio**, que automatizaron la gestión de prácticas en la UIDE:
> que la documentación debe elaborarse a partir de datos que ya existen, no de
> transcripciones. Eso es el motor documental de mi sistema.
>
> De **Enríquez**, un gestor documental con motor de flujo de trabajo: la noción
> de documento que avanza por estados. Eso es la base de mi circuito de firma.
>
> De **Bornais**, un generador de certificados de código abierto: que quien
> administra las plantillas no debe depender de un programador para ajustarlas.
> Eso es mi editor visual.»

**Remate:**

> «Los tres antecedentes no están para acreditar lectura: cada uno se convirtió
> en un módulo.»

---

## 6 a 11 · Marco teórico y metodología

*(Láminas de imagen. Ajusta según lo que tengas puesto.)*

### El marco normativo PAP-01

Esta es delicada. **Sé preciso con el alcance**, porque el sistema no cubre el
manual entero:

> «Las prácticas de la ULEAM no se gobiernan por la costumbre de cada unidad,
> sino por un procedimiento codificado: el manual PAP-01, que fija cuatro etapas
> y sus formatos normalizados.
>
> Quiero ser exacto con el alcance. De los seis formatos normalizados, el
> sistema emite **uno**: la solicitud de prácticas. A ese se suman dos documentos
> que la Facultad tramita con formato propio y sin código en el manual: la
> designación de estudiante y tutor, y el certificado de culminación. **Tres
> documentos en total.**
>
> Los otros cinco quedan fuera, y no por una limitación técnica: no son trámite
> que la Comisión emita, sino registro de lo que ocurre durante la práctica. El
> F-002 lo llena el estudiante con sus actividades diarias; el F-003, el tutor
> asignado, y con él lo evalúa.
>
> Esto importa porque permite afirmar que el sistema automatiza un tramo del
> procedimiento oficial de la universidad, y no una práctica local.»

### Metodología y los dos informantes

**Aquí baja el ritmo.** Es la pregunta más peligrosa de toda la defensa.

> «La investigación es aplicada y descriptiva, no experimental y de corte
> transversal, con enfoque predominantemente cualitativo y métodos inductivo y
> deductivo.
>
> Quiero precisar un punto que podría llamarles la atención: **la población es de
> dos personas.**
>
> No es que haya entrevistado a dos de muchas. Es que solo dos intervienen en la
> emisión documental: la funcionaria que ejecuta materialmente el trámite y el
> docente responsable del proceso. Son la totalidad, no una muestra.
>
> Ante una población de dos, un muestreo probabilístico carece de sentido: no
> hay de dónde muestrear. Por eso se recurrió a la figura del **informante
> clave**, procedente cuando unas pocas personas concentran el conocimiento del
> fenómeno.»

**Si te dicen «dos personas no son representativas»:**

> «Representatividad es un criterio del muestreo probabilístico, y aquí no hay
> muestreo: hay censo. Entrevisté al cien por ciento de la población. No cabe
> error muestral porque no hay muestra.»

### Los hallazgos de la entrevista

> «La entrevista dejó una frase que resume el problema mejor que cualquier
> estadística: *el problema no es hacer uno; el problema es el final del
> semestre.*
>
> De ahí salieron tres hallazgos. **Tiempo:** el trámite consume un tiempo
> desproporcionado a su complejidad. **Fiabilidad:** al reutilizar un certificado
> anterior como base queda el nombre del estudiante previo, y se detecta cuando
> ya está firmado. **Preservación:** carpetas, impresos y nube sin criterio común.
>
> Los tres derivaron en cuatro requisitos: llenado automático, entrega en Word y
> PDF, circuito de firma ordenado y accesos por rol.»

**Remate — el mejor de toda tu defensa:**

> «Subrayo el hallazgo de fiabilidad: **el origen del error no está en el
> descuido, sino en el método.** Mientras el procedimiento consista en copiar un
> documento anterior, el error es cuestión de tiempo. Automatizarlo no lo hace
> menos probable: lo hace imposible por construcción.»

---

## 12 · Etapas de acción — las seis iteraciones

> «El desarrollo avanzó en seis iteraciones quincenales bajo Programación
> Extrema. Cada una cerró con un módulo utilizable, no con un avance parcial:
>
> 1. Configuración y núcleo de datos — monorepo, infraestructura, modelo relacional
> 2. Autenticación y control de acceso — JWT y los tres roles
> 3. Gestión académica y paneles — períodos, carreras, importación desde Excel
> 4. Motor de generación documental
> 5. Circuito de firma electrónica
> 6. Pruebas, empaquetado y cierre
>
> El orden no es arbitrario: cada iteración habilitaba la siguiente. El
> procesamiento por colas solo tenía sentido una vez que el motor documental
> producía documentos válidos.»

---

## 13 · Arquitectura

**No recites la lista.** Di qué problema resuelve cada capa. *(Ver la sección
del stack más abajo — memorízala de ahí.)*

> «Cinco capas, orquestadas con Docker Compose y levantadas con un solo comando.
>
> **Cliente:** Next.js y React, con renderizado en servidor. Konva sostiene el
> editor visual de certificados.
> **Lógica de negocio:** NestJS, que impone una estructura por dominios y
> mantiene el código ordenado conforme crece.
> **Persistencia:** PostgreSQL, con la integridad garantizada por el propio
> motor, no por el código de la aplicación.
> **Archivos y colas:** MinIO y Redis con BullMQ. Los binarios no viven en el
> disco de la base, y la generación en lote no bloquea la interfaz.
> **Motor documental:** tres herramientas, porque son tres problemas distintos.
> docxtemplater rellena Word, LibreOffice convierte a PDF, y pdf-lib dibuja por
> coordenadas.»

---

## 14 · Circuito de firma

> «El coordinador empaqueta los documentos en un lote. Las autoridades lo
> descargan, lo suscriben con **FirmaEC** —el aplicativo oficial del MINTEL— y lo
> devuelven al sistema, que verifica y libera.
>
> Hay una decisión de diseño que quiero destacar: **el sistema nunca almacena el
> certificado digital de las autoridades.** La firma ocurre en el equipo del
> firmante. UniBridge solo entrega el lote y lo recibe firmado.
>
> Y una regla que las pruebas confirmaron: ningún documento alcanza validez
> mientras le falte alguna de las dos rúbricas, y el orden es responsable primero,
> decano después.»

**Si preguntan por qué no firma el servidor:**

> «Porque implicaría custodiar la clave privada de las autoridades. Un sistema
> que puede firmar por el decano en cualquier momento no acredita nada.»

---

## 15 · Pruebas funcionales

> «Los quince requisitos funcionales se sometieron a un caso de prueba con
> precondición y resultado esperado definidos **de antemano**, no descritos
> después. La matriz deja constancia módulo por módulo, del CP-01 al CP-15.
>
> Los quince resultaron exitosos. Destaco tres:
>
> **CP-05:** la importación reporta los registros erróneos **con su fila**, y solo
> importa los válidos.
> **CP-09:** cada documento recibe un código único y correlativo, sin repeticiones,
> incluso con varios coordinadores emitiendo a la vez.
> **CP-12:** la firma respeta el orden responsable–decano y ambas quedan
> verificadas.»

---

## 16 y 17 · Diseñador de certificados y plantillas Word

Aquí **muestra, no expliques**. Y di el porqué:

> «El editor permite ubicar los campos arrastrando, sobre el fondo real del
> certificado. Esto responde al hallazgo de Bornais: quien administra las
> plantillas deja de depender de un programador para ajustarlas.
>
> Si la Facultad cambia el membrete el próximo período, lo resuelve la
> coordinación en la pantalla, no yo en el código.»

---

## 18 a 21 · La medición

> «Simulé un cierre de período completo: ciento veinticuatro certificados, que
> es el volumen que la Comisión emitió realmente en 2025-1 según la carpeta
> compartida con los estudiantes. No es una cifra escogida para la prueba.
>
> Se cronometra desde que el lote se encola hasta que el último certificado
> queda generado y almacenado. **Excluye el tiempo humano** de seleccionar y de
> revisar: lo que se reporta es el trabajo del sistema.»

> ⚠️ **USA EL NÚMERO QUE ESTÉ EN TU ANEXO K IMPRESO.**
> Si el anexo dice **8 min 33 s (512,73 s) → factor × 87**, di eso.
> Si actualizaste al valor optimizado, es **5 min 55 s (354,85 s) → factor × 126**.
> **Nunca digas uno distinto al del documento.**

> «Frente a las doce horas y veinticuatro minutos del procedimiento manual, la
> mejora resulta de un factor de [ochenta y siete / ciento veintiséis].
>
> Y quiero ser honesto con las condiciones: la medición se hizo en una laptop de
> gama baja, con disco mecánico y con la sobrecarga de Docker sobre Windows. La
> cifra es un piso, no un techo.»

---

## 22 · Limitaciones

**Dilas tú, con seguridad.** Un tribunal que descubre una limitación que
ocultaste te va a perseguir; uno al que se la declaras, la acepta.

> «Declaro cuatro límites.
>
> **Alcance:** funcional a la Carrera de TI, aunque el modelo de datos es
> multi-facultad y deja preparado el terreno.
> **Verificación de firma:** es estructural, no criptográfica. Confirma que el
> archivo lleve firma embebida y corresponda al lote, pero no recorre la cadena
> de certificación. Esa validación queda en FirmaEC.
> **Publicación en línea:** validado en producción local. La puesta en línea
> quedó supeditada a la decisión institucional sobre alojamiento.
> **Correo institucional:** no hay servicio configurado; el correo opera como
> identificador de acceso.»

---

## 23 a 26 · Conclusiones por objetivo

Una frase de cierre por objetivo. **No repitas la conclusión escrita**: quédate
con el remate.

**Objetivo 1 — Fundamento:**
> «El procedimiento se documentó desde dos fuentes contrastadas y se cotejó con
> los formatos institucionales. De cada punto crítico se derivó un requisito:
> **ninguna función del sistema descansa sobre un supuesto.**»

**Objetivo 2 — Ingeniería:**
> «La selección tecnológica se resolvió comparando alternativas para cada capa
> antes de comprometer una decisión, y no enumerando lo ya conocido. Bajo una
> restricción declarada desde el inicio: software libre y equipo propio.»

**Objetivo 3 — Construcción:**
> «Seis iteraciones quincenales, cada una cerrada con un módulo utilizable. Cada
> iteración habilitaba la siguiente.»

**Objetivo 4 — Comprobación:**
> «Quince requisitos, quince casos de prueba, quince resultados exitosos. Y las
> pruebas confirmaron lo esencial: ningún documento alcanza validez sin las dos
> rúbricas.»

**Y el cierre del general:**
> «**Objetivo general: cumplido.** La aplicación web se construyó para dar soporte
> a la Comisión de Prácticas de la Carrera de Tecnologías de la Información.»

---

## 27 · Recomendaciones

> «**A la Comisión de Prácticas:** adoptar el sistema como canal único de emisión,
> para que la trazabilidad no se diluya en circuitos paralelos; designar un
> responsable de la administración funcional; fijar una estrategia de respaldo.
>
> **A la Facultad:** decidir el alojamiento —servidores institucionales sin costo
> recurrente, o nube de gama baja—, asignar un dominio con certificado TLS y
> dotar al sistema de correo institucional. En ambas opciones la configuración
> de Docker es la misma.
>
> **A trabajos futuros:** validar la cadena de certificación al recibir los
> documentos firmados, automatizar el emparejamiento de los archivos devueltos y
> un módulo de alertas sobre el avance del trámite.»

**Fíjate:** la primera recomendación a trabajos futuros es exactamente la
limitación que declaraste en la 22. Eso demuestra que sabes dónde está el
borde de tu trabajo.

---

## 28 · Cierre

> «Con esto concluyo. Agradezco al tribunal por su tiempo y quedo atento a sus
> preguntas.»

**Cállate y respira.** No rellenes el silencio.

---

# El stack tecnológico, explicado

Memoriza **el problema**, no el nombre. Si sabes qué problema resuelve cada
pieza, puedes defender la elección aunque olvides la versión.

| Pieza | Qué problema resuelve | La frase |
|---|---|---|
| **Next.js / React** | La interfaz debe cargar rápido y ser mantenible | «Renderizado en servidor: la primera pantalla llega ya construida» |
| **Konva** | El editor visual de certificados | «Permite arrastrar campos sobre el fondo real» |
| **NestJS** | Que el código no se vuelva inmanejable | «Impone una estructura por dominios» |
| **JWT** | Sesiones sin guardar estado en el servidor | «Token de 15 minutos con refresco rotativo de 7 días» |
| **Prisma** | Hablar con la base sin escribir SQL a mano | «ORM con tipos: si cambio el modelo, el código deja de compilar» |
| **PostgreSQL** | Integridad de los datos | «La garantiza el motor, no el código de la aplicación» |
| **MinIO** | Dónde viven los PDF | «Compatible con S3. Los binarios no van en el disco de la base» |
| **Redis + BullMQ** | Emitir 124 sin congelar la pantalla | «Cola de trabajos: la generación en lote no bloquea la interfaz» |
| **docxtemplater** | Rellenar plantillas Word | «Sustituye variables conservando el formato oficial» |
| **LibreOffice headless** | Convertir Word a PDF | «Mismo documento, otro formato» |
| **pdf-lib** | Dibujar el certificado por coordenadas | «El certificado no es un Word: es un diseño» |
| **Docker Compose** | Que todo levante igual en cualquier máquina | «Un solo comando levanta el ecosistema completo» |

**La frase que resume todo, por si te preguntan «¿por qué tantas piezas?»:**

> «Rellenar Word, convertir a PDF y dibujar por coordenadas son tres problemas
> distintos. Forzar una sola herramienta a hacer los tres habría producido un
> resultado peor en los tres.»

---

# XP — Programación Extrema

Te lo van a preguntar. Es la parte metodológica más fácil de atacar si la
recitas sin entenderla.

## Qué es, en una frase

> «Una metodología ágil que privilegia entregas frecuentes y funcionales sobre
> documentación anticipada, y que asume que los requisitos se afinan al usar el
> software, no al imaginarlo.»

## Por qué la elegiste — la respuesta importante

> «Por tres razones concretas de este proyecto:
>
> **Primera: soy un solo desarrollador.** Scrum define roles —Product Owner,
> Scrum Master, equipo— que con una persona son ficción. XP no los exige.
>
> **Segunda: el requisito se descubría al usar.** La responsable no podía
> describirme el formato exacto del oficio de memoria; lo reconocía al verlo. Con
> entregas quincenales lo corregíamos sobre algo real.
>
> **Tercera: el alcance era estable pero el detalle no.** Sabía que había que
> emitir tres documentos; lo que cambiaba era cómo. XP absorbe eso mejor que un
> modelo en cascada.»

## Las prácticas de XP que usaste de verdad

**No digas que usaste todas.** Programación en parejas con un solo
desarrollador es imposible, y decirlo te delata.

| Práctica | Cómo la aplicaste |
|---|---|
| **Iteraciones cortas** | Seis, quincenales, cada una con un módulo utilizable |
| **Entregas pequeñas** | Cada fase terminó en algo que se podía usar, no en un avance |
| **Diseño simple** | Se resolvió el problema presente, sin anticipar los que no llegaron |
| **Refactorización continua** | El código se reordenó al crecer, no al final |
| **Cliente disponible** | La responsable validaba cada entrega |
| **Estándares de código** | Un solo estilo en todo el monorepo |
| **Pruebas** | Cada requisito con su caso de prueba definido antes |

**Si te preguntan por programación en parejas:**

> «No aplica: el desarrollo lo llevó una sola persona. XP se adoptó en las
> prácticas compatibles con esa condición, que declaro en el capítulo IV.»

Esa respuesta vale más que fingir.

## Las cuatro fases de XP (si preguntan la teoría)

**Exploración → Planificación → Iteraciones → Producción.**

Tus seis iteraciones son la tercera fase. La exploración fue el levantamiento
del capítulo III.

---

# Preguntas que te van a hacer

**«¿Por qué no usó una herramienta ya existente?»**
> «Ninguna reproduce el formato oficial de la ULEAM ni el circuito de firma con
> FirmaEC. Bornais, que revisé como antecedente, resuelve el diseño de plantillas
> pero no la numeración institucional ni la trazabilidad.»

**«¿Qué pasa si se cae el servidor a mitad de una emisión de 124?»**
> «La cola persiste en Redis: los trabajos pendientes sobreviven al reinicio y se
> retoman. Además cada trabajo tiene reintentos con espera creciente.»

**«¿Cómo evita que dos coordinadores se lleven el mismo número de certificado?»**
> «La numeración se resuelve en una sola sentencia dentro de PostgreSQL, que
> bloquea la fila mientras la incrementa. La segunda transacción espera y lee el
> valor ya incrementado: nunca 17 y 17, sino 17 y 18.»

**«¿El estudiante tiene cuenta?»**
> «No, y es deliberado. El estudiante no es usuario del sistema: es el sujeto del
> documento. Verifica su certificado en el repositorio público con su cédula, sin
> credenciales.»

**«¿Por qué dos formatos de salida, Word y PDF?»**
> «Porque sirven a usos distintos. El PDF es el documento definitivo, listo para
> firmar y enviar. El Word permite corregir un oficio antes de emitirlo, que fue
> un requisito que surgió del cuestionario al docente responsable.»

**«¿Y si la Facultad cambia el formato del oficio?»**
> «Se sube la nueva plantilla desde la pantalla de plantillas. No requiere tocar
> el código ni volver a desplegar.»

**«¿Esto sirve para otra carrera?»**
> «El modelo de datos es multi-facultad desde el diseño: contempla facultades,
> carreras y períodos. El alcance funcional se delimitó a TI, pero la extensión
> no exige rehacer la estructura.»

**«¿Cuánto costó?»**
> «Cero dólares de licenciamiento e infraestructura. Todo el stack es software
> libre y el desarrollo se hizo en equipo propio. El costo real aparece al
> desplegar: dominio, certificado TLS y alojamiento, y por eso está en las
> recomendaciones y no en los resultados.»

---

# Cómo memorizarlo

## No memorices el texto. Memoriza el esqueleto.

Para cada diapositiva, aprende **tres palabras clave**. El resto lo improvisas,
y sonará natural en vez de recitado.

| Lámina | Tus tres palabras |
|---|---|
| 2 · Problema | manual · seis minutos · sin autoservicio |
| 4 · Objetivos | fundamento · ingeniería · construcción · comprobación |
| 5 · Antecedentes | datos preexistentes · estados · plantillas editables |
| 12 · Iteraciones | quincenales · módulo utilizable · cada una habilita la siguiente |
| 13 · Arquitectura | cinco capas · tres problemas distintos · un comando |
| 14 · Firma | lote · FirmaEC · nunca almacena la clave |
| 15 · Pruebas | quince · definidas de antemano · módulo por módulo |
| 18 · Medición | 124 reales · excluye tiempo humano · piso no techo |
| 22 · Límites | alcance · estructural no criptográfica · local · sin correo |

## La técnica de las cuatro pasadas

**Pasada 1 — Entender.** Lee este guion entero **sin memorizar nada**. Solo
comprende por qué cada cosa está donde está.

**Pasada 2 — En voz alta, con el guion.** Léelo hablando, de pie. Vas a notar
qué frases no te suenan naturales: **cámbialas por las tuyas**. Un guion que no
suena a ti se nota.

**Pasada 3 — Solo las palabras clave.** Tapa el guion, mira la tabla de arriba
y habla. Te vas a trabar. Está bien: ahí es donde aprendes.

**Pasada 4 — Cronometrada, sin nada.** De corrido, mirando solo las
diapositivas. Si te pasas del tiempo, corta contenido, no aceleres.

## Los tres momentos que sí van palabra por palabra

Todo lo demás puede improvisarse. Estos tres, no:

1. **La pregunta de investigación** (lámina 3) — se lee literal.
2. **La justificación de los dos informantes** — es tu defensa, tiene que salir
   sin dudar.
3. **«El origen del error no está en el descuido, sino en el método»** — es tu
   mejor frase. Ensáyala hasta que suene inevitable.

## El día anterior

- **No estudies contenido nuevo.** Repasa lo que ya sabes.
- **Ensaya el arranque diez veces.** Los primeros treinta segundos deciden cómo
  te escuchan el resto.
- **Prepara el entorno de la demostración** y déjalo corriendo.
- **Duerme.** En serio: rendirás más con seis horas de sueño que con dos de
  repaso.

## Durante

- **Habla más lento de lo que crees necesario.** Los nervios aceleran; lo que a
  ti te parece lento, al tribunal le parece normal.
- **Mira a los tres, no a la pantalla.**
- **Si te trabas, para y respira.** Un silencio de dos segundos no se nota. Un
  balbuceo, sí.
- **Si preguntan algo que no sabes:** «No lo medí / no lo contemplé en el
  alcance, y lo dejo anotado como trabajo futuro.» Punto.

---

# Tres avisos antes de imprimir

**1 · La medición.** Verifica qué número está en tu Anexo K impreso —512,73 s
(×87) o 354,85 s (×126)— y usa ese. El guion tiene los dos marcados.

**2 · Los requisitos.** La diapositiva dice quince requisitos funcionales. El
código del sistema referencia identificadores hasta RF-27. Si el documento
recoge los veintisiete, la lámina y la matriz de pruebas deberían decirlo.

**3 · El Excel.** Si en algún punto tu documento afirma que el sistema no genera
Excel, corrígelo: **sí lo hace** —importa el padrón y exporta el reporte de
prácticas—. Un tribunal que pulse *Exportar a Excel* en la demostración vería lo
contrario de lo que dice tu anexo.

---

**Suerte. Lo tienes.**

---

# La pregunta del servidor: cómo hiciste la estimación

## La respuesta corta (dila con seguridad)

> «La proyección **no se apoya en más núcleos**. Se apoya en el disco y en el
> sistema operativo, y lo sé porque medí dónde se va el tiempo.
>
> El motor de generación, aislado en memoria, produce cada certificado en
> **siete milisegundos**. En la corrida completa cada certificado tarda unos
> **dos mil ochocientos**. Es decir: **menos del uno por ciento del tiempo es
> cálculo**. El resto es esperar a que el disco confirme la escritura.
>
> Por eso la estimación se construyó sobre los dos cuellos que sí explican esa
> espera: el disco mecánico y la capa de virtualización de Docker sobre Windows.»

## Si insisten con los núcleos

Aquí está la respuesta que te distingue. **No digas que más núcleos multiplican
el rendimiento**, porque no es cierto en este sistema y te lo pueden desmontar.

> «Más núcleos, por sí solos, no cambiarían el resultado, y quiero explicar por
> qué.
>
> La cola procesa cuatro documentos concurrentes, pero eso **no son cuatro
> núcleos**: es un único proceso de Node atendiendo cuatro trabajos que están
> esperando entrada y salida. Mientras uno espera a que el almacén confirme la
> escritura, el hilo atiende al siguiente. Es un mesero atendiendo cuatro mesas,
> no cuatro meseros.
>
> Durante toda la corrida el procesador está ocioso la mayor parte del tiempo.
> Poner dieciséis núcleos no aceleraría nada mientras el disco siga siendo el
> límite.»

## Qué sí influye, en orden

| Palanca | Por qué | Efecto |
|---|---|---|
| **Disco mecánico → NVMe** | Cada certificado escribe el PDF y confirma en base. En HDD cada confirmación cuesta milisegundos de cabezal; en NVMe, microsegundos | El grueso |
| **Docker/Windows → Linux nativo** | Cada operación de disco atraviesa WSL2, el hipervisor y NTFS. El `fsync`, que es lo que usan el almacén y la base en cada confirmación, es donde más se paga | Notable |
| **Subir la concurrencia** | Es un parámetro del código, no hardware. Funciona **porque** el trabajo es de espera: se pueden solapar más esperas sin saturar nada | Barato |
| **Más núcleos** | Solo ayudarían si el cuello fuera cálculo, y no lo es | Marginal |

**El remate, si quieres cerrar fuerte:**

> «Y esto es una buena noticia para la Facultad: la mejora no depende de comprar
> un procesador caro. Depende de un disco de estado sólido y de desplegar sobre
> Linux, que es lo que ya tiene cualquier servidor institucional.»

## Si preguntan «¿eso lo midió?»

**Sé honesto. Es lo más fuerte que puedes decir.**

> «No. La proyección está declarada en el Anexo K como estimación técnica, no
> como medición, y el rango de tres a cinco veces sale de las diferencias
> reportadas entre disco mecánico y estado sólido y entre Linux nativo y
> Docker sobre Windows en cargas de entrada y salida intensiva.
>
> Lo que sí medí es el resultado en el peor hardware disponible. Y aun sin
> ninguna proyección, ese resultado ya supera al procedimiento manual por un
> factor de ciento veintiséis.»

## El error que no debes cometer

No digas «con un servidor de dieciséis núcleos sería cuatro veces más rápido».
Es falso en este sistema, y si alguien del tribunal sabe de arquitectura te
va a pedir que lo justifiques. **Tu argumento es el disco, no el procesador.**
