# UniBridge — 10 vectores animables con Veo 3

Cada idea son tres archivos: el SVG editable y dos PNG de 1920×1080 (`-inicio`, `-fin`).
Veo 3 trabaja en clips de ~8 s, así que cada prompt describe exactamente 8 segundos.

---

## Cómo se usan los dos fotogramas

Los SVG llevan dos capas superpuestas, `estado-inicial` y `estado-final`, que ocupan el
mismo sitio píxel a píxel. El exportador apaga una u otra:

```bash
node docs/animaciones-svg/exportar-png.cjs
```

Eso deja en `png/` un par por idea. Con ese par tienes dos caminos:

- **Frames to Video** (Flow → *ingredientes*, primer y último fotograma): pasas `-inicio`
  y `-fin`, y Veo solo tiene que inventar el trayecto. Es el modo fiable: los colores,
  las posiciones y el texto finales se los das tú, no los adivina.
- **Image to Video** (solo `-inicio`): Veo improvisa más. Úsalo cuando el movimiento
  importe más que la exactitud, o si el modo de dos fotogramas no está disponible.

Los prompts de abajo están escritos para el modo de dos fotogramas. Si usas solo la
imagen de inicio, añade al final del prompt la frase que aparece en *Solo inicio*.

## Reglas que van en todos los prompts

Van ya incrustadas en cada uno; se repiten aquí para que puedas reutilizarlas:

```
Fixed locked-off camera. No camera movement, no zoom, no parallax, no shake.
Flat 2D vector motion graphics on a pure white background. Uniform stroke weights
that never change thickness. Do not redraw, warp, distort or re-render any text or
letterforms — treat all text as a static locked layer.
```

**Negative prompt** (el mismo para los diez):

```
3D, depth, shading, gradients, drop shadows, glow, camera movement, zoom, pan,
handheld shake, lens flare, film grain, morphing text, garbled letters, misspelled
words, extra objects, people, hands, watermark, logo overlay, live action, photorealism
```

**Sobre el texto:** es lo único que Veo 3 sigue deformando aunque se lo prohíbas. Si un
clip sale con las letras temblando, edita el SVG, borra el grupo de texto, reexporta,
anima solo el dibujo y vuelve a poner el texto encima en el editor de vídeo. Tarda dos
minutos y quita el problema entero.

---

## 1 · Logo constructivo

**Archivos:** `01-logo-constructivo-inicio.png` → `01-logo-constructivo-fin.png`
**Para:** la apertura de la sustentación.

```
2D vector line-draw animation of a suspension bridge logo. The bridge starts as a pale
grey outline. Over the first three seconds the dark navy stroke draws itself on top of
the grey, in order: the two vertical towers rise from the deck upward, then the main
cable sweeps left to right tracing its sag, then the anchorage curves fall to each end
of the deck, then the horizontal deck line wipes left to right, then the four vertical
hanger cables drop down from the main cable to the deck. Each of the four blue circular
nodes then appears on the deck with a small scale-up pop, one after another left to
right. Finally the wordmark below fades up from zero opacity, already fully formed and
correctly spelled, never distorting. Fixed locked-off camera, no camera movement.
Flat 2D vector motion graphics on a pure white background, uniform stroke weights that
never change thickness. Do not redraw, warp or re-render any text.

Audio: a soft low whoosh as each stroke draws, a light click on each node pop, and a
single warm tone as the wordmark appears. No music, no voice.
```

**Solo inicio:** `...then a bold navy wordmark reading "UniBridge" fades in below the bridge.`

---

## 2 · Relevo entre los tres roles

**Archivos:** `02-tres-carriles-inicio.png` → `02-tres-carriles-fin.png`
**Para:** explicar quién hace qué. Sustituye a la diapositiva de tabla de permisos.

```
2D vector animation of a serpentine track that snakes across three horizontal lanes
labelled ADMINISTRADOR, COORDINADOR and FIRMANTE. A solid blue dot travels along the
grey track from the top left, moving left to right along the first lane, curving down
the right elbow, then right to left along the middle lane, down the left elbow, then
left to right along the bottom lane. The grey track turns solid blue behind the dot as
it passes, filling progressively and never ahead of the dot. Each hollow grey circular
node the dot reaches does a quick scale-up pop and fills with solid blue. The three role
labels and the six step captions stay completely still and unchanged. Fixed locked-off
camera, no camera movement. Flat 2D vector motion graphics on a pure white background,
uniform stroke weights that never change thickness. Do not redraw, warp or re-render
any text.

Audio: a continuous soft synth glide that rises slightly at each elbow, with a crisp
click each time a node fills. No music, no voice.
```

**Solo inicio:** `...the grey track fills with blue #2563EB behind the dot.`

---

## 3 · El documento se firma

**Archivos:** `03-documento-firmado-inicio.png` → `03-documento-firmado-fin.png`
**Para:** la diapositiva de firma electrónica.

```
2D vector animation of a white document sheet with grey placeholder text lines and a
dashed signature rule. A blue handwritten signature stroke draws itself onto the dashed
rule from left to right over two seconds, following its natural curve as if written by
hand. Then a circular blue stamp, waiting at the upper right of the frame, slides down
and to the left in one smooth arc, lands on the lower right of the document with a small
squash-and-settle impact, and the ring, the dashed inner ring and the check mark inside
it all snap crisp at the moment of contact. The document does not move or bounce. The
grey text lines and the caption stay completely still. Fixed locked-off camera, no
camera movement. Flat 2D vector motion graphics on a pure white background, uniform
stroke weights that never change thickness. Do not redraw, warp or re-render any text.

Audio: a light paper-pen scratch during the signature, then a single firm rubber-stamp
thud on impact. No music, no voice.
```

**Solo inicio:** `...the stamp lands on the lower right corner of the sheet.`

---

## 4 · Firma por lote en cascada

**Archivos:** `04-lote-firmas-inicio.png` → `04-lote-firmas-fin.png`
**Para:** el diferenciador del sistema. Es el clip que más vende.

```
2D vector animation of five white document cards stacked in a diagonal cascade from
upper left to lower right, each showing grey text lines and an empty pale signature slot.
A blue signature stroke draws itself into the slot of the topmost card, then the same
stroke draws into the second card 0.15 seconds later, then the third, fourth and fifth,
in a fast staggered ripple down the stack. Each card gives a barely perceptible settle
as its signature completes; the cards never move from their positions and never rotate.
On the right the large counter ticks from 0 to 5 in step with the cascade, turning from
grey to solid blue as it reaches five. Fixed locked-off camera, no camera movement.
Flat 2D vector motion graphics on a pure white background, uniform stroke weights that
never change thickness. Do not redraw, warp or re-render any text.

Audio: five quick pen-stroke swishes in rapid succession, each slightly higher in pitch
than the last, ending in a short confirming chime. No music, no voice.
```

**Solo inicio:** `...and the counter on the right counts up from 0 / 5 to 5 / 5 in blue.`

---

## 5 · Antes y después

**Archivos:** `05-antes-despues-inicio.png` → `05-antes-despues-fin.png`
**Para:** el planteamiento del problema, al principio.

```
2D vector split-screen animation. On the left, six tilted paper documents, tangled
dashed connector lines and an analog clock drift and jitter very slightly, restless and
disordered, never settling. On the right, a pale grey pipeline of four document cards
above four hollow nodes on a horizontal rail. A clean vertical wipe travels from the
centre divider to the right edge over two seconds; everything it passes activates — the
grey rail turns solid blue filling left to right, each hollow node pops and fills solid
blue in sequence, each card outline snaps from grey to dark navy, the heading above
turns from grey to blue — and a blue check mark draws itself at the bottom with its
caption. The left half keeps its restless drift throughout and never changes colour.
Fixed locked-off camera, no camera movement. Flat 2D vector motion graphics on a pure
white background, uniform stroke weights that never change thickness. Do not redraw,
warp or re-render any text.

Audio: a low uneasy rustle of shuffling paper on the left, cut through at the wipe by a
clean rising sweep that resolves into a single calm tone. No music, no voice.
```

**Solo inicio:** `...the right half turns blue #2563EB as the wipe passes.`

---

## 6 · Embudo de importación Excel

**Archivos:** `06-embudo-excel-inicio.png` → `06-embudo-excel-fin.png`
**Para:** la carga masiva de prácticas.

```
2D vector animation of a spreadsheet grid at the top of the frame, a large funnel below
it, and three empty student cards at the bottom. The spreadsheet rows detach one by one
and fall as small blue dots into the mouth of the funnel, sliding down its inner walls,
converging into the narrow neck and dropping out of the bottom in a steady stream. As
each dot lands, one of the three cards below builds itself: its outline snaps from pale
grey to blue, its circular avatar draws, and its two grey text lines wipe in from the
left. The cards fill left to right. The spreadsheet frame, the funnel and the caption
stay completely still. Fixed locked-off camera, no camera movement. Flat 2D vector
motion graphics on a pure white background, uniform stroke weights that never change
thickness. Do not redraw, warp or re-render any text.

Audio: a light granular trickle as the dots fall, and a soft pop as each card completes.
No music, no voice.
```

**Solo inicio:** `...three blue-outlined student cards assemble at the bottom of the frame.`

---

## 7 · Anillo de progreso por etapas

**Archivos:** `07-anillo-progreso-inicio.png` → `07-anillo-progreso-fin.png`
**Para:** transición entre secciones. Es el clip que puedes cortar en cuatro trozos.

```
2D vector animation of a ring made of four equal grey arc segments with small gaps
between them, labelled REGISTRO, ASIGNACION, FIRMA and ENTREGA. Starting at the top and
moving clockwise, each arc fills with solid blue by drawing from its own start point to
its own end point, one segment at a time, with a brief pause between segments. As each
arc completes, its label snaps from grey to full dark navy weight. The percentage in the
centre counts up in step: 0, 25, 50, 75, 100. The arcs never change radius or thickness
and the gaps between segments stay exactly the same width. Fixed locked-off camera, no
camera movement. Flat 2D vector motion graphics on a pure white background, uniform
stroke weights that never change thickness. Do not redraw, warp or re-render any text.

Audio: four ascending marimba notes, one per segment, and a soft sustained resolve on
the last. No music bed, no voice.
```

**Solo inicio:** `...ending with the full ring in solid blue #2563EB and 100% in the centre.`

**Truco:** genera el clip completo una vez y córtalo en cuatro trozos de 2 s. Pones uno al
final de cada sección de la presentación y el anillo avanza contigo.

---

## 8 · Arquitectura en capas

**Archivos:** `08-arquitectura-capas-inicio.png` → `08-arquitectura-capas-fin.png`
**Para:** la diapositiva técnica de stack.

```
2D vector animation of three stacked rounded rectangles labelled PRESENTACION,
APLICACION and PERSISTENCIA, joined by pairs of small vertical arrows. A blue dot travels
down the descending arrow from the top block to the middle block, then from the middle
block to the bottom block; each block gives a subtle pulse of its outline as the dot
arrives. The dot then reverses and travels back up the ascending arrows to the top. The
grey connector arrows turn solid blue as the dot passes over them and stay blue. The
three blocks, their icons and all labels stay completely still and never move or resize.
Fixed locked-off camera, no camera movement. Flat 2D vector motion graphics on a pure
white background, uniform stroke weights that never change thickness. Do not redraw,
warp or re-render any text.

Audio: two soft descending blips as the dot travels down, two ascending blips as it
returns, and a quiet electrical hum underneath. No music, no voice.
```

**Solo inicio:** `...the connector arrows end solid blue #2563EB with the dot back at the top.`

---

## 9 · Los módulos se despliegan

**Archivos:** `09-nodo-expansion-inicio.png` → `09-nodo-expansion-fin.png`
**Para:** presentar el alcance del sistema de un vistazo.

```
2D vector animation that begins with only a dark circular hub containing the blue
suspension bridge logo, alone on a white frame. The hub pulses once. Then six straight
grey branch lines grow outward from its edge one at a time in clockwise order starting
at twelve o'clock, each line extending to its full length in about 0.3 seconds. As each
line finishes, a blue circular node scales up into place at its tip with a small
overshoot bounce, its icon draws inside it, and its label fades in beyond it, already
fully formed. The hub and its bridge logo never move, rotate or change size. Fixed
locked-off camera, no camera movement. Flat 2D vector motion graphics on a pure white
background, uniform stroke weights that never change thickness. Do not redraw, warp or
re-render any text.

Audio: a soft swelling pad, with a light airy chime as each of the six nodes lands. No
music bed, no voice.
```

**Solo inicio:** `...six labelled blue nodes end arranged evenly around the hub.`

---

## 10 · Cierre: los iconos se convierten en el logo

**Archivos:** `10-cierre-logo-inicio.png` → `10-cierre-logo-fin.png`
**Para:** la última diapositiva, justo antes de las preguntas.

```
2D vector animation in which eight small grey outline icons scattered around the edges
of the frame — a document, a clock, a briefcase, a person, a check mark, a bar chart, a
grid and a stamp — all begin travelling inward toward the centre at the same time, each
shrinking and fading as it goes. They converge and vanish at the centre point, and at
the instant the last one arrives the dark navy suspension bridge logo snaps into
existence there with a brief scale overshoot, its four blue nodes popping onto the deck
a beat later. The wordmark fades up below it, already fully formed and correctly
spelled. Fixed locked-off camera, no camera movement. Flat 2D vector motion graphics on
a pure white background, uniform stroke weights that never change thickness. Do not
redraw, warp or re-render any text.

Audio: eight soft whooshes converging and overlapping into one, a single deep impact as
the logo lands, then silence. No music, no voice.
```

**Solo inicio:** `...they collapse into the UniBridge suspension bridge logo at the centre.`

---

## Cómo encadenar los clips en la presentación

Lo que da sensación de recorrido, y no de saltos, es que algo sobreviva al corte. Dos
formas de conseguirlo, de menos a más trabajo:

1. **El anillo del nº 7 troceado.** Un arco por sección. Es lo más barato y lo más claro:
   el público sabe siempre en qué punto del proceso estás.
2. **El puente como hilo.** Abre con el nº 1 (se construye) y cierra con el nº 10 (se
   rearma). Entre medias, los otros ocho clips van sobre fondo blanco con el mismo azul,
   así que se leen como el mismo mundo aunque no compartan dibujo.

## Editar los SVG

Los grupos están nombrados en español (`torre-izq`, `cable`, `tirante-1`, `nodo-1`,
`firma-3`, `arco-2`…) para que puedas referirte a un elemento concreto dentro del prompt,
igual que hiciste con *the arched top line*. Si cambias un dibujo, reexporta con:

```bash
node docs/animaciones-svg/exportar-png.cjs
```

Y `_contacto.html` abre los diez de una vez en el navegador para revisarlos.

**Paleta:** navy `#0F172A` · azul de marca `#2563EB` (el `--primary` real de la app) ·
gris de trazo `#CBD5E1` · gris de apoyo `#94A3B8` · azul claro `#DBEAFE`.
