import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const PLAN_PRICES: Record<string, number> = {
  BASIC: 499,
  PRO: 999,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, plan, amount } = body;

    if (!userId || !plan) {
      return NextResponse.json(
        { error: 'userId and plan are required' },
        { status: 400 }
      );
    }

    if (!['BASIC', 'PRO'].includes(plan)) {
      return NextResponse.json(
        { error: 'Plan must be BASIC or PRO' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Generate a mock Stripe checkout session ID
    const sessionId = `cs_mock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Expire any existing active subscriptions
    await db.subscription.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      data: { status: 'EXPIRED' },
    });

    // Create new subscription with 7-day free trial
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const currentPeriodEnds = new Date();
    currentPeriodEnds.setDate(currentPeriodEnds.getDate() + 37); // 7-day trial + 30-day billing

    const subscription = await db.subscription.create({
      data: {
        userId,
        plan,
        status: 'ACTIVE',
        isTrial: true,
        trialEndsAt,
        currentPeriodEnds,
      },
    });

    // Create notification
    await db.notification.create({
      data: {
        userId,
        type: 'SUBSCRIPTION',
        title: 'Subscription Started',
        message: `Welcome! Your ${plan} plan free trial has started. You have 7 days of free access.`,
        data: JSON.stringify({ plan, sessionId, price: amount || PLAN_PRICES[plan] }),
      },
    });

    return NextResponse.json({
      sessionId,
      url: `/api/payments/success?session_id=${sessionId}`,
      subscription,
    }, { status: 200 });
  } catch (error: unknown) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Payment processing failed' },
      { status: 500 }
    );
  }
}
