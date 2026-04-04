import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function POST() {
  try {
    // Check if data already exists
    const existingUsers = await db.user.count();
    if (existingUsers > 0) {
      return NextResponse.json(
        { message: 'Database already has data. Skipping seed.', existingUsers },
        { status: 200 }
      );
    }

    const hashPassword = async (password: string) => {
      return bcrypt.hash(password, 12);
    };

    // ===== ADMIN USER =====
    const adminPassword = await hashPassword('admin123');
    const admin = await db.user.create({
      data: {
        name: 'MUMAA Admin',
        email: 'admin@mumaa.in',
        password: adminPassword,
        role: 'ADMIN',
        isOnline: true,
      },
    });

    // ===== NANNY DATA =====
    const nannyData = [
      {
        name: 'Priya Sharma',
        email: 'priya.sharma@email.com',
        password: 'nanny123',
        phone: '+91 98765 43210',
        bio: 'Experienced childcare professional specializing in toddler care and early childhood education. I love creating engaging activities for little ones.',
        experience: 5,
        skills: 'Toddler Care, Early Education, Storytelling, Arts & Crafts, Potty Training',
        hourlyRate: 350,
        isAvailable: true,
        rating: 4.8,
        totalSessions: 128,
        totalEarnings: 45600,
        languages: 'Hindi, English, Marathi',
        certifications: 'ECCE Certified, First Aid, CPR Certified',
        ageGroup: '0-2 years, 2-5 years',
      },
      {
        name: 'Lakshmi Iyer',
        email: 'lakshmi.iyer@email.com',
        password: 'nanny123',
        phone: '+91 98765 43211',
        bio: 'Warm and nurturing nanny with expertise in infant care and sleep training. Trained in Montessori methods.',
        experience: 8,
        skills: 'Infant Care, Sleep Training, Montessori Methods, Baby Massage, Nutrition',
        hourlyRate: 450,
        isAvailable: true,
        rating: 4.9,
        totalSessions: 215,
        totalEarnings: 89250,
        languages: 'Hindi, English, Tamil, Malayalam',
        certifications: 'Montessori Certified, Lactation Consultant, First Aid',
        ageGroup: '0-2 years, 2-5 years',
      },
      {
        name: 'Sunita Reddy',
        email: 'sunita.reddy@email.com',
        password: 'nanny123',
        phone: '+91 98765 43212',
        bio: 'Patient and loving nanny who specializes in special needs childcare and developmental activities.',
        experience: 6,
        skills: 'Special Needs Care, Developmental Activities, Speech Therapy Support, Sensory Play',
        hourlyRate: 500,
        isAvailable: true,
        rating: 4.7,
        totalSessions: 95,
        totalEarnings: 38500,
        languages: 'Hindi, English, Telugu',
        certifications: 'Special Needs Certified, Child Psychology Diploma',
        ageGroup: '2-5 years, 5-10 years',
      },
      {
        name: 'Anjali Gupta',
        email: 'anjali.gupta@email.com',
        password: 'nanny123',
        phone: '+91 98765 43213',
        bio: 'Enthusiastic nanny who makes learning fun! I specialize in after-school care and homework help for older children.',
        experience: 4,
        skills: 'After-School Care, Homework Help, Math Tutoring, Science Projects, Outdoor Activities',
        hourlyRate: 300,
        isAvailable: false,
        rating: 4.5,
        totalSessions: 67,
        totalEarnings: 18200,
        languages: 'Hindi, English, Bengali',
        certifications: 'B.Ed, Child Psychology Certificate',
        ageGroup: '5-10 years, 10-15 years',
      },
      {
        name: 'Deepa Nair',
        email: 'deepa.nair@email.com',
        password: 'nanny123',
        phone: '+91 98765 43214',
        bio: 'Trained nurse turned professional nanny. I bring medical expertise along with loving care for your little ones.',
        experience: 10,
        skills: 'Newborn Care, Medical Support, Vaccination Tracking, Baby Wellness, Emergency Care',
        hourlyRate: 550,
        isAvailable: true,
        rating: 4.9,
        totalSessions: 312,
        totalEarnings: 145600,
        languages: 'Hindi, English, Malayalam, Kannada',
        certifications: 'GNM Nursing, Pediatric First Aid, CPR, Newborn Care Specialist',
        ageGroup: '0-2 years',
      },
    ];

    const nannies = [];
    for (const data of nannyData) {
      const password = await hashPassword(data.password);
      const nanny = await db.user.create({
        data: {
          name: data.name,
          email: data.email,
          password,
          role: 'NANNY',
          phone: data.phone,
          bio: data.bio,
          isOnline: data.isAvailable,
        },
      });

      await db.nannyProfile.create({
        data: {
          userId: nanny.id,
          experience: data.experience,
          skills: data.skills,
          hourlyRate: data.hourlyRate,
          isAvailable: data.isAvailable,
          rating: data.rating,
          totalSessions: data.totalSessions,
          totalEarnings: data.totalEarnings,
          languages: data.languages,
          certifications: data.certifications,
          ageGroup: data.ageGroup,
        },
      });

      // Create FREE subscription with trial
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);
      await db.subscription.create({
        data: {
          userId: nanny.id,
          plan: 'FREE',
          status: 'ACTIVE',
          isTrial: true,
          trialEndsAt,
        },
      });

      nannies.push(nanny);
    }

    // ===== PARENT DATA =====
    const parentData = [
      {
        name: 'Rahul Mehta',
        email: 'rahul.mehta@email.com',
        password: 'parent123',
        phone: '+91 87654 32101',
        bio: 'Working parent in Bangalore. Looking for reliable childcare support.',
        childrenCount: 2,
        childrenAges: '2, 5',
        preferences: 'Hindi speaking, Montessori methods, flexible timing',
      },
      {
        name: 'Sneha Patel',
        email: 'sneha.patel@email.com',
        password: 'parent123',
        phone: '+91 87654 32102',
        bio: 'IT professional in Mumbai. Need regular childcare support for my toddler.',
        childrenCount: 1,
        childrenAges: '1',
        preferences: 'Gujarati speaking, infant care specialist',
      },
      {
        name: 'Vikram Singh',
        email: 'vikram.singh@email.com',
        password: 'parent123',
        phone: '+91 87654 32103',
        bio: 'Business owner in Delhi. Looking for experienced nannies for my kids.',
        childrenCount: 3,
        childrenAges: '3, 7, 12',
        preferences: 'English speaking, after-school care, homework help',
      },
      {
        name: 'Kavitha Krishnan',
        email: 'kavitha.krishnan@email.com',
        password: 'parent123',
        phone: '+91 87654 32104',
        bio: 'Doctor in Chennai. Need trustworthy childcare during my hospital shifts.',
        childrenCount: 1,
        childrenAges: '4',
        preferences: 'Tamil speaking, patient, medical background preferred',
      },
      {
        name: 'Arjun Desai',
        email: 'arjun.desai@email.com',
        password: 'parent123',
        phone: '+91 87654 32105',
        bio: 'Software engineer in Pune. First-time parent seeking guidance and care for newborn.',
        childrenCount: 1,
        childrenAges: '0',
        preferences: 'Marathi speaking, newborn specialist, night shift available',
      },
    ];

    const parents = [];
    for (const data of parentData) {
      const password = await hashPassword(data.password);
      const parent = await db.user.create({
        data: {
          name: data.name,
          email: data.email,
          password,
          role: 'PARENT',
          phone: data.phone,
          bio: data.bio,
          isOnline: true,
        },
      });

      await db.parentProfile.create({
        data: {
          userId: parent.id,
          childrenCount: data.childrenCount,
          childrenAges: data.childrenAges,
          preferences: data.preferences,
        },
      });

      // Create subscription - mix of plans
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 7);

      if (parents.length < 2) {
        // First two parents get PRO plan
        const currentPeriodEnds = new Date();
        currentPeriodEnds.setDate(currentPeriodEnds.getDate() + 30);
        await db.subscription.create({
          data: {
            userId: parent.id,
            plan: 'PRO',
            status: 'ACTIVE',
            isTrial: false,
            currentPeriodEnds,
          },
        });
      } else if (parents.length < 4) {
        // Next two get BASIC plan
        const currentPeriodEnds = new Date();
        currentPeriodEnds.setDate(currentPeriodEnds.getDate() + 30);
        await db.subscription.create({
          data: {
            userId: parent.id,
            plan: 'BASIC',
            status: 'ACTIVE',
            isTrial: false,
            currentPeriodEnds,
          },
        });
      } else {
        // Last parent gets FREE with trial
        await db.subscription.create({
          data: {
            userId: parent.id,
            plan: 'FREE',
            status: 'ACTIVE',
            isTrial: true,
            trialEndsAt,
          },
        });
      }

      parents.push(parent);
    }

    // ===== CALL SESSIONS (PAST) =====
    const now = new Date();
    const pastCalls = [
      {
        parentId: parents[0].id,
        nannyId: nannies[0].id,
        type: 'INSTANT',
        status: 'COMPLETED',
        hoursAgo: 48,
        durationMinutes: 35,
        notes: 'Regular check-in for the kids. Went well!',
        rating: 5,
        comment: 'Priya is amazing with my kids! They love her activities.',
      },
      {
        parentId: parents[1].id,
        nannyId: nannies[1].id,
        type: 'SCHEDULED',
        status: 'COMPLETED',
        hoursAgo: 24,
        durationMinutes: 45,
        notes: 'Needed advice on baby sleep routine',
        rating: 5,
        comment: 'Lakshmi gave excellent tips for sleep training. Very knowledgeable!',
      },
      {
        parentId: parents[2].id,
        nannyId: nannies[2].id,
        type: 'INSTANT',
        status: 'COMPLETED',
        hoursAgo: 72,
        durationMinutes: 60,
        notes: 'Discussion about special needs activities for my youngest',
        rating: 4,
        comment: 'Sunita was very helpful. Great suggestions for sensory activities.',
      },
      {
        parentId: parents[0].id,
        nannyId: nannies[4].id,
        type: 'SCHEDULED',
        status: 'COMPLETED',
        hoursAgo: 120,
        durationMinutes: 30,
        notes: 'Newborn care consultation',
        rating: 5,
        comment: 'Deepa is a gem! Her medical background is incredibly reassuring.',
      },
      {
        parentId: parents[3].id,
        nannyId: nannies[0].id,
        type: 'INSTANT',
        status: 'COMPLETED',
        hoursAgo: 36,
        durationMinutes: 50,
        notes: 'Toddler behavioral tips needed',
        rating: 5,
        comment: 'Very patient and understanding. My child warmed up quickly.',
      },
      {
        parentId: parents[4].id,
        nannyId: nannies[4].id,
        type: 'SCHEDULED',
        status: 'COMPLETED',
        hoursAgo: 12,
        durationMinutes: 40,
        notes: 'Newborn care and feeding guidance',
        rating: 5,
        comment: 'As a first-time parent, Deepa was incredibly supportive and informative.',
      },
      {
        parentId: parents[1].id,
        nannyId: nannies[3].id,
        type: 'INSTANT',
        status: 'CANCELLED',
        hoursAgo: 6,
        durationMinutes: 0,
        notes: 'Nanny was not available',
        rating: null,
        comment: null,
      },
      {
        parentId: parents[2].id,
        nannyId: nannies[1].id,
        type: 'SCHEDULED',
        status: 'COMPLETED',
        hoursAgo: 96,
        durationMinutes: 55,
        notes: 'Sleep training follow-up',
        rating: 5,
        comment: 'Lakshmi is the best! Our baby now sleeps through the night.',
      },
    ];

    for (const callData of pastCalls) {
      const startedAt = new Date(now.getTime() - callData.hoursAgo * 60 * 60 * 1000);
      const endedAt = new Date(startedAt.getTime() + callData.durationMinutes * 60 * 1000);
      const durationSeconds = callData.durationMinutes * 60;

      const nanny = await db.nannyProfile.findUnique({
        where: { userId: callData.nannyId },
      });
      const hourlyRate = nanny?.hourlyRate || 0;
      const price = parseFloat(((hourlyRate * durationSeconds) / 3600).toFixed(2));

      const callSession = await db.callSession.create({
        data: {
          parentId: callData.parentId,
          nannyId: callData.nannyId,
          type: callData.type,
          status: callData.status,
          scheduledAt: callData.type === 'SCHEDULED' ? new Date(startedAt.getTime() - 60 * 60 * 1000) : null,
          startedAt: callData.status === 'COMPLETED' ? startedAt : null,
          endedAt: callData.status === 'COMPLETED' ? endedAt : null,
          duration: durationSeconds,
          price: callData.status === 'COMPLETED' ? price : 0,
          notes: callData.notes,
          callRoomId: uuidv4(),
          rating: callData.rating,
          reviewComment: callData.comment,
          createdAt: startedAt,
        },
      });

      // Create review for completed calls
      if (callData.status === 'COMPLETED' && callData.rating) {
        await db.review.create({
          data: {
            callSessionId: callSession.id,
            fromUserId: callData.parentId,
            toUserId: callData.nannyId,
            rating: callData.rating,
            comment: callData.comment,
          },
        });
      }
    }

    // ===== NOTIFICATIONS (Sample) =====
    await db.notification.createMany({
      data: [
        {
          userId: nannies[0].id,
          type: 'SYSTEM',
          title: 'Welcome to MUMAA!',
          message: 'Your nanny profile is now live. Parents can find and connect with you.',
        },
        {
          userId: parents[0].id,
          type: 'SYSTEM',
          title: 'Welcome to MUMAA!',
          message: 'Start exploring our platform and connect with trusted nannies for your childcare needs.',
        },
        {
          userId: parents[0].id,
          type: 'CALL_COMPLETED',
          title: 'Call Summary',
          message: 'Your recent call with Priya Sharma (35 min) was completed successfully. ₹204.17 was charged.',
        },
      ],
    });

    return NextResponse.json(
      {
        message: 'Database seeded successfully',
        data: {
          admin: 1,
          nannies: nannyData.length,
          parents: parentData.length,
          callSessions: pastCalls.length,
          reviews: pastCalls.filter((c) => c.rating).length,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Something went wrong during seeding', details: error.message },
      { status: 500 }
    );
  }
}
