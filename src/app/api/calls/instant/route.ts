import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { parentId, nannyId } = body;

    if (!parentId || !nannyId) {
      return NextResponse.json(
        { error: 'parentId and nannyId are required' },
        { status: 400 }
      );
    }

    // Verify parent exists
    const parent = await db.user.findUnique({ where: { id: parentId } });
    if (!parent) {
      return NextResponse.json({ error: 'Parent not found' }, { status: 404 });
    }

    // Verify nanny exists
    const nanny = await db.user.findUnique({ where: { id: nannyId } });
    if (!nanny) {
      return NextResponse.json({ error: 'Nanny not found' }, { status: 404 });
    }

    const callRoomId = uuidv4();

    const call = await db.callSession.create({
      data: {
        parentId,
        nannyId,
        type: 'INSTANT',
        status: 'PENDING',
        callRoomId,
      },
      include: {
        parent: {
          select: { id: true, name: true, avatar: true },
        },
        nanny: {
          select: { id: true, name: true, avatar: true },
        },
      },
    });

    // Create notification for nanny
    await db.notification.create({
      data: {
        userId: nannyId,
        type: 'CALL_REQUEST',
        title: 'New Call Request',
        message: `${parent.name} is requesting an instant video call with you.`,
        data: JSON.stringify({ callId: call.id, callRoomId }),
      },
    });

    // Create notification for parent
    await db.notification.create({
      data: {
        userId: parentId,
        type: 'CALL_REQUEST',
        title: 'Call Request Sent',
        message: `Your call request has been sent to ${nanny.name}. Waiting for response...`,
        data: JSON.stringify({ callId: call.id, callRoomId }),
      },
    });

    return NextResponse.json(
      { call, message: 'Instant call request created' },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Create instant call error:', error);
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    );
  }
}
