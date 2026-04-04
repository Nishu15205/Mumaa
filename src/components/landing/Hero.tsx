'use client';

import { motion } from 'framer-motion';
import { Play, Shield, Star, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/app-store';

const trustBadges = [
  { icon: Users, text: '1,000+ Parents Trust Us', color: 'text-rose-600' },
  { icon: Shield, text: '500+ Verified Nannies', color: 'text-emerald-600' },
  { icon: Star, text: '4.9\u2605 Average Rating', color: 'text-amber-600' },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export default function Hero() {
  const { setCurrentView } = useAppStore();

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-rose-50 via-pink-50 to-orange-50" />

      {/* Decorative blobs */}
      <div className="absolute top-20 -left-32 w-96 h-96 bg-rose-200/30 rounded-full blur-3xl" />
      <div className="absolute top-40 right-0 w-80 h-80 bg-pink-200/25 rounded-full blur-3xl" />
      <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-orange-200/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-amber-200/20 rounded-full blur-3xl" />

      {/* Floating shapes */}
      <motion.div
        animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-32 right-20 w-4 h-4 rounded-full bg-rose-400/40 hidden lg:block"
      />
      <motion.div
        animate={{ y: [0, 15, 0], rotate: [0, -8, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-48 left-20 w-3 h-3 rounded-full bg-emerald-400/40 hidden lg:block"
      />
      <motion.div
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-40 left-32 w-5 h-5 rounded-lg bg-amber-400/30 rotate-45 hidden lg:block"
      />
      <motion.div
        animate={{ y: [0, 18, 0], rotate: [0, 10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-32 right-40 w-3 h-3 rounded-full bg-pink-400/40 hidden lg:block"
      />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16 md:pt-32 md:pb-24 w-full"
      >
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <motion.div variants={itemVariants}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-100 text-rose-700 text-sm font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              Trusted by 1,000+ Indian Families
            </span>
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            variants={itemVariants}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 leading-tight tracking-tight"
          >
            Connect with{' '}
            <span className="bg-gradient-to-r from-rose-600 via-pink-600 to-rose-500 bg-clip-text text-transparent">
              Trusted Nannies
            </span>
            <br />
            <span className="text-gray-800">Anytime, Anywhere.</span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            variants={itemVariants}
            className="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed"
          >
            Get instant video consultations with experienced, verified childcare professionals.
            No more waiting — get the help you need right now.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div variants={itemVariants} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="w-full sm:w-auto rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white shadow-xl shadow-rose-500/25 hover:shadow-rose-500/40 transition-all px-8 h-14 text-base font-semibold"
              onClick={() => setCurrentView('signup')}
            >
              Start Free Trial
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto rounded-2xl border-gray-300 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 px-8 h-14 text-base font-medium gap-2 group"
            >
              <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center group-hover:bg-rose-200 transition-colors">
                <Play className="w-3.5 h-3.5 text-rose-600 fill-rose-600 ml-0.5" />
              </div>
              Watch How It Works
            </Button>
          </motion.div>

          {/* Trust Badges */}
          <motion.div
            variants={itemVariants}
            className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10"
          >
            {trustBadges.map((badge, idx) => (
              <div key={idx} className="flex items-center gap-2.5 text-gray-600">
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center">
                  <badge.icon className={`w-5 h-5 ${badge.color}`} />
                </div>
                <span className="text-sm font-medium text-gray-700">{badge.text}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
