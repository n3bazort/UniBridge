# Textos para pegar en la tesis

Documento activo: `tesis-edit/vrealTesis Bazurto correcciones tribunal.docx`.
No lo edito directamente porque lo tienes abierto; aquí están los dos bloques,
listos para copiar.

---

## 1 · Mención breve dentro del Capítulo V

**Dónde va:** en el capítulo V, justo **antes** del subapartado *"Interpretación
objetiva de los resultados"*. Es decir, se convierte en el último subapartado
antes de la interpretación, con su propio título.

**Título del nuevo subapartado (nivel 2, misma jerarquía que "Limitaciones"):**

> **Prueba complementaria de rendimiento**

**Texto (dos párrafos, encaje con la redacción sobria del capítulo):**

> Con independencia de la matriz de casos de prueba que verifica los quince
> requisitos funcionales, se ejecutó una prueba complementaria orientada a
> dimensionar empíricamente la mejora de eficiencia que la investigación
> presume desde su planteamiento del problema (apartado 1.4) y que enuncia
> como impacto tecnológico esperado (apartado 1.7.1). El objetivo específico
> cuatro se refiere a la validación funcional; la prueba que se describe a
> continuación complementa esa validación con una medición del comportamiento
> del sistema en el escenario de mayor exigencia operativa: la emisión masiva
> de certificados al cierre del período.
>
> La prueba simuló un cierre real reproduciendo el volumen documentado en la
> entrevista y en los registros institucionales, ciento veinticuatro
> certificados (apartado 3.9.1). El sistema los emitió en cinco minutos y
> cincuenta y cinco segundos, sin fallos y con trazabilidad íntegra. Frente a las
> doce horas y veinticuatro minutos que exigiría el procedimiento manual con
> los seis minutos por certificado declarados por la responsable, la mejora
> resulta de un factor de ciento veintiséis. El detalle metodológico, las
> consideraciones sobre el equipo utilizado y la proyección sobre servidor
> dedicado se documentan en el Anexo K.

**Nota de encaje:** este texto NO altera la conclusión del Objetivo 4. La
conclusión sigue diciendo que se verificaron los quince requisitos funcionales.
La medición es material adicional, no una reformulación del objetivo.

---

## 2 · Anexo K — Prueba de rendimiento (documento completo)

**Dónde va:** al final del bloque de anexos, después del Anexo J.

---

### Anexo K. Prueba de rendimiento de la emisión masiva de certificados

Este anexo documenta una prueba complementaria a la validación funcional del
Objetivo Específico 4. Su propósito no es verificar un requisito, sino
dimensionar el desempeño real del sistema en el escenario operativo de mayor
exigencia: la emisión de todos los certificados de un cierre de período.

#### K.1 Encaje con los objetivos y el planteamiento

La investigación no formuló requisitos no funcionales cuantitativos, de modo
que esta medición no se corresponde con un caso de prueba de la Tabla 15. Se
la ejecutó porque el planteamiento del problema (apartado 1.4) atribuye al
procedimiento manual una fricción operativa cuya magnitud solo puede
apreciarse contrastando tiempos, y porque los impactos esperados (apartado
1.7) declaran expresamente la reducción de tareas repetitivas y la mejora del
tiempo de respuesta como beneficios previstos. La medición operacionaliza esa
previsión con una cifra observable, no la sustituye ni la extiende.

#### K.2 Diseño de la prueba

Se simuló el cierre del período 2024-1 sembrando ciento veinticuatro
estudiantes, cada uno con una práctica completa y con el acta de calificaciones
aprobada por el docente, condiciones que exige el sistema para admitir la
emisión del certificado. El número ciento veinticuatro no es arbitrario: es
el volumen de certificados que la Comisión de Prácticas emitió realmente en
el período 2025-1, según la carpeta compartida con los estudiantes que se
describe en el apartado 3.9.1.

La medición se cronometra desde el momento en que el lote se encola hasta que
el último certificado queda generado y almacenado en el servidor de objetos.
El intervalo excluye el tiempo humano previo (selección de estudiantes y
elección de la plantilla) y el posterior (revisión del resultado), de modo
que la cifra que se reporta corresponde exclusivamente al trabajo del sistema.
La corrida se ejecutó una sola vez, sin repeticiones descartadas.

#### K.3 Entorno de ejecución

| Componente | Configuración |
|---|---|
| Procesador | AMD Ryzen 3 3250U · 4 hilos |
| Memoria | 14 GB |
| Almacenamiento | HDD, con escritura virtualizada por Docker |
| Sistema operativo | Windows 11 · Docker Desktop |
| Node.js | v24.14.1 |
| Motor de generación | pdf-lib |
| Cola de procesamiento | BullMQ sobre Redis, concurrencia 4 |
| Almacenamiento de objetos | MinIO (compatible S3) |
| Fecha de la corrida | 24 de agosto de 2026 |

El equipo utilizado corresponde a una laptop de gama baja del año 2020, con
disco mecánico y con la sobrecarga adicional de la capa de virtualización de
Docker sobre Windows. Estas condiciones son deliberadamente conservadoras:
la cifra que se reporta es un piso, no un techo (véase K.6).

#### K.4 Resultado

La cola procesó los ciento veinticuatro certificados en **354,85 segundos
(5 minutos 55 segundos), con cero fallos**. El tiempo medio por certificado
resultó de **2,86 segundos** y el rendimiento sostenido, de 0,35 certificados
por segundo.

La Tabla K.1 muestra seis hitos del avance real de la corrida, tomados de la
serie temporal registrada por el medidor.

**Tabla K.1.** Hitos del avance real durante la corrida.

| Tiempo transcurrido | Certificados generados | Progreso |
|---:|---:|---:|
| 0,01 s | 0 | 0 % |
| 81,06 s | 29 | 23 % |
| 146,92 s | 50 | 40 % |
| 217,88 s | 75 | 60 % |
| 296,01 s | 100 | 81 % |
| 354,85 s | 124 | 100 % |

*Nota.* Corrida única del 24-ago-2026 (fuente: `benchmarks/evidencia/prueba-124-2026-08-24-0411-optimizado.json`).

El ritmo es uniforme de principio a fin: los primeros veintinueve
certificados salen a 2,80 segundos cada uno y los noventa y cinco restantes,
a 2,88. No hay arranque en frío apreciable, y eso no es casual: la imagen de
fondo de la plantilla se trae del almacenamiento de objetos una sola vez y se
reutiliza durante todo el lote, de modo que el primer certificado no paga un
costo que los demás no paguen.

#### K.5 Contraste con el procedimiento manual

La responsable declaró en la entrevista (Anexo A, pregunta 2) que la emisión
de un certificado toma alrededor de seis minutos «cuando todo está en orden».
Esa cifra es el mejor caso del procedimiento manual: excluye la corrección de
datos incorrectos y excluye el error, descrito por la propia responsable, de
que un certificado reutilizado como base conserve el nombre del estudiante
anterior. El contraste, por lo tanto, es conservador para el manual.

| Escenario | Tiempo para 124 certificados |
|---|---:|
| Procedimiento manual (6 min × 124) | 12 h 24 min |
| UniBridge (medido) | 5 min 55 s |
| **Factor de mejora** | **× 126** |

Doce horas y veinticuatro minutos equivalen a poco más de una jornada y media
de trabajo de una sola persona; cinco minutos y cincuenta y cinco segundos, a
lo que dura una llamada telefónica. Adicionalmente, ninguna de las emisiones que
efectuó el sistema requirió transcripción manual de datos entre archivos, de
modo que el error de reutilización descrito por la responsable no puede
producirse por construcción.

#### K.6 Consideraciones sobre el hardware y proyección

El equipo utilizado no es representativo de un despliegue institucional.
Presenta tres cuellos de botella concretos:

- **Disco mecánico virtualizado.** La escritura de cada PDF al almacenamiento
  de objetos y el registro en la base atraviesan el disco duro por la capa de
  virtualización de Docker sobre Windows. En pruebas informales del motor
  aislado —`pdf-lib` en memoria, sin persistencia— el mismo equipo genera cada
  certificado en aproximadamente 7 milisegundos; el resto del tiempo lo
  consume la escritura.
- **Concurrencia conservadora, con el procesador ocioso.** El worker de la
  cola está fijado en cuatro trabajos simultáneos, valor definido en el código
  y no impuesto por el hardware. Conviene precisar que esos cuatro trabajos no
  ocupan cuatro núcleos: son cuatro operaciones asíncronas atendidas por un
  único proceso, que mientras una espera la confirmación del disco atiende a
  la siguiente. Dado que la generación del PDF consume unos 7 milisegundos de
  los 2 860 que toma cada certificado, el procesador permanece ocioso durante
  la mayor parte del lote. Elevar la concurrencia en un despliegue con
  almacenamiento de estado sólido permitiría solapar más esperas sin saturarlo.
- **Docker sobre Windows.** La traducción del sistema de archivos entre el
  contenedor Linux y el host Windows añade una sobrecarga por cada operación
  de disco. Un despliegue Linux nativo la elimina.

En un servidor dedicado Linux con almacenamiento de estado sólido, los tres
cuellos de botella se reducen simultáneamente. Como estimación conservadora
de la mejora combinada, un factor de tres a cinco veces —basado en las
diferencias típicas reportadas entre SSD y disco mecánico y entre Linux
nativo y Docker sobre Windows en cargas de I/O intensivo— sitúa el tiempo
esperado para los ciento veinticuatro certificados **entre uno y dos
minutos**. Esta cifra es una proyección técnica, no una medición; se declara
como tal y no reemplaza al dato del apartado K.4. Aun tomando el resultado
medido, sin proyección, el factor de mejora frente al procedimiento manual
supera las ciento veintiséis veces.

#### K.7 Reproducibilidad

Los scripts y la evidencia se conservan en el repositorio (véase Anexo H),
en el directorio `benchmarks/`. Para reproducir la prueba se levantan los
contenedores de PostgreSQL, Redis y MinIO, se ejecuta el sembrado del
período 2024-1 con `node benchmarks/sembrar-periodo-2024-1.cjs 124`, se
arranca la aplicación con `npm run start` desde `apps/api`, y se ejecuta
`node benchmarks/prueba-rendimiento.cjs 124`. El script produce dos archivos
en `benchmarks/evidencia/`: la transcripción completa de la corrida en texto
plano y los datos en formato JSON, incluyendo la serie temporal íntegra. El nombre de cada archivo lleva la fecha y la hora, de modo que dos corridas
del mismo día no se sobrescriben. La transcripción de la corrida documentada
en este anexo corresponde a `prueba-124-2026-08-24-0411-optimizado.txt`.

*(Insertar aquí las capturas de pantalla que tomaste durante la corrida,
como Figura K.1, K.2, K.3 y K.4 según corresponda.)*

---

## Cómo insertarlo en Word

1. Cierra el `.docx` en Word (para que se libere el archivo).
2. En el capítulo V, sitúate justo antes de "Interpretación objetiva de los
   resultados" e inserta el subapartado **Prueba complementaria de rendimiento**
   con el texto del bloque 1. Que herede el estilo de "Limitaciones".
3. Al final del bloque de anexos, después del Anexo J, pega el bloque 2. El
   título "Anexo K. Prueba de rendimiento…" con el mismo estilo que los demás
   anexos; los subtítulos K.1 a K.7 con el estilo de subapartado de anexo si
   existe, o con el mismo estilo que uses en el resto.
4. Actualiza la tabla de contenidos y las tablas.
