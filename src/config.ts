// Dynamic backend URL configuration for separating frontend and backend hosting.
const rawBackendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || '';

// If a backend URL is explicitly configured in the environment variables, we use it directly.
// We strip any trailing slashes to prevent double slashes in API endpoints (e.g., //api/...).
// Otherwise, we default to relative paths (''), which fall back to window.location.origin dynamically.
export const BACKEND_URL = rawBackendUrl.endsWith('/') ? rawBackendUrl.slice(0, -1) : rawBackendUrl;

