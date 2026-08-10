import { NextRequest, NextResponse } from 'next/server';
import { apiError, requireViewer } from '@/lib/server-auth';

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};
const MAX_SIZE = 2 * 1024 * 1024;

// Admin-only. Uploads a new org logo to the public "org-assets" bucket,
// points app_settings.logo_url at it, and removes the previous logo file.
export async function POST(req: NextRequest) {
  try {
    const viewer = await requireViewer(req);
    if (viewer.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'A file is required.' }, { status: 400 });
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) return NextResponse.json({ error: 'Only PNG, JPEG, WebP and SVG files are allowed.' }, { status: 415 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File size must not exceed 2 MB.' }, { status: 413 });

    const { data: current } = await viewer.admin.from('app_settings').select('logo_url').eq('id', 1).single();

    const storagePath = `logo-${crypto.randomUUID()}.${ext}`;
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await viewer.admin.storage
      .from('org-assets').upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = viewer.admin.storage.from('org-assets').getPublicUrl(storagePath);
    const logoUrl = publicUrlData.publicUrl;

    const { data, error } = await viewer.admin
      .from('app_settings')
      .update({ logo_url: logoUrl, updated_at: new Date().toISOString(), updated_by: viewer.userId })
      .eq('id', 1)
      .select('logo_url')
      .single();
    if (error) {
      await viewer.admin.storage.from('org-assets').remove([storagePath]);
      throw error;
    }

    const previousPath = current?.logo_url?.includes('/org-assets/')
      ? current.logo_url.split('/org-assets/')[1]
      : null;
    if (previousPath) {
      await viewer.admin.storage.from('org-assets').remove([previousPath]);
    }

    return NextResponse.json({ logo_url: data.logo_url });
  } catch (error) {
    const resolved = apiError(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
