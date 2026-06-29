// Dynamic backend URL configuration for separating frontend and backend hosting.
const rawBackendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || '';

// If a backend URL is explicitly configured in the environment variables, we use it directly.
// Otherwise, we default to relative paths (''), which fall back to window.location.origin dynamically.
// This ensures that when the frontend is compiled statically (e.g., on Render), it respects the configured backend service URL,
// while out-of-the-box local development and unified container previews work seamlessly without manual setup.
export const BACKEND_URL = rawBackendUrl;

