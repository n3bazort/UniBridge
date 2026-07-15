export type Role = 'ADMIN' | 'COORDINATOR' | 'STUDENT' | 'SIGNER'

export interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  role: Role
  facultyId?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginResponse extends AuthTokens {
  user: User
}

export interface RefreshResponse extends AuthTokens {}
