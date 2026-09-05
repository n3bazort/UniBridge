/**
 * Nombre de cada pantalla, en un solo sitio.
 *
 * Antes el topbar tenía su propio mapa y cada página escribía su `h1` a mano,
 * así que los dos se contradecían: el topbar decía «Resumen General» y la
 * página «Dashboard Ejecutivo»; el topbar «Certificados Emitidos» y la página
 * «Documentos y Firmas»; el topbar «Empresas e Instituciones» y la página
 * «Directorio de Empresas». Para poder hablar de una pantalla con un
 * compañero primero había que decidir cuál de los dos nombres era el bueno.
 *
 * Ahora el topbar y el `PageHeader` leen de aquí, de modo que no pueden
 * discrepar. La capitalización es oración («Actas de culminación», no «Actas
 * de Culminación»): es la norma del español, y antes convivían las dos formas
 * para la misma pantalla.
 */
export const PAGE_TITLES: Record<string, string> = {
  '/practices': 'Registro de prácticas',
  '/documents': 'Documentos y plantillas',
  '/documents/designer': 'Diseñador de certificados',
  '/certificates': 'Certificados emitidos',
  '/companies': 'Empresas e instituciones',
  '/students': 'Estudiantes',
  '/overview': 'Resumen general',
  '/imports': 'Importación de datos',
  '/completion-records': 'Actas de culminación',
  '/settings': 'Configuraciones del sistema',
  '/users': 'Gestión de usuarios',
  '/signer-dashboard': 'Firma de documentos',
}

export function pageTitle(pathname: string): string {
  return PAGE_TITLES[pathname] ?? ''
}
