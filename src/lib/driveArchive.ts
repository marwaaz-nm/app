import 'server-only';

// Uploads/downloads PDFs via a Google Apps Script Web App deployed under the archive
// Google account, instead of a Drive service account. Service accounts have no Drive
// storage quota of their own, so they can't create files in a personal Gmail account's
// folder (fails with "storageQuotaExceeded") — only Shared Drives (Workspace-only) or
// domain-wide OAuth delegation (also Workspace-only) work around that for service
// accounts. A script deployed under the real account runs with that account's own quota
// instead, and its Web App URL doesn't expire the way an unverified OAuth app's 7-day
// refresh token would. See README/Settings > Document Archive for the script source and
// deployment steps.
export type ArchiveDriveConfig = {
  scriptUrl: string;
  sharedSecret: string;
};

// Tagged with .status = 502 (Bad Gateway) rather than left as a bare Error — callers
// (see apiError()-style handling in the API routes) only surface an error's own message
// to the client when it carries an explicit status, otherwise they fall back to a
// generic "Server error" to avoid leaking unexpected internals. A failure of this
// upstream Apps Script bridge is a known, diagnosable condition (bad secret, script
// redeployed with a new URL, script quota, etc.), so it should reach the admin as a
// readable message instead of a bare 500.
function scriptError(message: string): Error {
  return Object.assign(new Error(message), { status: 502 });
}

async function callScript(config: ArchiveDriveConfig, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(config.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, secret: config.sharedSecret }),
    redirect: 'follow',
  });
  if (!response.ok) throw scriptError(`Archive script request failed (HTTP ${response.status}).`);
  const json = await response.json();
  if (json && typeof json === 'object' && 'error' in json && json.error) {
    throw scriptError(String(json.error));
  }
  return json;
}

export async function uploadArchivePdf(
  config: ArchiveDriveConfig,
  fileName: string,
  buffer: Buffer,
): Promise<{ fileId: string; webViewLink?: string }> {
  const result = await callScript(config, { action: 'upload', fileName, contentBase64: buffer.toString('base64') });
  if (typeof result.fileId !== 'string') throw scriptError('Archive script did not return a file id for the upload.');
  return { fileId: result.fileId, webViewLink: typeof result.webViewLink === 'string' ? result.webViewLink : undefined };
}

// Best-effort — used when replacing a reference's archived PDF with a new upload. A
// missing/already-deleted old file is not worth failing the new upload over.
export async function deleteArchiveFile(config: ArchiveDriveConfig, fileId: string): Promise<void> {
  try {
    await callScript(config, { action: 'delete', fileId });
  } catch {
    // See comment above.
  }
}

export async function downloadArchivePdf(config: ArchiveDriveConfig, fileId: string): Promise<Buffer> {
  const result = await callScript(config, { action: 'download', fileId });
  if (typeof result.contentBase64 !== 'string') throw scriptError('Archive script did not return file content.');
  return Buffer.from(result.contentBase64, 'base64');
}
