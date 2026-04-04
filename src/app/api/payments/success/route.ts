import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 400 }
      );
    }

    // Mock verification - in production this would verify with Stripe
    const isValid = sessionId.startsWith('cs_mock_');

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 400 }
      );
    }

    // Extract plan from session (mock)
    const plan = sessionId.includes('basic') || sessionId.includes('BASIC') ? 'BASIC' : 'PRO';

    return NextResponse.json({
      success: true,
      plan,
      sessionId,
    });
  } catch (error: unknown) {
    console.error('Payment success verification error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}
