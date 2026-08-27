import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const defaultApiUrl = "https://edekhbhal-staging.vercel.app";
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  defaultApiUrl
).replace(/\/$/, "");

export const SESSION_KEY = "edekhbhal.sessionToken";
export const ORGANIZATION_KEY = "edekhbhal.organizationId";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const token = await SecureStore.getItemAsync(SESSION_KEY);
  const organizationId = await SecureStore.getItemAsync(ORGANIZATION_KEY);
  const headers = new Headers(init.headers || {});
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (organizationId) headers.set("x-organization-id", organizationId);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status, data.code);
  }
  return data as T;
}
