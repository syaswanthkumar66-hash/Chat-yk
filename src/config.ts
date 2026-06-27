// Dynamic backend URL configuration for separating frontend and backend hosting.
export const BACKEND_URL = ((import.meta as any).env?.VITE_BACKEND_URL as string) || '';
