import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSheetSurveys } from '@/lib/googleSheetSurveys';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const surveys = await getGoogleSheetSurveys(forceRefresh);

    return NextResponse.json({
      surveys,
      total: surveys.length,
    });
  } catch (error) {
    console.error('API /api/surveys/sheet error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch surveys from source', surveys: [] },
      { status: 500 }
    );
  }
}
