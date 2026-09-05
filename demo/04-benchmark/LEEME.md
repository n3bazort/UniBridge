# Fase 7 — Los 124 certificados en vivo

Reproduce el cierre de período real: 124 certificados, que es lo que la
Comisión de Prácticas emitió en 2025-1 según la carpeta compartida con los
estudiantes (apartado 3.9.1).

## Lo que no puede pasar

**Que se mezcle con los datos de la demostración.** Son dos juegos separados
por construcción:

|  | Benchmark | Demostración |
|---|---|---|
| Cédulas | `9024xxxxxx` | `13159000xx` |
| Período | `2024-1` | `2025-2` |

El script de limpieza filtra por el prefijo `9024`: **nunca** toca a los 20
estudiantes que subiste por Excel.

## Antes de empezar

El sembrado exige que **`2024-1` esté activo**. Cámbialo en Configuración; al
terminar, vuelve a activar `2025-2` para seguir con la demostración.

## La corrida

```bash
node benchmarks/sembrar-periodo-2024-1.cjs 124
```

Borra lo sembrado antes —incluidos los PDF del almacén— y crea 124 estudiantes
con su práctica lista para certificar. Parte siempre del mismo estado: sin eso,
una corrida interrumpida deja certificados vigentes y la siguiente se niega en
bloque.

```bash
node benchmarks/prueba-rendimiento.cjs 124
```

Imprime el equipo, la fecha, el avance en vivo y el contraste con el
procedimiento manual. Deja la evidencia en `benchmarks/evidencia/`, con la hora
en el nombre para no pisar corridas anteriores.

## La última medición

| | |
|---|---:|
| Certificados | 124 |
| Tiempo total | **354,85 s** (5 min 55 s) |
| Por certificado | 2 862 ms |
| Fallos | 0 |
| Procedimiento manual | 12 h 24 min |
| **Factor de mejora** | **× 126** |

Antes de optimizar el motor documental eran 512,73 s. La diferencia salió de
tres cambios: cachear el fondo de la plantilla, dejar de escribir el PDF a
disco para volver a leerlo, y sacar el fondo en base64 del ciclo de
sustitución de variables.

## Qué decir mientras corre

> «Esto es un cierre de período completo. Ciento veinticuatro certificados, el
> mismo volumen que la Comisión emitió a mano el semestre pasado. A ella le
> tomó algo más de una jornada y media de trabajo; aquí van a ser unos seis
> minutos, en una laptop de gama baja con disco mecánico y con la sobrecarga de
> Docker sobre Windows. En un servidor dedicado bajaría más, pero prefiero
> defender lo que medí.»

## Al terminar

```bash
node benchmarks/limpiar-periodo-2024-1.cjs
```

Borra los 124 y sus archivos. Vuelve a activar `2025-2`.
