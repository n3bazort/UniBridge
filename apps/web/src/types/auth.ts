export type Role = 'ADMIN' | 'COORDINATOR' | 'SIGNER'

export interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  role: Role
  facultyId?: string
  /** Solo para SIGNER: DIRECTOR (Responsable de Prácticas) o DEAN (Decano). */
  signerRole?: 'DIRECTOR' | 'DEAN' | null
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginResponse extends AuthTokens {
  user: User
}

export interface RefreshResponse extends AuthTokens {}
