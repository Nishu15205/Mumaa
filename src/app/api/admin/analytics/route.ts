import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function formatDateForGroup(date: Date, period: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  switch (period) {
    case 'daily':
      return `${y}-${m}-${d}`;
    case 'weekly': {
      // Get the start of the week (Monday)
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(date);
      weekStart.setDate(diff);
      const wy = weekStart.getFullYear();
      const wm = String(weekStart.getMonth() + 1).padStart(2, '0');
      const wd = String(weekStart.getDate()).padStart(2, '0');
      return `${wy}-${wm}-${wd}`;
    }
    case 'monthly':
      return `${y}-${m}`;
    default:
      return `${y}-${m}`;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const period = searchParams.get('period') || 'monthly';

    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const startDate = from ? new Date(from) : sixMonthsAgo;
    const endDate = to ? new Date(to + 'T23:59:59:999Z') : now;

    const dateFilter: any = {
      createdAt: { gte: startDate, lte: endDate },
    };

    // Run all queries in parallel
    const [
      totalUsers,
      parentCount,
      nannyCount,
      allActiveSubscriptions,
      freeSubCount,
      basicSubCount,
      proSubCount,
      totalCallsAll,
      completedCalls,
      cancelledCalls,
      activeCalls,
      pendingCalls,
      avgDurationResult,
      revenueResult,
      revenueThisMonth,
      revenueLastMonth,
      usersThisMonth,
      usersLastMonth,
      avgRating,
      topNannies,
      recentActivity,
      callHourData,
      retentionData,
    ] = await Promise.all([
      // Total users (non-admin)
      db.user.count({
        where: { role: { in: ['PARENT', 'NANNY'] } },
      }),

      db.user.count({ where: { role: 'PARENT' } }),
      db.user.count({ where: { role: 'NANNY' } }),

      // Active subscriptions
      db.subscription.count({ where: { status: 'ACTIVE' } }),
      db.subscription.count({ where: { status: 'ACTIVE', plan: 'FREE' } }),
      db.subscription.count({ where: { status: 'ACTIVE', plan: 'BASIC' } }),
      db.subscription.count({ where: { status: 'ACTIVE', plan: 'PRO' } }),

      // Call stats
      db.callSession.count(),
      db.callSession.count({ where: { status: 'COMPLETED' } }),
      db.callSession.count({ where: { status: 'CANCELLED' } }),
      db.callSession.count({ where: { status: 'ACTIVE' } }),
      db.callSession.count({ where: { status: 'PENDING' } }),

      // Average call duration (completed calls)
      db.callSession.aggregate({
        where: { status: 'COMPLETED', duration: { gt: 0 } },
        _avg: { duration: true },
      }),

      // Total revenue
      db.callSession.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { price: true },
      }),

      // Revenue this month
      db.callSession.aggregate({
        where: {
          status: 'COMPLETED',
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
            lte: now,
          },
        },
        _sum: { price: true },
      }),

      // Revenue last month
      db.callSession.aggregate({
        where: {
          status: 'COMPLETED',
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            lt: new Date(now.getFullYear(), now.getMonth(), 1),
          },
        },
        _sum: { price: true },
      }),

      // Users this month
      db.user.count({
        where: {
          role: { in: ['PARENT', 'NANNY'] },
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
            lte: now,
          },
        },
      }),

      // Users last month
      db.user.count({
        where: {
          role: { in: ['PARENT', 'NANNY'] },
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            lt: new Date(now.getFullYear(), now.getMonth(), 1),
          },
        },
      }),

      // Platform average rating
      db.callSession.aggregate({
        where: { rating: { gt: 0 } },
        _avg: { rating: true },
      }),

      // Top rated nannies
      db.nannyProfile.findMany({
        where: { rating: { gt: 0 } },
        include: { user: { select: { name: true, email: true, createdAt: true } } },
        orderBy: { rating: 'desc' },
        take: 10,
      }),

      // Recent activity (last 20 events)
      db.user.findMany({
        where: { role: { in: ['PARENT', 'NANNY'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          name: true,
          role: true,
          createdAt: true,
          email: true,
        },
      }),

      // Busiest hours - calls grouped by hour
      db.callSession.findMany({
        where: { status: 'COMPLETED', startedAt: { not: null } },
        select: { startedAt: true },
        take: 1000,
      }),

      // Retention: users who made calls in month 1 vs month 2
      db.callSession.groupBy({
        by: ['parentId'],
        _min: { createdAt: true },
        _count: { id: true },
        where: { status: 'COMPLETED' },
      }),
    ]);

    // Process user growth data grouped by period
    const usersInRange = await db.user.findMany({
      where: {
        role: { in: ['PARENT', 'NANNY'] },
        ...dateFilter,
      },
      select: { createdAt: true, role: true },
    });

    const userGrowthMap = new Map<string, { parents: number; nannies: number; total: number }>();
    usersInRange.forEach((u) => {
      const key = formatDateForGroup(u.createdAt, period);
      const existing = userGrowthMap.get(key) || { parents: 0, nannies: 0, total: 0 };
      if (u.role === 'PARENT') existing.parents++;
      else if (u.role === 'NANNY') existing.nannies++;
      existing.total++;
      userGrowthMap.set(key, existing);
    });

    const userGrowthData = Array.from(userGrowthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period_key, val]) => ({
        period: period_key,
        parents: val.parents,
        nannies: val.nannies,
        total: val.total,
      }));

    // Process revenue over time
    const completedCallsInRange = await db.callSession.findMany({
      where: { status: 'COMPLETED', ...dateFilter },
      select: { createdAt: true, price: true },
    });

    const revenueMap = new Map<string, number>();
    completedCallsInRange.forEach((c) => {
      const key = formatDateForGroup(c.createdAt, period);
      revenueMap.set(key, (revenueMap.get(key) || 0) + (c.price || 0));
    });

    const revenueData = Array.from(revenueMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period_key, amount]) => ({
        period: period_key,
        revenue: Math.round(amount * 100) / 100,
      }));

    // Process call volume over time
    const callsInRange = await db.callSession.findMany({
      where: { ...dateFilter },
      select: { createdAt: true, status: true },
    });

    const callVolumeMap = new Map<string, { completed: number; cancelled: number; total: number }>();
    callsInRange.forEach((c) => {
      const key = formatDateForGroup(c.createdAt, period);
      const existing = callVolumeMap.get(key) || { completed: 0, cancelled: 0, total: 0 };
      existing.total++;
      if (c.status === 'COMPLETED') existing.completed++;
      else if (c.status === 'CANCELLED') existing.cancelled++;
      callVolumeMap.set(key, existing);
    });

    const callVolumeData = Array.from(callVolumeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period_key, val]) => ({
        period: period_key,
        completed: val.completed,
        cancelled: val.cancelled,
        total: val.total,
      }));

    // Busiest hours processing
    const hourCount: number[] = new Array(24).fill(0);
    callHourData.forEach((c) => {
      if (c.startedAt) {
        const hour = new Date(c.startedAt).getHours();
        hourCount[hour]++;
      }
    });
    const busiestHours = hourCount.map((count, hour) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      calls: count,
    }));

    // Retention metrics
    const usersWithMultipleCalls = retentionData.filter((r) => r._count.id >= 2);
    const retentionRate = retentionData.length > 0
      ? Math.round((usersWithMultipleCalls.length / retentionData.length) * 100)
      : 0;

    // Growth percentages
    const userGrowthPct = usersLastMonth > 0
      ? Math.round(((usersThisMonth - usersLastMonth) / usersLastMonth) * 100)
      : usersThisMonth > 0 ? 100 : 0;

    const revenueGrowthPct = (revenueLastMonth._sum.price || 0) > 0
      ? Math.round(
          (((revenueThisMonth._sum.price || 0) - (revenueLastMonth._sum.price || 0)) /
            (revenueLastMonth._sum.price || 0)) *
            100
        )
      : (revenueThisMonth._sum.price || 0) > 0 ? 100 : 0;

    const conversionRate = totalUsers > 0
      ? Math.round(((basicSubCount + proSubCount) / totalUsers) * 100)
      : 0;

    // Calls this month
    const callsThisMonth = completedCalls - (
      await db.callSession.count({
        where: {
          status: 'COMPLETED',
          createdAt: {
            lt: new Date(now.getFullYear(), now.getMonth(), 1),
          },
        },
      })
    );

    return NextResponse.json({
      overview: {
        totalUsers,
        parentCount,
        nannyCount,
        activeSubscriptions: allActiveSubscriptions,
        freeSubscriptions: freeSubCount,
        basicSubscriptions: basicSubCount,
        proSubscriptions: proSubCount,
        totalRevenue: revenueResult._sum.price || 0,
        revenueThisMonth: revenueThisMonth._sum.price || 0,
        revenueLastMonth: revenueLastMonth._sum.price || 0,
        revenueGrowth: revenueGrowthPct,
        userGrowth: userGrowthPct,
        conversionRate,
        avgCallDuration: avgDurationResult._avg.duration || 0,
        avgRating: avgRating._avg.rating || 0,
        callsThisMonth,
        retentionRate,
      },
      callStats: {
        total: totalCallsAll,
        completed: completedCalls,
        cancelled: cancelledCalls,
        active: activeCalls,
        pending: pendingCalls,
        noShow: totalCallsAll - completedCalls - cancelledCalls - activeCalls - pendingCalls,
      },
      subscriptionDistribution: [
        { name: 'FREE', value: freeSubCount, color: '#9ca3af' },
        { name: 'BASIC', value: basicSubCount, color: '#f43f5e' },
        { name: 'PRO', value: proSubCount, color: '#10b981' },
      ],
      callDistribution: [
        { name: 'Completed', value: completedCalls, color: '#10b981' },
        { name: 'Cancelled', value: cancelledCalls, color: '#f43f5e' },
        { name: 'Active', value: activeCalls, color: '#3b82f6' },
        { name: 'Pending', value: pendingCalls, color: '#f59e0b' },
      ],
      userGrowthData,
      revenueData,
      callVolumeData,
      busiestHours,
      topNannies: topNannies.map((n) => ({
        id: n.id,
        name: n.user.name,
        email: n.user.email,
        rating: n.rating,
        sessions: n.totalSessions,
        earnings: n.totalEarnings,
        experience: n.experience,
      })),
      recentActivity: recentActivity.map((u) => ({
        type: 'signup' as const,
        userName: u.name,
        role: u.role,
        timestamp: u.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('Get analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
