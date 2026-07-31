# Construcción de las plantillas DOCX oficiales

La Facultad emite dos oficios en Word y de vez en cuando cambia su formato. Estos
scripts rehacen las plantillas del sistema **partiendo del formato oficial**, en
vez de editarlas a mano: así el documento generado conserva la tipografía, los
márgenes, el membrete y los estilos con los que la Facultad viene trabajando.

## Cómo se usa

Se parte de un ejemplar diligenciado, guardado en `docs/formatos-oficiales/`
(esa carpeta no se versiona: los ejemplares llevan datos reales y una firma).

```bash
node scripts/plantillas/plantilla-solicitud.js "salida/maestra.docx" "apps/web/public/templates/Solicitud de Prácticas Oficial.docx"
```

El primer argumento es la **maestra**, con la firma y el sello incrustados: va a
`_local/plantillas-maestras/` y se sube a MinIO desde el sistema. El segundo es la
**pública**, sin firma ni sello, que se publica como formato de ejemplo.

Para revisar el resultado sin tocar la base de datos:

```bash
node scripts/plantillas/probar-plantilla.js "salida/maestra.docx" "salida/prueba.docx" 5
```

El último número es la cantidad de estudiantes del lote, útil para comprobar que
la tabla crece bien y que el bloque de firma no se parte entre hojas.

## Qué hace cada script

| Script | Responsabilidad |
|---|---|
| `docx-tools.js` | Sustituir texto en un `.docx` aunque Word lo haya partido en varios runs |
| `plantilla-solicitud.js` | Marcadores, tabla en bucle y bloque de firma de la solicitud PAP-001 |
| `plantilla-designacion.js` | Lo mismo para la designación, más el cierre a dos columnas |
| `probar-plantilla.js` | Rellena una plantilla con datos de prueba, igual que el motor |

## Decisiones que conviene no deshacer

- **La sustitución es consciente de los runs.** Word parte una misma frase en
  varios `<w:r>` según el historial de edición, así que buscar la cadena en un
  solo nodo falla. `docx-tools.js` localiza el rango sobre el texto concatenado y
  lo reescribe repartido.
- **La fila de títulos se repite al pasar de hoja** (`<w:tblHeader/>`): un listado
  largo sin encabezado obliga a volver a la página anterior.
- **El bloque de firma no se parte** (`<w:keepNext/>` y, en la designación,
  `<w:cantSplit/>`): un nombre en una hoja y su cargo en la otra no lo firma nadie.
- **En la designación las imágenes van ancladas, no en línea.** Una imagen en línea
  ocupa alto real —el sello mide 2,8 cm— y empujaba el oficio a una segunda hoja.
  Anclada se superpone al hueco de firma sin gastar espacio, que es el mismo
  recurso que usa el original de la Facultad.
- **La variante pública no lleva firma ni sello.** `apps/web/public/` lo sirve el
  navegador sin pedir contraseña: una firma escaneada ahí es una firma que
  cualquiera recorta y reutiliza.
- **La concordancia vive en la plantilla, no en el código.** El helper
  `SI_VARIOS(plural, singular)` de `plantilla-designacion.js` escribe secciones
  condicionales `{{#varios}}…{{/varios}}{{^varios}}…{{/varios}}`. El motor solo
  inyecta el booleano `varios`, calculado desde cuántos estudiantes ampara el
  papel. Así, si la Facultad cambia la frase, se edita en Word.
- **`varios` depende del papel, no del alcance configurado.** Un oficio con
  alcance por empresa que ampara a un solo estudiante también sale en singular.
