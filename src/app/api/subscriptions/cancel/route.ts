import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const subscription = await db.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      );
    }

    const updatedSubscription = await db.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED' },
    });

    // Create notification
    await db.notification.create({
      data: {
        userId,
        type: 'SUBSCRIPTION',
        title: 'Subscription Cancelled',
        message: `Your ${subscription.plan} subscription has been cancelled. You can continue using the free plan.`,
      },
    });

    // Create a new FREE subscription
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const freeSubscription = await db.subscription.create({
      data: {
        userId,
        plan: 'FREE',
        status: 'ACTIVE',
        isTrial: true,
        trialEndsAt,
      },
    });

    return NextResponse.json({
      subscription: updatedSubscription,
      newSubscription: freeSubscription,
      message: 'Subscription cancelled. You are now on the free plan.',
    });
  } catch (error: any) {
    console.error('Cancel subscription error:', error);
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
