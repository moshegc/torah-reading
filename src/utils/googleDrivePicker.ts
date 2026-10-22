// Browser utility for Google Sign-In & Google Drive File Picker
// Uses Google Identity Services (GIS) and Google Picker API to let teachers
// sign in with Google or pick private/shared audio & PDF files directly from their Drive.

const STORAGE_KEY_GOOGLE_CLIENT_ID = 'torah_trainer_google_client_id';
const STORAGE_KEY_GOOGLE_API_KEY = 'torah_trainer_google_api_key';

export interface PickedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  isFolder?: boolean;
}

export function getGoogleClientId(): string {
  const envClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
  if (envClientId && envClientId.trim()) return envClientId.trim();
  try {
    return (localStorage.getItem(STORAGE_KEY_GOOGLE_CLIENT_ID) || '').trim();
  } catch {
    return '';
  }
}

export function setGoogleClientId(clientId: string) {
  try {
    localStorage.setItem(STORAGE_KEY_GOOGLE_CLIENT_ID, clientId.trim());
  } catch {
    // ignore
  }
}

export function getGoogleApiKey(): string {
  const envKey = (import.meta as any).env?.VITE_GOOGLE_API_KEY || '';
  if (envKey && envKey.trim()) return envKey.trim();
  try {
    return (localStorage.getItem(STORAGE_KEY_GOOGLE_API_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setGoogleApiKey(apiKey: string) {
  try {
    localStorage.setItem(STORAGE_KEY_GOOGLE_API_KEY, apiKey.trim());
  } catch {
    // ignore
  }
}

let gisLoadPromise: Promise<void> | null = null;
let gapiLoadPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export async function ensureGisLoaded(): Promise<void> {
  if ((window as any).google?.accounts?.oauth2) return;
  if (!gisLoadPromise) {
    gisLoadPromise = loadScript('https://accounts.google.com/gsi/client');
  }
  await gisLoadPromise;
}

export async function ensurePickerLoaded(): Promise<void> {
  if ((window as any).google?.picker) return;
  if (!gapiLoadPromise) {
    gapiLoadPromise = loadScript('https://apis.google.com/js/api.js').then(
      () =>
        new Promise<void>((resolve) => {
          (window as any).gapi.load('picker', { callback: resolve });
        })
    );
  }
  await gapiLoadPromise;
}

/**
 * Requests an OAuth2 access token from Google Identity Services
 */
export async function requestGoogleAccessToken(
  scopes: string,
  clientIdOverride?: string
): Promise<string> {
  const clientId = (clientIdOverride || getGoogleClientId()).trim();
  if (!clientId) {
    throw new Error('MISSING_GOOGLE_CLIENT_ID');
  }
  await ensureGisLoaded();

  return new Promise<string>((resolve, reject) => {
    const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes,
      callback: (response: any) => {
        if (response?.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (response?.access_token) {
          resolve(response.access_token);
        } else {
          reject(new Error('No access_token returned from Google'));
        }
      },
      error_callback: (err: any) => {
        reject(new Error(err?.message || 'התחברות Google בוטלה'));
      },
    });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

/**
 * Opens Google Sign-In popup and returns the OAuth access token for userinfo verification
 */
export async function signInWithGooglePopup(clientIdOverride?: string): Promise<string> {
  return requestGoogleAccessToken('openid email profile', clientIdOverride);
}

/**
 * Opens the native Google Drive Picker (or fallback Drive API browser modal if API key is omitted)
 * and returns the selected files along with the OAuth token needed for server-to-R2 transfer.
 */
export async function pickFilesFromGoogleDrive(options?: {
  clientId?: string;
  apiKey?: string;
}): Promise<{
  oauthToken: string;
  files: PickedDriveFile[];
} | null> {
  const oauthToken = await requestGoogleAccessToken(
    'https://www.googleapis.com/auth/drive.readonly',
    options?.clientId
  );

  const apiKey = (options?.apiKey || getGoogleApiKey()).trim();
  await ensurePickerLoaded();

  const google = (window as any).google;
  if (!google?.picker) {
    throw new Error('Google Picker API failed to initialize');
  }

  return new Promise((resolve, reject) => {
    try {
      const docsView = new google.picker.DocsView()
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true);

      const builder = new google.picker.PickerBuilder()
        .addView(docsView)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(oauthToken)
        .setTitle('בחר קבצי הקלטה או תיקייה מ-Google Drive להעברה לענן R2')
        .setLocale('he')
        .setCallback((data: any) => {
          if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
            const docs = data[google.picker.Response.DOCUMENTS] || [];
            const files: PickedDriveFile[] = docs.map((d: any) => ({
              id: d[google.picker.Document.ID],
              name: d[google.picker.Document.NAME] || '',
              mimeType: d[google.picker.Document.MIME_TYPE] || '',
              sizeBytes: d.sizeBytes,
              isFolder:
                d[google.picker.Document.MIME_TYPE] === 'application/vnd.google-apps.folder',
            }));
            resolve({ oauthToken, files });
          } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
            resolve(null);
          }
        });

      if (apiKey) {
        builder.setDeveloperKey(apiKey);
      }

      const picker = builder.build();
      picker.setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}
