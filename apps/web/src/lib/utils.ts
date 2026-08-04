import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getAssetUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.startsWith('http'))
    ? process.env.NEXT_PUBLIC_API_URL
    : (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
      ? 'http://localhost:3001/api/v1'
      : 'https://unibridge-api-035g.onrender.com/api/v1'
  const apiOrigin = apiUrl.replace(/\/api\/v1\/?$/, '')
  return `${apiOrigin}${url.startsWith('/') ? '' : '/'}${url}`
}
