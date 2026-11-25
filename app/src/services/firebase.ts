import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import type { FirebaseConfig } from '../types/vehicle';

const STORAGE_KEY = 'im_firebase_config_v1';

export function getEnvFirebaseConfig(): FirebaseConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId,
  };
}

export function getSavedFirebaseConfig(): FirebaseConfig | null {
  const envCfg = getEnvFirebaseConfig();
  if (envCfg) return envCfg;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FirebaseConfig>;
    if (!parsed.apiKey || !parsed.authDomain || !parsed.projectId || !parsed.appId) {
      return null;
    }
    return parsed as FirebaseConfig;
  } catch {
    return null;
  }
}

export function saveRuntimeFirebaseConfig(config: FirebaseConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearRuntimeFirebaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

export function getFirebaseClients(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  const config = getSavedFirebaseConfig();
  if (!config) return null;

  if (cachedApp && cachedAuth && cachedDb) {
    return { app: cachedApp, auth: cachedAuth, db: cachedDb };
  }

  const existing = getApps()[0];
  const app = existing ?? initializeApp(config);
  const auth = getAuth(app);

  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    db = getFirestore(app);
  }

  cachedApp = app;
  cachedAuth = auth;
  cachedDb = db;
  return { app, auth, db };
}

export async function resetFirebaseClients(): Promise<void> {
  if (cachedApp) {
    try {
      await deleteApp(cachedApp);
    } catch {
      // Ignore cleanup errors
    }
  }
  cachedApp = null;
  cachedAuth = null;
  cachedDb = null;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase is not configured.');
  const cred = await signInWithEmailAndPassword(clients.auth, email.trim(), password);
  return cred.user;
}

export async function registerWithEmail(
  name: string,
  email: string,
  password: string
): Promise<User> {
  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase is not configured.');
  const cred = await createUserWithEmailAndPassword(clients.auth, email.trim(), password);
  if (name.trim()) {
    await updateProfile(cred.user, { displayName: name.trim() });
  }
  return cred.user;
}

export async function loginWithGoogle(): Promise<User> {
  const clients = getFirebaseClients();
  if (!clients) throw new Error('Firebase is not configured.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(clients.auth, provider);
  return cred.user;
}

export async function logoutFirebase(): Promise<void> {
  const clients = getFirebaseClients();
  if (!clients) return;
  await signOut(clients.auth);
}

export function subscribeFirebaseAuth(callback: (user: User | null) => void): () => void {
  const clients = getFirebaseClients();
  if (!clients) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(clients.auth, callback);
}
