# Certificados de prueba

Estos certificados **no sirven para firmar documentos oficiales**. Son autofirmados,
generados con OpenSSL para ensayar el circuito de carga y verificación del sistema.
FirmaEC los rechaza a propósito, porque solo admite certificados emitidos por
entidades acreditadas en Ecuador.

## Para qué existen

El sistema no firma documentos: los descarga en lote, el firmante los suscribe con
FirmaEC y los vuelve a subir. Como FirmaEC exige un certificado acreditado, sin uno
real no habría forma de probar la subida ni la verificación. Estos certificados
cubren ese hueco durante el desarrollo.

```bash
node benchmarks/firmar-lote-de-prueba.js "<carpeta del lote descargado>" decano
```

La contraseña de ambos es `prueba1234`.

## Cómo regenerarlos

```bash
openssl req -x509 -newkey rsa:2048 -keyout k.pem -out c.pem -days 825 -nodes \
  -subj "/C=EC/ST=Manabi/L=Manta/O=ULEAM/OU=CERTIFICADO DE PRUEBA/CN=Nombre del Firmante"
openssl pkcs12 -export -out "Certificado de PRUEBA - Decano.p12" -inkey k.pem -in c.pem \
  -passout pass:prueba1234
rm k.pem c.pem
```

El campo `OU=CERTIFICADO DE PRUEBA` es intencional: cualquiera que inspeccione el PDF
ve de inmediato que se trata de un ensayo y no de una firma con validez jurídica.

## En producción

Nada de esto interviene. El firmante usa su propio certificado, emitido por Security
Data, ANF, el Banco Central u otra entidad acreditada, y firma con FirmaEC.
