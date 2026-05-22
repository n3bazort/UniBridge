import axios from 'axios'
import { useAuthStore } from '@/stores/auth-store'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'

export const api = axios.create({
  baseURL: API_URL,
})

// Request interceptor: attach access token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: handle 401s and refresh automatically
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    // Catch 401 Unauthorized errors (and ensure we haven't already retried this request)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      
      try {
        const refreshToken = useAuthStore.getState().refreshToken
        if (!refreshToken) {
          throw new Error('No refresh token available')
        }

        // Call the backend refresh endpoint
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken })
        
        // Update both tokens in Zustand store
        useAuthStore.getState().updateTokens({
          accessToken: data.access_token,
          refreshToken: data.refresh_token
        })
        
        // Retry original request with the new access token
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`
        return api(originalRequest)
      } catch (refreshError) {
        // If the refresh token is expired/invalid, force logout
        useAuthStore.getState().logout()
        // Client-side redirect
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      }
    }
    
    return Promise.reject(error)
  }
)
