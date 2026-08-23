import type { AuthenticatedUser } from "@estia/contracts";
import * as SecureStore from "expo-secure-store";

const K_URL = "estia.istanza";
const K_TOKEN = "estia.token";
const K_USER = "estia.utente";
const K_DEVICE = "estia.dispositivo";

export interface MemoriaSessione {
  url: string;
  token: string;
  user: AuthenticatedUser;
}

export async function leggiUrlIstanza(): Promise<string | undefined> {
  const value = await SecureStore.getItemAsync(K_URL);
  return value === null || value === "" ? undefined : value;
}

export async function scriviUrlIstanza(url: string): Promise<void> {
  await SecureStore.setItemAsync(K_URL, url);
}

export async function cancellaUrlIstanza(): Promise<void> {
  await SecureStore.deleteItemAsync(K_URL);
}

export async function leggiSessione(): Promise<MemoriaSessione | undefined> {
  const [url, token, rawUser] = await Promise.all([
    SecureStore.getItemAsync(K_URL),
    SecureStore.getItemAsync(K_TOKEN),
    SecureStore.getItemAsync(K_USER),
  ]);

  if (url === null || token === null || rawUser === null) {
    return undefined;
  }

  try {
    const user = JSON.parse(rawUser) as AuthenticatedUser;
    if (typeof user.username !== "string") {
      return undefined;
    }
    return { token, url, user };
  } catch {
    return undefined;
  }
}

export async function scriviSessione(sessione: MemoriaSessione): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(K_URL, sessione.url),
    SecureStore.setItemAsync(K_TOKEN, sessione.token),
    SecureStore.setItemAsync(K_USER, JSON.stringify(sessione.user)),
  ]);
}

export async function cancellaSessione(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(K_TOKEN), SecureStore.deleteItemAsync(K_USER)]);
}

function generaUuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function dispositivoId(): Promise<string> {
  const esistente = await SecureStore.getItemAsync(K_DEVICE);
  if (esistente !== null && esistente.length > 0) {
    return esistente;
  }

  const creato = generaUuidV4();
  await SecureStore.setItemAsync(K_DEVICE, creato);
  return creato;
}
