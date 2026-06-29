// Dynamic backend URL configuration for separating frontend and backend hosting.
const rawBackendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || '';

// Detect if we are running in the development preview, local workspace, or Cloud Run preview environment.
// In these cases, we must use same-origin relative paths to avoid sandbox iframe blocks & Socket.IO timeouts.
const isLocalOrPreview = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.includes('ais-dev') ||
  window.location.hostname.includes('ais-pre') ||
  window.location.hostname.includes('googleusercontent.com') ||
  window.location.hostname.includes('run.app')
);

export const BACKEND_URL = isLocalOrPreview ? '' : rawBackendUrl;
