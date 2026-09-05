/**
 * Saca de cada SVG los dos fotogramas que pide Veo 3: el de inicio y el de fin.
 *
 * Cada dibujo lleva dos capas superpuestas —`estado-inicial` y `estado-final`—
 * que ocupan exactamente el mismo sitio. Aqui se apaga una u otra y se rasteriza:
 * el resultado son dos PNG identicos salvo en lo que la animacion debe cambiar,
 * que es justo lo que Veo necesita como primer y ultimo fotograma.
 *
 * Ejecutar desde la raiz del repo (ahi vive `sharp`):
 *   node docs/animaciones-svg/exportar-png.cjs
 */
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const carpeta = path.join(__dirname)
const destino = path.join(carpeta, 'png')

/** Apaga una capa sin tocar CSS: el atributo `opacity` va directo en el grupo. */
function apagar(svg, capa) {
  return svg.replace(`id="${capa}"`, `id="${capa}" opacity="0"`)
}

async function main() {
  fs.mkdirSync(destino, { recursive: true })
  for (const archivo of fs.readdirSync(carpeta).filter((f) => f.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(carpeta, archivo), 'utf8')
    const base = archivo.replace('.svg', '')

    const variantes = [
      ['inicio', apagar(svg, 'estado-final')],
      ['fin', apagar(svg, 'estado-inicial')],
    ]

    for (const [nombre, contenido] of variantes) {
      const salida = path.join(destino, `${base}-${nombre}.png`)
      await sharp(Buffer.from(contenido))
        .resize(1920, 1080, { fit: 'contain', background: '#FFFFFF' })
        .png()
        .toFile(salida)
      console.log('->', path.basename(salida))
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
