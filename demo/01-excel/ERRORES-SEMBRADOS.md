# Los 16 defectos de «Demo - Datos con errores.xlsx»

Cada fila rompe **una sola cosa**. Si una fila acumulara varios defectos, la
pantalla mostraría el primero y no se vería si detecta los demás.

Sirve para demostrar que el sistema valida **antes** de escribir nada: se sube,
se revisa el informe, y se decide. Nada llega a la base hasta confirmar.

## Hoja `👥 Estudiantes`

| # | Estudiante | Qué se rompió | Qué debe decir el sistema |
|---:|---|---|---|
| 1 | Alcívar Bravo | Cédula de 8 dígitos (`13159000`) | Cédula inválida |
| 2 | Briones Cedeño | Cédula duplicada de la fila 3 | Cédula repetida en el archivo |
| 3 | Chávez Delgado | Correo `no-es-un-correo` | Correo mal formado |
| 4 | Dueñas Espinales | Horas `-40` | Las horas no pueden ser negativas |
| 5 | Farías García | Horas vacías | Faltan las horas |
| 8 | Macías Mendoza | Nombre incompleto: solo «Macías» | Faltan nombres o apellidos |
| 9 | Navarrete Ostaiza | Período `2019-1` | No coincide con el período activo |
| 10 | Pincay Quijije | Nivel académico vacío | Falta el nivel académico |
| 11 | Rodríguez Solórzano | Tipo de práctica vacío | Falta el tipo de práctica |
| 13 | Zambrano Andrade | Sin cédula | La cédula es obligatoria |
| 15 | Cevallos Chávez | Celular `abcdefghij` | Celular no numérico |

## Hoja `📋 Prácticas`

| # | Estudiante | Qué se rompió | Qué debe decir el sistema |
|---:|---|---|---|
| 6 | Holguín Intriago | Empresa `EMPRESA QUE NO EXISTE S.A.` | Esa empresa no está en el directorio |
| 7 | Jaramillo Loor | Docente `Ing. Fantasma Inexistente, Mg.` | Ese docente no está en el directorio |
| 12 | Toala Vera | Área de desempeño vacía | Falta el área que imprime la solicitud |
| 14 | Alava Briones | Sin empresa | La empresa es obligatoria |

## Hoja `🏢 Empresas`

| Empresa | Qué se rompió | Por qué importa |
|---|---|---|
| EPAM SERVICIOS | Sin contacto ni cargo | Los oficios imprimen el destinatario: sin eso, la solicitud sale con un hueco |

---

## Cómo contarlo

> «El archivo no se procesa: primero se valida. Estos dieciséis defectos son
> los que aparecen en un cierre real —cédulas mal copiadas, una empresa escrita
> distinto, horas en blanco— y el sistema los nombra uno por uno, con la fila y
> el estudiante, antes de escribir nada en la base. Si confirmo, entra lo
> correcto; si no, no entra nada.»
