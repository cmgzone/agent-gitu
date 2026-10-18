import { Platform } from "react-native";

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787")
).replace(/\/$/, "");

export class MuseApi {
  constructor(readonly token: string) {}
  async request<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined || body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    // Read as text first: gateways and the server itself can answer failures
    // with HTML/empty bodies, and response.json() would crash with a raw
    // SyntaxError before the friendly error could form.
    const raw = await response.text();
    let payload: unknown;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      throw new Error("The workspace returned an unreadable response.");
    }
    if (!response.ok)
      throw new Error(
        payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
          ? ((payload as { error: string }).error)
          : `Request failed (${response.status})`,
      );
    return payload as T;
  }
  url(path: string) {
    return path.startsWith("http") ? path : `${API_URL}${path}`;
  }
}

export async function createSession(
  accessKey?: string,
): Promise<{ token: string; mode: "sample" | "live" }> {
  const response = await fetch(`${API_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey }),
  });
  const raw = await response.text();
  let payload: { error?: unknown; token?: string; mode?: string };
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(response.ok ? "The workspace returned an unreadable response." : "Could not open your workspace.");
  }
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Could not open your workspace.");
  return payload as { token: string; mode: "sample" | "live" };
}
