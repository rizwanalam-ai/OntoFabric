import axios from 'axios';

export const apiBaseUrl = import.meta.env.VITE_API_URL?.trim() || (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);
export const api = axios.create({ baseURL: apiBaseUrl });
