# -*- coding: utf-8 -*-
"""
Genera las cuatro láminas de conclusión de objetivos específicos.

Las cuatro comparten estructura —número grande, objetivo, conclusión y línea
de evidencia—, así que se escriben una sola vez y se rellenan con datos. Editar
el texto de una conclusión es tocar el diccionario de abajo y volver a correr
el script, no reacomodar coordenadas a mano.

Uso:  python generar-conclusiones.py
"""
import os

ANCHO, ALTO = 1920, 1080
AZUL, TINTA, GRIS = '#2563EB', '#0F172A', '#64748B'
FUENTE = 'Arial, Helvetica, sans-serif'

# Columna de texto: arranca a la derecha del número grande.
X_TEXTO = 420
ANCHO_TEXTO = ANCHO - X_TEXTO - 80


def partir(texto, max_chars):
    """Reparte el texto en líneas sin cortar palabras."""
    palabras, lineas, actual = texto.split(), [], ''
    for p in palabras:
        prueba = f'{actual} {p}'.strip()
        if len(prueba) > max_chars and actual:
            lineas.append(actual)
            actual = p
        else:
            actual = prueba
    if actual:
        lineas.append(actual)
    return lineas


def bloque(texto, x, y, tam, alto_linea, color, max_chars, peso='400'):
    """Devuelve los <text> de un párrafo ya repartido en líneas."""
    salida = []
    for i, linea in enumerate(partir(texto, max_chars)):
        salida.append(
            f'  <text x="{x}" y="{y + i * alto_linea}" font-family="{FUENTE}" '
            f'font-size="{tam}" font-weight="{peso}" fill="{color}">{linea}</text>'
        )
    return '\n'.join(salida), y + len(partir(texto, max_chars)) * alto_linea


OBJETIVOS = [
    {
        'n': 1,
        'objetivo': 'Analizar el procedimiento actual de emisión de solicitudes, designaciones y '
                    'certificados, con el fin de establecer los requerimientos funcionales y no '
                    'funcionales de la aplicación web.',
        'conclusion': 'El procedimiento vigente se documentó desde dos fuentes contrastadas —la entrevista '
                      'a la funcionaria que ejecuta el trámite y el cuestionario al docente responsable—, '
                      'cotejadas con los formatos institucionales y con expedientes de períodos anteriores. '
                      'Las dos coincidieron en el origen de los errores, en la fragilidad del archivo físico '
                      'y en el carácter manual de la coordinación de firmas. De cada punto crítico se derivó '
                      'un requisito: ninguna función del sistema descansa sobre un supuesto.',
        'evidencia': 'Evidencia: Capítulo III, apartados 3.9.1 y 3.9.2 · Anexos A y J',
    },
    {
        'n': 2,
        'objetivo': 'Determinar la arquitectura de software, las herramientas tecnológicas y la '
                    'metodología de desarrollo más adecuadas para la construcción de la aplicación.',
        'conclusion': 'La selección tecnológica se resolvió comparando alternativas para cada capa antes de '
                      'comprometer una decisión, y no enumerando lo ya conocido. La arquitectura '
                      'cliente-servidor se apoya en un modelo relacional que abarca facultades, carreras, '
                      'períodos, estudiantes, prácticas y documentos, con la integridad garantizada por el '
                      'propio motor de base de datos. La elección operó además bajo una restricción '
                      'declarada desde el inicio: software libre y equipo propio, sin costo de licenciamiento '
                      'ni de infraestructura.',
        'evidencia': 'Evidencia: Capítulo II, apartado 2.6 · Tablas 2 a 5 · Capítulo IV, apartado 4.5',
    },
    {
        'n': 3,
        'objetivo': 'Desarrollar la aplicación web bajo un enfoque iterativo e incremental, cubriendo '
                    'la generación documental y el circuito de firma electrónica.',
        'conclusion': 'La construcción avanzó por iteraciones quincenales, y cada una cerró con un módulo '
                      'utilizable, no con un avance parcial: el acceso diferenciado por roles, la '
                      'administración académica con importación masiva desde hojas de cálculo, el motor '
                      'documental, el circuito de firma electrónica y el procesamiento por colas para las '
                      'emisiones en lote. Ese orden no fue arbitrario: cada iteración habilitaba la '
                      'siguiente, y la de colas solo tenía sentido una vez que el motor documental '
                      'producía documentos válidos.',
        'evidencia': 'Evidencia: Capítulo IV, apartado 4.5 · Iteraciones 1 a 6',
    },
    {
        'n': 4,
        'objetivo': 'Validar el funcionamiento de la aplicación mediante pruebas de sus requerimientos '
                    'funcionales, verificando que cada módulo responda a los requisitos levantados.',
        'conclusion': 'El sistema se empaquetó en contenedores y se validó en un entorno de producción local. '
                      'Cada requisito funcional se sometió a un caso de prueba con precondición y resultado '
                      'esperado definidos de antemano, y la matriz deja constancia módulo por módulo. Las '
                      'pruebas confirmaron que el circuito de firma exige el orden establecido entre las dos '
                      'autoridades y que ningún documento alcanza validez mientras le falte alguna de las dos '
                      'rúbricas. A la validación funcional se sumó una medición: emitir los ciento veinticuatro '
                      'certificados de un cierre real tomó cinco minutos con cincuenta y cinco segundos, frente '
                      'a las doce horas y veinticuatro minutos del procedimiento manual.',
        'tam': 24,
        'evidencia': 'Evidencia: Capítulo V, apartado 5.2 · Tabla 15 · Anexo K',
    },
]


def lamina(d):
    partes = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ANCHO} {ALTO}" width="{ANCHO}" height="{ALTO}">',
        f'  <title>Conclusión del objetivo específico {d["n"]}</title>',
        f'  <rect width="{ANCHO}" height="{ALTO}" fill="#FFFFFF"/>',
        '',
        '  <g id="encabezado">',
        f'    <rect x="80" y="72" width="72" height="8" rx="4" fill="{AZUL}"/>',
        f'    <text x="168" y="86" font-family="{FUENTE}" font-size="26" font-weight="700" '
        f'letter-spacing="6" fill="{AZUL}">CAPÍTULO VI · CONCLUSIONES</text>',
        f'    <text x="80" y="162" font-family="{FUENTE}" font-size="64" font-weight="800" '
        f'fill="{TINTA}">Conclusión del objetivo específico {d["n"]}</text>',
        '  </g>',
        '',
        # El número vive detrás del texto, como marca de agua: ordena la serie
        # sin competir con lo que hay que leer.
        f'  <text id="numero" x="80" y="560" font-family="{FUENTE}" font-size="300" '
        f'font-weight="800" fill="#DBEAFE">{d["n"]}</text>',
        '',
        '  <g id="objetivo">',
        f'    <text x="{X_TEXTO}" y="286" font-family="{FUENTE}" font-size="17" font-weight="700" '
        f'letter-spacing="2.4" fill="{AZUL}">OBJETIVO ESPECÍFICO</text>',
    ]
    cuerpo, _ = bloque(d['objetivo'], X_TEXTO, 330, 24, 34, GRIS, 96)
    partes += [cuerpo, '  </g>', '']

    partes += [
        '  <g id="conclusion">',
        f'    <rect x="{X_TEXTO}" y="452" width="{ANCHO_TEXTO}" height="4" rx="2" fill="#DBEAFE"/>',
        f'    <text x="{X_TEXTO}" y="512" font-family="{FUENTE}" font-size="17" font-weight="700" '
        f'letter-spacing="2.4" fill="{AZUL}">CONCLUSIÓN</text>',
    ]
    # El cuerpo de la conclusión se ajusta al texto: las que son largas bajan
    # de tamaño en vez de derramarse hacia el pie. `tam` permite forzarlo.
    tam = d.get('tam', 29)
    alto_linea = int(tam * 1.5)
    max_chars = int(ANCHO_TEXTO / (tam * 0.50))
    cuerpo, fin = bloque(d['conclusion'], X_TEXTO, 566, tam, alto_linea, TINTA, max_chars)
    partes += [cuerpo, '  </g>', '']

    partes += [
        f'  <text id="evidencia" x="{X_TEXTO}" y="{max(fin + 40, 980)}" font-family="{FUENTE}" '
        f'font-size="19" fill="#94A3B8">{d["evidencia"]}</text>',
        '</svg>',
    ]
    return '\n'.join(partes)


if __name__ == '__main__':
    destino = os.path.dirname(os.path.abspath(__file__))
    for d in OBJETIVOS:
        ruta = os.path.join(destino, f'conclusion-objetivo-{d["n"]}.svg')
        with open(ruta, 'w', encoding='utf-8') as f:
            f.write(lamina(d))
        print('generada:', os.path.basename(ruta))
