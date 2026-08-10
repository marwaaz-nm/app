import 'server-only';

import { google, drive_v3 } from 'googleapis';

const WORD_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const FIELDS = 'files(id, name, mimeType, modifiedTime, webViewLink, iconLink, size, parents), nextPageToken';

export type DriveItem = {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  size?: string;
};

let client: drive_v3.Drive | null = null;

function getClient(): drive_v3.Drive {
  if (client) return client;

  const email = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw Object.assign(new Error('Google Drive integration-ka lama dejin. Fadlan buuxi GOOGLE_DRIVE_CLIENT_EMAIL iyo GOOGLE_DRIVE_PRIVATE_KEY ee .env.local, ka dibna dib u bilow server-ka.'), { status: 503 });
  }

  const auth = new google.auth.JWT({
    email,
    key: rawKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  client = google.drive({ version: 'v3', auth });
  return client;
}

export function getRootFolderId(): string {
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootId) {
    throw Object.assign(new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID lama dejin ee .env.local.'), { status: 503 });
  }
  return rootId;
}

// Word auto-save/lock artifacts (e.g. "~$report.docx", "~WRL0005.tmp") are not
// real documents and should never show up in listings or search results.
function isJunkFileName(name: string): boolean {
  return name.startsWith('~$') || name.startsWith('~') || /\.tmp$/i.test(name);
}

function toDriveItem(file: drive_v3.Schema$File): DriveItem {
  return {
    id: file.id || '',
    name: file.name || 'Untitled',
    kind: file.mimeType === FOLDER_MIME_TYPE ? 'folder' : 'file',
    mimeType: file.mimeType || '',
    modifiedTime: file.modifiedTime || undefined,
    webViewLink: file.webViewLink || undefined,
    iconLink: file.iconLink || undefined,
    size: file.size || undefined,
  };
}

async function listAllPages(query: string): Promise<drive_v3.Schema$File[]> {
  const drive = getClient();
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    const response = await drive.files.list({
      q: query,
      fields: FIELDS,
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });
    files.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  return files;
}

// The tree rarely changes; cache it briefly so repeated searches don't re-walk
// the whole folder structure on every keystroke.
const folderTreeCache = new Map<string, { ids: string[]; expiresAt: number }>();
const TREE_CACHE_MS = 5 * 60 * 1000;

async function getFolderTreeIds(rootId: string): Promise<string[]> {
  const cached = folderTreeCache.get(rootId);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;

  const ids = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const batch = queue.splice(0, 20);
    const clause = batch.map((id) => `'${id}' in parents`).join(' or ');
    const children = await listAllPages(`(${clause}) and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`);
    for (const child of children) {
      if (child.id && !ids.includes(child.id)) {
        ids.push(child.id);
        queue.push(child.id);
      }
    }
  }

  folderTreeCache.set(rootId, { ids, expiresAt: Date.now() + TREE_CACHE_MS });
  return ids;
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function browseFolder(folderId: string): Promise<DriveItem[]> {
  const files = await listAllPages(`'${folderId}' in parents and trashed = false`);
  const items = files
    .map(toDriveItem)
    .filter((item) => !isJunkFileName(item.name) && (item.kind === 'folder' || WORD_MIME_TYPES.includes(item.mimeType)));
  return items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export async function searchWordFiles(rootId: string, rawQuery: string): Promise<DriveItem[]> {
  const query = escapeQueryValue(rawQuery.trim());
  if (!query) return [];

  const folderIds = await getFolderTreeIds(rootId);
  const mimeClause = WORD_MIME_TYPES.map((mime) => `mimeType = '${mime}'`).join(' or ');
  const textClause = `(name contains '${query}' or fullText contains '${query}')`;

  const chunkSize = 20;
  const chunks: string[][] = [];
  for (let i = 0; i < folderIds.length; i += chunkSize) chunks.push(folderIds.slice(i, i + chunkSize));

  const chunkResults = await Promise.all(chunks.map((chunk) => {
    const parentClause = chunk.map((id) => `'${id}' in parents`).join(' or ');
    const q = `(${parentClause}) and (${mimeClause}) and ${textClause} and trashed = false`;
    return listAllPages(q);
  }));

  const resultsById = new Map<string, DriveItem>();
  for (const files of chunkResults) {
    for (const file of files) {
      const item = toDriveItem(file);
      if (item.id && !isJunkFileName(item.name)) resultsById.set(item.id, item);
    }
  }

  return Array.from(resultsById.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function getFolderPath(folderId: string, rootId: string): Promise<{ id: string; name: string }[]> {
  const drive = getClient();
  const path: { id: string; name: string }[] = [];
  let currentId: string | undefined = folderId;
  let guard = 0;
  while (currentId && guard < 25) {
    guard += 1;
    const response: { data: drive_v3.Schema$File } = await drive.files.get({ fileId: currentId, fields: 'id, name, parents', supportsAllDrives: true });
    const { data } = response;
    path.unshift({ id: data.id || currentId, name: data.name || '' });
    if (data.id === rootId) break;
    currentId = data.parents?.[0];
  }
  return path;
}

export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
  const drive = getClient();
  const metaResponse: { data: drive_v3.Schema$File } = await drive.files.get({
    fileId,
    fields: 'name, mimeType',
    supportsAllDrives: true,
  });

  const contentResponse = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  ) as unknown as { data: ArrayBuffer };

  return {
    buffer: Buffer.from(contentResponse.data),
    name: metaResponse.data.name || 'document',
    mimeType: metaResponse.data.mimeType || 'application/octet-stream',
  };
}
