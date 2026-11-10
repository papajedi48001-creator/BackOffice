/**
 * The กล่องลงเวลา's own key: ECDSA P-256 made with WebCrypto as non-extractable, so the private half can sign but never be
 * read out of the browser. Kept in IndexedDB on the box; clearing site data unpairs the box.
 */
export interface PublicJwk { kty: 'EC'; crv: 'P-256'; x: string; y: string }
export interface KioskKey { publicJwk: PublicJwk; sign(payload: string): Promise<string> }
export interface KeyStorage { get(): Promise<CryptoKeyPair | null>; put(pair: CryptoKeyPair): Promise<void> }

const algorithm = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const toBase64Url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function loadOrCreateKey(storage: KeyStorage = indexedDbKeyStorage()): Promise<KioskKey> {
  let pair = await storage.get();
  if (!pair) {
    pair = await crypto.subtle.generateKey(algorithm, false, ['sign', 'verify']);
    await storage.put(pair);
  }
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateKey = pair.privateKey;
  return {
    publicJwk: { kty: 'EC', crv: 'P-256', x: jwk.x!, y: jwk.y! },
    sign: async (payload) => toBase64Url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(payload)))
  };
}

async function sha256Hex(text: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The four headers of a signed box request; the payload matches `signedPayload` on the server. `offsetMs` is server time minus the box's clock. */
export async function kioskSignedHeaders(key: KioskKey, deviceId: string, method: string, path: string, body: string, offsetMs = 0): Promise<Record<'x-device-id' | 'x-timestamp' | 'x-nonce' | 'x-signature', string>> {
  const timestamp = new Date(Date.now() + offsetMs).toISOString();
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const signature = await key.sign([method.toUpperCase(), path, timestamp, nonce, await sha256Hex(body)].join('\n'));
  return { 'x-device-id': deviceId, 'x-timestamp': timestamp, 'x-nonce': nonce, 'x-signature': signature };
}

export function memoryKeyStorage(): KeyStorage {
  let stored: CryptoKeyPair | null = null;
  return { get: async () => stored, put: async (pair) => { stored = pair; } };
}

const DB = 'attendance-kiosk';
const STORE = 'keys';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const request = work(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export function indexedDbKeyStorage(): KeyStorage {
  return {
    get: async () => (await run<CryptoKeyPair | undefined>('readonly', (store) => store.get('device-key') as IDBRequest<CryptoKeyPair | undefined>)) ?? null,
    put: async (pair) => { await run('readwrite', (store) => store.put(pair, 'device-key')); }
  };
}

/** Which box this browser is, saved after pairing. Not secret: requests are trusted by signature, not by this id. */
export const kioskDeviceStorageKey = 'attendance-kiosk-device';
