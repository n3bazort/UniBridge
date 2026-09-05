# Fase 6 — El circuito de firma

## Lo que hay que demostrar

1. Un certificado emitido **no vale** hasta que lo firman las dos autoridades.
2. El orden es **responsable → decano**, y no se puede saltar.
3. Solo cuando están las dos rúbricas el estudiante pasa a **Finalizado**.
4. Un tercero verifica el certificado **con la cédula, sin cuenta**.

## La demostración en vivo

Ten abiertas tres sesiones en navegadores o perfiles distintos:

| Sesión | Rol | Qué hace |
|---|---|---|
| 1 | Coordinador | Emite el lote y lo envía a firma |
| 2 | Responsable de prácticas | Descarga, firma, sube |
| 3 | Decano | Descarga lo ya firmado, firma, sube |

**El momento que conviene enseñar:** intenta firmar primero desde el decano.
El sistema lo rechaza. Es la prueba de que el orden entre autoridades no es una
convención de la pantalla, sino una regla del servidor.

## Firmar de verdad

Con FirmaEC y el `.p12` de cada autoridad, tal como se hace en la Facultad. El
sistema no firma por nadie: entrega el PDF, lo recibe firmado y comprueba que
la firma esté ahí.

## Simular la firma, sin `.p12`

Si en la defensa no vas a tener los certificados a mano, el repositorio ya trae
la simulación completa del circuito:

```bash
node .qa-audit/firma.js
```

Recorre los cinco pasos —emitir, enviar a lote, firmar como responsable, firmar
como decano, descargar el ZIP final— produciendo PDF con los marcadores que
deja FirmaEC (`/ByteRange` y `/Type /Sig`), que es **exactamente** lo que el
servidor comprueba antes de aceptar un archivo.

Lo que no simula es la validez criptográfica de la cadena de confianza: eso es
cosa de FirmaEC y del Banco Central, y conviene decirlo si preguntan.

## La verificación pública

El último paso, y el más vistoso: abre el repositorio público **sin iniciar
sesión**, escribe la cédula de un estudiante ya firmado, y sale su certificado.

> «El estudiante no tiene cuenta en el sistema y no la necesita. La cédula que
> ya consta en su certificado basta para que cualquiera —él, una empresa, otra
> universidad— compruebe que ese documento existe y quién lo firmó.»
