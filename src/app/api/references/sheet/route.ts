import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSheetReferences } from '@/lib/googleSheetReferences';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const references = await getGoogleSheetReferences(forceRefresh);
    return NextResponse.json({ references, count: references.length });
  } catch (error: any) {
    console.error('API Error in /api/references/sheet:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Google Sheet references', details: error?.message },
      { status: 500 }
    );
  }
}
