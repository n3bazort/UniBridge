import type { GeneratedDoc } from '@/components/practices/EntityList'

export interface PracticeLabel {
  id: string
  name: string
  color: string
  isSystem: boolean
  requiresCompletion: boolean
}

/**
 * Cómo se lee el estado que el sistema deriva de los documentos.
 *
 * Son tres momentos del recorrido documental —no iniciado, en proceso y
 * finalizado— más las dos decisiones humanas. `color` tiñe el punto y
 * `colorTexto` escribe el rótulo en un tono más oscuro, porque los mismos
 * valores que funcionan en un punto de 6 px no se leen como texto.
 */
export const ESTADOS_DERIVADOS: Record<string, { texto: string; color: string; colorTexto: string }> = {
  PENDING: { texto: 'No iniciado', color: '#94a3b8', colorTexto: '#64748b' },
  IN_PROGRESS: { texto: 'En proceso', color: '#3b82f6', colorTexto: '#1d4ed8' },
  COMPLETED: { texto: 'Finalizado', color: '#10b981', colorTexto: '#047857' },
  CANCELED: { texto: 'Cancelado', color: '#cbd5e1', colorTexto: '#94a3b8' },
  REJECTED: { texto: 'Rechazado', color: '#cbd5e1', colorTexto: '#94a3b8' },
  // Ya no se deriva (dependía de una fecha que el sistema no recoge); se deja
  // el rótulo por si quedara alguna fila antigua guardada así.
  DELAYED: { texto: 'Atrasado', color: '#f43f5e', colorTexto: '#be123c' },
}

export function leerEstado(status: string) {
  return ESTADOS_DERIVADOS[status] ?? ESTADOS_DERIVADOS.PENDING
}

/**
 * Qué le falta a una práctica para poder darse por finalizada.
 *
 * Replica la comprobación del servidor para poder anticiparla en pantalla —el
 * candado y su explicación—, pero quien decide es el servidor: aquí solo se
 * evita ofrecer algo que se va a rechazar.
 */
export function faltaParaCerrar(docs: GeneratedDoc[] = []): string[] {
  const vigente = (tipo: string) =>
    docs.some((d) => (d.documentType || 'SOLICITUD') === tipo && (d.status ?? 'VALID') === 'VALID')

  const falta: string[] = []
  if (!vigente('SOLICITUD')) falta.push('la solicitud')
  if (!vigente('DESIGNACION')) falta.push('la designación')

  const certificado = docs.find(
    (d) => d.documentType === 'CERTIFICADO' && (d.status ?? 'VALID') === 'VALID',
  )
  if (!certificado) falta.push('el certificado')
  else if (certificado.signatureStatus !== 'SIGNED') falta.push('la firma de las dos autoridades')

  return falta
}
