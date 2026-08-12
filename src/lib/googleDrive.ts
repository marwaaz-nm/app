import 'server-only';

import { google, drive_v3 } from 'googleapis';

const WORD_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
// Browsing a room shows these in addition to Word files, so PDFs/photos/recordings can be
// opened and previewed in-app. Search and the customer-data index stay scoped to Word docs
// only (searchWordFiles/listAllWordFilesInTree) since those parse document text — nothing
// here changes what a folder search or the background index considers.
const PREVIEWABLE_MIME_TYPES = [
  ...WORD_MIME_TYPES,
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/webm',
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

// Credentials for one named Google Drive connection (the notary office can register
// several — e.g. one per branch — each with its own service account and shared folder).
export type DriveConnection = {
  id: number;
  clientEmail: string;
  privateKey: string;
  rootFolderId: string;
};

// A Drive client is specific to one connection's credentials, so it's cached per
// connection id rather than as a single module-level singleton.
const clientCache = new Map<number, drive_v3.Drive>();

function getClient(conn: DriveConnection): drive_v3.Drive {
  const cached = clientCache.get(conn.id);
  if (cached) return cached;

  const auth = new google.auth.JWT({
    email: conn.clientEmail,
    key: conn.privateKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  const client = google.drive({ version: 'v3', auth });
  clientCache.set(conn.id, client);
  return client;
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

async function listAllPages(conn: DriveConnection, query: string): Promise<drive_v3.Schema$File[]> {
  const drive = getClient(conn);
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

// The tree rarely changes; cache it so repeated searches don't re-walk the whole
// folder structure on every keystroke. This is an in-memory cache scoped to one
// warm serverless instance — it speeds up back-to-back requests but resets on a
// cold start, so it's a latency optimization, not a guarantee. Keyed by connection id
// since each connection has its own independent folder tree.
const folderTreeCache = new Map<number, { ids: string[]; expiresAt: number }>();
const folderTreeInFlight = new Map<number, Promise<string[]>>();
const TREE_CACHE_MS = 30 * 60 * 1000;
const TREE_LEVEL_CHUNK = 30;

// Walks the tree one depth level at a time, firing every query at a given level in
// parallel instead of 20-at-a-time regardless of depth. Measured against the real
// folder structure (8 levels, 225 folders) this cut the cold walk from ~11s to ~8s —
// the remaining time is simply one network round trip per depth level.
async function buildFolderTreeIds(conn: DriveConnection): Promise<string[]> {
  const ids = [conn.rootFolderId];
  let level = [conn.rootFolderId];
  while (level.length) {
    const chunks: string[][] = [];
    for (let i = 0; i < level.length; i += TREE_LEVEL_CHUNK) chunks.push(level.slice(i, i + TREE_LEVEL_CHUNK));
    const results = await Promise.all(chunks.map((chunk) => {
      const clause = chunk.map((id) => `'${id}' in parents`).join(' or ');
      return listAllPages(conn, `(${clause}) and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`);
    }));
    const next: string[] = [];
    for (const child of results.flat()) {
      if (child.id && !ids.includes(child.id)) {
        ids.push(child.id);
        next.push(child.id);
      }
    }
    level = next;
  }
  return ids;
}

// Concurrent callers (e.g. two connections searched in parallel, or overlapping
// requests) share one in-flight walk instead of each starting their own.
function getFolderTreeIds(conn: DriveConnection): Promise<string[]> {
  const cached = folderTreeCache.get(conn.id);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.ids);

  const inFlight = folderTreeInFlight.get(conn.id);
  if (inFlight) return inFlight;

  const promise = buildFolderTreeIds(conn).then((ids) => {
    folderTreeCache.set(conn.id, { ids, expiresAt: Date.now() + TREE_CACHE_MS });
    folderTreeInFlight.delete(conn.id);
    return ids;
  }, (err) => {
    folderTreeInFlight.delete(conn.id);
    throw err;
  });
  folderTreeInFlight.set(conn.id, promise);
  return promise;
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Short-lived cache for folder listings — opening the same folder again (e.g.
// navigating back via breadcrumbs) is then instant instead of a fresh Drive call.
// Keyed by connection id + folder id since the same folder id could theoretically
// collide across two different connections' drives.
const browseCache = new Map<string, { items: DriveItem[]; expiresAt: number }>();
const BROWSE_CACHE_MS = 3 * 60 * 1000;

export async function browseFolder(conn: DriveConnection, folderId: string): Promise<DriveItem[]> {
  const cacheKey = `${conn.id}::${folderId}`;
  const cached = browseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.items;

  const files = await listAllPages(conn, `'${folderId}' in parents and trashed = false`);
  const items = files
    .map(toDriveItem)
    .filter((item) => !isJunkFileName(item.name) && (item.kind === 'folder' || PREVIEWABLE_MIME_TYPES.includes(item.mimeType)));
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  browseCache.set(cacheKey, { items, expiresAt: Date.now() + BROWSE_CACHE_MS });
  return items;
}

// Lists every Word file across a connection's whole folder tree — used by the background
// index sync job, not by live search. Unlike searchWordFiles, this deliberately pays the
// folder-tree-walk cost (needed here since we want every file, not a text-filtered
// subset) because it runs as a background job, never blocking a user-facing request.
export async function listAllWordFilesInTree(conn: DriveConnection): Promise<DriveItem[]> {
  const folderIds = await getFolderTreeIds(conn);
  const mimeClause = WORD_MIME_TYPES.map((mime) => `mimeType = '${mime}'`).join(' or ');

  const chunks: string[][] = [];
  for (let i = 0; i < folderIds.length; i += TREE_LEVEL_CHUNK) chunks.push(folderIds.slice(i, i + TREE_LEVEL_CHUNK));
  const results = await Promise.all(chunks.map((chunk) => {
    const parentClause = chunk.map((id) => `'${id}' in parents`).join(' or ');
    return listAllPages(conn, `(${parentClause}) and (${mimeClause}) and trashed = false`);
  }));

  const byId = new Map<string, drive_v3.Schema$File>();
  for (const file of results.flat()) {
    if (file.id) byId.set(file.id, file);
  }
  return Array.from(byId.values()).map(toDriveItem).filter((item) => !isJunkFileName(item.name));
}

// Debounced typing and the Macmiisha lookup often re-issue the same query moments
// apart; caching the raw Drive search briefly avoids repeating that round trip.
const searchCache = new Map<string, { items: DriveItem[]; expiresAt: number }>();
const SEARCH_CACHE_MS = 3 * 60 * 1000;

export async function searchWordFiles(conn: DriveConnection, rawQuery: string): Promise<DriveItem[]> {
  const query = escapeQueryValue(rawQuery.trim());
  if (!query) return [];

  const cacheKey = `${conn.id}::${query.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.items;

  const mimeClause = WORD_MIME_TYPES.map((mime) => `mimeType = '${mime}'`).join(' or ');
  const textClause = `(name contains '${query}' or fullText contains '${query}')`;

  // The service account can only see files actually shared with it — i.e. this folder
  // tree — so a single unscoped search already can't return anything outside it. Folding
  // an OR-clause of every folder ID into the query itself (what this used to do, split
  // into chunked parallel requests to stay under the query length limit) measured at
  // 11-14s regardless of caching; Drive evidently takes a while to evaluate a large OR
  // clause server-side. A single plain query removes that cost.
  const files = await listAllPages(conn, `(${mimeClause}) and ${textClause} and trashed = false`);

  // The folder-tree scope check below is a safety net (Drive search shouldn't return
  // anything outside what's shared with the service account, but this guards against
  // it anyway) — confirmed against real searches to never actually exclude a result.
  // Building the tree from scratch takes several seconds per depth level, so it's only
  // applied when already warm from a previous search; a cold search isn't held up
  // waiting on a filter that, in practice, changes nothing. The walk still gets kicked
  // off in the background so the *next* search benefits from a warm cache.
  const cachedTree = folderTreeCache.get(conn.id);
  let scopedFiles = files;
  if (cachedTree && cachedTree.expiresAt > Date.now()) {
    const folderIdSet = new Set(cachedTree.ids);
    scopedFiles = files.filter((file) => file.parents?.some((parentId) => folderIdSet.has(parentId)));
  } else {
    void getFolderTreeIds(conn).catch(() => {});
  }

  const resultsById = new Map<string, DriveItem>();
  for (const file of scopedFiles) {
    const item = toDriveItem(file);
    if (item.id && !isJunkFileName(item.name)) resultsById.set(item.id, item);
  }

  const results = Array.from(resultsById.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  searchCache.set(cacheKey, { items: results, expiresAt: Date.now() + SEARCH_CACHE_MS });
  return results;
}

// Walking to the root is a chain of sequential Drive API calls (one per folder level),
// unlike browseFolder's single listing call — and folder names/parents change rarely, so
// this is cached the same way to avoid paying that latency on every navigation.
const folderPathCache = new Map<string, { path: { id: string; name: string }[]; expiresAt: number }>();
const FOLDER_PATH_CACHE_MS = 3 * 60 * 1000;

export async function getFolderPath(conn: DriveConnection, folderId: string): Promise<{ id: string; name: string }[]> {
  const cacheKey = `${conn.id}::${folderId}`;
  const cached = folderPathCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.path;

  const drive = getClient(conn);
  const path: { id: string; name: string }[] = [];
  let currentId: string | undefined = folderId;
  let guard = 0;
  while (currentId && guard < 25) {
    guard += 1;
    const response: { data: drive_v3.Schema$File } = await drive.files.get({ fileId: currentId, fields: 'id, name, parents', supportsAllDrives: true });
    const { data } = response;
    path.unshift({ id: data.id || currentId, name: data.name || '' });
    if (data.id === conn.rootFolderId) break;
    currentId = data.parents?.[0];
  }

  folderPathCache.set(cacheKey, { path, expiresAt: Date.now() + FOLDER_PATH_CACHE_MS });
  return path;
}

// Fetches just the file bytes — one Drive API call instead of the two downloadFile()
// makes (a metadata lookup plus the content fetch). Used by the customer search, which
// already has the file's name from the search results and has no use for its metadata.
export async function downloadFileContent(conn: DriveConnection, fileId: string): Promise<Buffer> {
  const drive = getClient(conn);
  const contentResponse = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  ) as unknown as { data: ArrayBuffer };
  return Buffer.from(contentResponse.data);
}

export async function downloadFile(conn: DriveConnection, fileId: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
  const drive = getClient(conn);
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

export type StorageQuota = { usageBytes: number };

// about.get's storageQuota reports the *service account's own* Drive quota — for a
// service account that only has a shared folder handed to it (the normal setup here),
// that's meaningless (typically reads back as 0 used / no limit, as confirmed against
// the real rooms). What actually answers "how much space is this room using" is the
// real size of every file inside its folder tree, summed up — so that's what this does,
// reusing the same tree-walk as listAllWordFilesInTree but across every file, not just
// Word docs. There's no reliable "total capacity" for a shared folder living inside
// someone else's Drive, so only usage is reported (no free-space figure to show).
const quotaCache = new Map<number, { quota: StorageQuota; expiresAt: number }>();
const QUOTA_CACHE_MS = 10 * 60 * 1000;

export async function getStorageQuota(conn: DriveConnection): Promise<StorageQuota> {
  const cached = quotaCache.get(conn.id);
  if (cached && cached.expiresAt > Date.now()) return cached.quota;

  const folderIds = await getFolderTreeIds(conn);
  const chunks: string[][] = [];
  for (let i = 0; i < folderIds.length; i += TREE_LEVEL_CHUNK) chunks.push(folderIds.slice(i, i + TREE_LEVEL_CHUNK));
  const results = await Promise.all(chunks.map((chunk) => {
    const parentClause = chunk.map((id) => `'${id}' in parents`).join(' or ');
    return listAllPages(conn, `(${parentClause}) and mimeType != '${FOLDER_MIME_TYPE}' and trashed = false`);
  }));

  const seen = new Set<string>();
  let usageBytes = 0;
  for (const file of results.flat()) {
    if (!file.id || seen.has(file.id)) continue;
    seen.add(file.id);
    usageBytes += file.size ? Number(file.size) : 0;
  }

  const quota: StorageQuota = { usageBytes };
  quotaCache.set(conn.id, { quota, expiresAt: Date.now() + QUOTA_CACHE_MS });
  return quota;
}

// --- Drive push notifications (webhooks) ---
// Lets the index stay current within seconds of a document being added/changed/removed
// in Drive, instead of waiting for a manual "Sync Now". A "channel" is a subscription:
// Drive POSTs a near-empty ping to our webhook whenever something changes, and we then
// pull the actual delta via changes.list() using a stored page-token cursor.

// The starting cursor for a brand-new channel — changes.list() calls made with this
// token only return changes from this point forward, so registering a channel doesn't
// retroactively process the connection's whole existing history.
export async function getStartPageToken(conn: DriveConnection): Promise<string> {
  const drive = getClient(conn);
  const res = await drive.changes.getStartPageToken({ supportsAllDrives: true });
  if (!res.data.startPageToken) throw new Error('Drive did not return a start page token.');
  return res.data.startPageToken;
}

// Drive's maximum channel lifetime is 7 days; the daily renewal cron re-registers
// anything within 48h of this.
const MAX_CHANNEL_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export async function watchDriveChanges(
  conn: DriveConnection,
  opts: { channelId: string; address: string; token: string; pageToken: string },
): Promise<{ resourceId: string; expiration: string }> {
  const drive = getClient(conn);
  const res = await drive.changes.watch({
    pageToken: opts.pageToken,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    // Without an explicit `expiration`, Drive defaults to a much shorter channel
    // lifetime than the documented 7-day maximum (observed: well under an hour) — this
    // request body field is what actually asks for the full 7 days.
    requestBody: {
      id: opts.channelId,
      type: 'web_hook',
      address: opts.address,
      token: opts.token,
      expiration: String(Date.now() + MAX_CHANNEL_LIFETIME_MS),
    },
  });
  if (!res.data.resourceId || !res.data.expiration) throw new Error('Drive did not confirm the watch channel.');
  return { resourceId: res.data.resourceId, expiration: res.data.expiration };
}

// Best-effort — an old channel that's already expired or was replaced will 404 here,
// which is fine to ignore (it wasn't going to notify us again anyway).
export async function stopDriveWatch(conn: DriveConnection, channelId: string, resourceId: string): Promise<void> {
  const drive = getClient(conn);
  try {
    await drive.channels.stop({ requestBody: { id: channelId, resourceId } });
  } catch {
    // See comment above.
  }
}

export type DriveChange = {
  fileId: string;
  removed: boolean;
  file?: { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string; trashed?: boolean };
};

// Pages through every change since `pageToken`, returning the flat list plus the new
// cursor to store for next time. Drive's response only carries a `newStartPageToken`
// once it reaches the current end of the change log (vs. `nextPageToken` mid-pagination).
export async function listDriveChanges(conn: DriveConnection, pageToken: string): Promise<{ changes: DriveChange[]; newStartPageToken: string | null }> {
  const drive = getClient(conn);
  const changes: DriveChange[] = [];
  let token: string | undefined = pageToken;
  let newStartPageToken: string | null = null;

  while (token) {
    const res: { data: drive_v3.Schema$ChangeList } = await drive.changes.list({
      pageToken: token,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, modifiedTime, webViewLink, trashed))',
    });
    for (const c of res.data.changes || []) {
      if (!c.fileId) continue;
      changes.push({
        fileId: c.fileId,
        removed: Boolean(c.removed),
        file: c.file
          ? { id: c.file.id || c.fileId, name: c.file.name || '', mimeType: c.file.mimeType || '', modifiedTime: c.file.modifiedTime || undefined, webViewLink: c.file.webViewLink || undefined, trashed: c.file.trashed || false }
          : undefined,
      });
    }
    if (res.data.newStartPageToken) {
      newStartPageToken = res.data.newStartPageToken;
      token = undefined;
    } else {
      token = res.data.nextPageToken || undefined;
    }
  }

  return { changes, newStartPageToken };
}
