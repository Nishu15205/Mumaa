import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const PLAN_PRICES: Record<string, number> = {
  BASIC: 499,
  PRO: 999,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, plan } = body;

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

    // Expire any existing active subscriptions
    await db.subscription.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      data: { status: 'EXPIRED' },
    });

    const currentPeriodEnds = new Date();
    currentPeriodEnds.setDate(currentPeriodEnds.getDate() + 30);

    const subscription = await db.subscription.create({
      data: {
        userId,
        plan,
        status: 'ACTIVE',
        isTrial: false,
        currentPeriodEnds,
      },
    });

    // Create notification
    await db.notification.create({
      data: {
        userId,
        type: 'SUBSCRIPTION',
        title: 'Subscription Upgraded',
        message: `Your subscription has been upgraded to the ${plan} plan at ₹${PLAN_PRICES[plan]}/month.`,
        data: JSON.stringify({ plan, price: PLAN_PRICES[plan] }),
      },
    });

    return NextResponse.json(
      {
        subscription,
        message: `Successfully upgraded to ${plan} plan`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Upgrade subscription error:', error);
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
