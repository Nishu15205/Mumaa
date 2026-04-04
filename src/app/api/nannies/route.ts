import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const skill = searchParams.get('skill');
    const minRating = searchParams.get('minRating');
    const language = searchParams.get('language');
    const available = searchParams.get('available');

    const where: any = {
      user: { isActive: true },
    };

    if (available === 'true') {
      where.isAvailable = true;
    }

    if (minRating) {
      where.rating = { gte: parseFloat(minRating) };
    }

    if (skill) {
      where.skills = { contains: skill };
    }

    if (language) {
      where.languages = { contains: language };
    }

    const nannies = await db.nannyProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            isOnline: true,
          },
        },
      },
      orderBy: { rating: 'desc' },
    });

    return NextResponse.json({ nannies });
  } catch (error: any) {
    console.error('List nannies error:', error);
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
