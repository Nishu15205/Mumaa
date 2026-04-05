import { db } from '../src/lib/db';
async function main() {
  const sub = await db.subscription.create({
    data: {
      userId: 'cmnkodc0e0001nnth7f86qc3s',
      plan: 'BASIC',
      status: 'ACTIVE',
      isTrial: true,
      callsUsedToday: 0,
      lastCallReset: new Date(),
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      currentPeriodEnds: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  console.log('Parent subscription created:', sub.id, sub.plan, sub.status);
  await db.$disconnect();
}
main().catch(console.error);
