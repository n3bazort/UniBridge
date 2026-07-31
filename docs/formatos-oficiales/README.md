# Formatos oficiales de la Facultad

Aquí viven los dos formatos institucionales que el sistema debe reproducir, tal
como los entrega la Facultad de Ciencias de la Vida y Tecnologías. Son la fuente
de verdad: cualquier cambio en las plantillas del sistema se compara contra estos
archivos.

| Archivo | Código institucional | Para qué sirve |
|---|---|---|
| `PAP-001 - Solicitud de practicas (original diligenciado).docx` | PAP-001 | Pide a la empresa la apertura de vacantes para un grupo de estudiantes |
| `Designacion de estudiante y tutor (original diligenciado).docx` | (sin código impreso) | Comunica a la empresa qué estudiante fue designado y quién es su tutor académico |

## Por qué no están en el control de versiones

Los dos ejemplares son documentos **reales ya diligenciados**: llevan nombres y
números de cédula de estudiantes, y la imagen de la firma manuscrita y el sello
del Responsable de Prácticas. Subir eso al repositorio publicaría datos
personales y una firma reutilizable, así que la regla `*.docx` del `.gitignore`
los deja fuera a propósito.

Quien necesite consultarlos debe pedírselos a la Facultad.

## Qué contiene cada uno

**Solicitud (PAP-001).** Encabezado con el código del formato y el procedimiento.
Cuerpo con destinatario, cargo, empresa y asunto; número de vacantes, carrera,
horas y nivel de práctica; tabla de estudiantes con apellidos y nombres, cédula y
carrera; área de desempeño solicitada; y el bloque de firma del Responsable con
su cédula, teléfono y correo.

**Designación.** Membrete de página completa. Cuerpo con destinatario, cargo,
institución y asunto; tabla de un estudiante con apellidos y nombres, cédula,
carrera, horas y tutor académico; y al pie, la firma del Responsable junto con la
copia al tutor académico y al estudiante.

## Sobre la firma y el sello

En los dos originales la firma es una **imagen** pegada en el documento, y el
sello es otra imagen que lleva el periodo impreso (`PERÍODO 2026-1`), por lo que
cambia cada periodo. No son firmas electrónicas: el circuito de firma con
FirmaEC es un paso distinto y posterior.
