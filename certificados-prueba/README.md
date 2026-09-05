# Firma simulada — certificados de prueba

Todo lo necesario para ensayar el circuito de firma está en esta carpeta.

| Archivo | Para qué |
|---|---|
| `FIRMAR COMO RESPONSABLE.bat` | Arrastra aquí la carpeta del lote. Firma como Responsable de Prácticas. |
| `FIRMAR COMO DECANO.bat` | Igual, pero como Decano. Es el segundo en firmar. |
| `firmar.js` | La herramienta. Los `.bat` solo la llaman. |
| `Certificado de PRUEBA - Responsable.p12` | Certificado autofirmado de Ing. Gina Alexandra Zambrano Loor, Mg. |
| `Certificado de PRUEBA - Decano.p12` | Certificado autofirmado de Ing. Jorge Luis Palma Macías, PhD. |

La contraseña de ambos es `prueba1234`.

## Cómo se usa

1. En el panel del firmante, pulsa **Descargar todos en un ZIP**. Viene plano:
   todos los documentos de todos tus lotes sueltos, sin subcarpetas.
2. Descomprímelo en una carpeta.
3. Arrastra esa carpeta sobre `FIRMAR COMO RESPONSABLE.bat`. Firma todo lo que
   haya dentro de una pasada, sin importar de qué lote venga cada documento.
4. Los firmados aparecen en `firmados (Responsable)`.
5. Arrastra el contenido de esa carpeta al panel. Cada documento vuelve solo a
   su lote, por el código que lleva en el nombre; los lotes que queden completos
   avanzan al Decano.
6. Con la cuenta del Decano se repite lo mismo, usando `FIRMAR COMO DECANO.bat`.
   Su salida es `firmados (Decano)`, para no confundir las dos vueltas.

También se puede llamar directamente:

```bash
node certificados-prueba/firmar.js "<carpeta o PDF>" --como responsable
node certificados-prueba/firmar.js "<carpeta o PDF>" --como decano
```

Acepta varios archivos o carpetas de una vez, y recorre un nivel de subcarpetas,
que es como llega el ZIP cuando trae varios lotes.

## Qué hace exactamente

Sobre cada PDF, en este orden:

1. **Dibuja el sello visible** que deja FirmaEC: la caja azul con el nombre de
   quien firma, su cargo y la fecha. El nombre **se lee del propio certificado**
   (campo CN), igual que hace la herramienta oficial, y el sello lleva además la
   leyenda `FIRMA DE PRUEBA - sin validez jurídica`.
2. **Firma criptográficamente** con el `.p12`, de modo que el PDF lleve la
   estructura PAdES (`/Type /Sig` y `/ByteRange`) que el servidor exige al
   recibirlo.

Si tu plantilla coloca las líneas de firma en otro sitio, la caja se mueve sin
tocar el código:

```bash
node certificados-prueba/firmar.js "<carpeta>" --como decano --x 0.25 --y 0.22
```

`--x` y `--y` son fracciones del tamaño de la página, desde la esquina inferior
izquierda.

## Dos cosas que conviene saber

**La segunda firma invalida criptográficamente la primera.** Para dibujar el
sello hay que reescribir el PDF, y eso rompe el `/ByteRange` de la firma
anterior, aunque las dos cajas sigan viéndose y el documento conserve las dos
estructuras de firma. FirmaEC real no tiene ese problema porque usa
actualizaciones incrementales. Para ensayar el circuito basta, porque el sistema
comprueba la estructura de la firma y no la cadena de confianza — tal como
declara el Capítulo V de la memoria escrita.

**El xref tiene que ser clásico.** `pdf-lib` guarda por defecto con xref
comprimido y `@signpdf/placeholder-plain` no sabe leerlo: falla con
`Expected xref at NaN`. Por eso `firmar.js` guarda con `useObjectStreams: false`.
Los certificados que emite el sistema nacen con xref comprimido, así que sin esa
opción no hay manera de firmarlos aquí.

## Sobre los certificados

No sirven para firmar documentos oficiales. Son autofirmados, generados con
OpenSSL para ensayar la carga y la verificación. FirmaEC los rechaza a
propósito, porque solo admite certificados emitidos por entidades acreditadas en
Ecuador.

El campo `OU=CERTIFICADO DE PRUEBA` es intencional: cualquiera que inspeccione
el PDF ve de inmediato que se trata de un ensayo.

### Cómo regenerarlos

```bash
openssl req -x509 -newkey rsa:2048 -keyout k.pem -out c.pem -days 825 -nodes \
  -subj "/C=EC/ST=Manabi/L=Manta/O=ULEAM/OU=CERTIFICADO DE PRUEBA/CN=Nombre del Firmante"
openssl pkcs12 -export -out "Certificado de PRUEBA - Decano.p12" -inkey k.pem -in c.pem \
  -passout pass:prueba1234
rm k.pem c.pem
```

El `CN` es lo que aparecerá en el sello visible, así que conviene escribirlo tal
como debe verse.

## En producción

Nada de esto interviene. El firmante usa su propio certificado, emitido por
Security Data, ANF, el Banco Central u otra entidad acreditada, y firma con
FirmaEC.
