'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Eye, EyeOff, Loader2, ArrowLeft, X, User, Baby, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import type { AppView } from '@/types';

const DEMO_ACCOUNTS = [
  {
    role: 'PARENT' as const,
    label: 'Parent',
    name: 'Rahul Mehta',
    email: 'rahul.mehta@email.com',
    password: 'parent123',
    icon: User,
    color: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
    textColor: 'text-emerald-700',
    description: '2 kids · PRO plan',
  },
  {
    role: 'NANNY' as const,
    label: 'Nanny',
    name: 'Priya Sharma',
    email: 'priya.sharma@email.com',
    password: 'nanny123',
    icon: Baby,
    color: 'from-violet-500 to-purple-600',
    bgColor: 'bg-violet-50 border-violet-200 hover:bg-violet-100',
    textColor: 'text-violet-700',
    description: '5 yrs exp · 4.8★',
  },
  {
    role: 'ADMIN' as const,
    label: 'Admin',
    name: 'MUMAA Admin',
    email: 'admin@mumaa.in',
    password: 'admin123',
    icon: ShieldCheck,
    color: 'from-rose-500 to-pink-600',
    bgColor: 'bg-rose-50 border-rose-200 hover:bg-rose-100',
    textColor: 'text-rose-700',
    description: 'Super Admin',
  },
];

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  const { setUser, setSubscription } = useAuthStore();
  const { setCurrentView } = useAppStore();

  const doLogin = async (loginEmail: string, loginPassword: string, isAdmin: boolean) => {
    setError('');
    setLoading(true);
    try {
      const endpoint = isAdmin ? '/api/auth/admin-login' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || data?.message || 'Login failed. Please try again.');
        return;
      }
      setUser(data.user);
      if (data.subscription) setSubscription(data.subscription);
      const role = data.user.role as string;
      const viewMap: Record<string, AppView> = {
        PARENT: 'parent-dashboard',
        NANNY: 'nanny-dashboard',
        ADMIN: 'admin-dashboard',
      };
      setCurrentView(viewMap[role] || 'landing');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    await doLogin(email, password, false);
  };

  const handleDemoLogin = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(account.email);
    setPassword(account.password);
    doLogin(account.email, account.password, account.role === 'ADMIN');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-pink-50 to-orange-50 px-4">
      {/* Decorative blobs */}
      <div className="fixed top-20 -left-20 w-72 h-72 bg-rose-200/30 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-20 -right-20 w-64 h-64 bg-pink-200/25 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative"
      >
        {/* Back button */}
        <button
          onClick={() => setCurrentView('landing')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-rose-600 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </button>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
              Mumaa
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 text-center mt-4 mb-1">
            Welcome Back
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            Sign in to your account to continue
          </p>

          {/* Demo Accounts Quick Login */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowDemo(!showDemo)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <span className="text-sm font-semibold flex items-center gap-2">
                <span className="text-base">🚀</span> Quick Demo Login
              </span>
              {showDemo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <AnimatePresence>
              {showDemo && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 space-y-2">
                    <p className="text-xs text-gray-400 text-center mb-2">Click to instantly login as any role</p>
                    {DEMO_ACCOUNTS.map((account) => {
                      const Icon = account.icon;
                      return (
                        <button
                          key={account.role}
                          type="button"
                          onClick={() => handleDemoLogin(account)}
                          disabled={loading}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border ${account.bgColor} transition-all duration-200 group disabled:opacity-50`}
                        >
                          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${account.color} flex items-center justify-center flex-shrink-0`}>
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-semibold ${account.textColor}`}>{account.name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/70 text-gray-500 font-medium">{account.label}</span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">{account.email} · {account.description}</p>
                          </div>
                          <span className="text-xs text-gray-400 group-hover:text-gray-600 flex-shrink-0">→</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Divider */}
          {!showDemo && (
            <div className="mb-6 flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">or login manually</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center justify-between">
              {error}
              <button onClick={() => setError('')}>
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email" className="text-sm font-medium text-gray-700">
                Email Address
              </Label>
              <Input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password" className="text-sm font-medium text-gray-700">
                  Password
                </Label>
                <button
                  type="button"
                  onClick={() => setCurrentView('forgot-password')}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20 pr-12"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-semibold shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Switch to signup */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Don&apos;t have an account?{' '}
              <button
                onClick={() => setCurrentView('signup')}
                className="text-rose-600 hover:text-rose-700 font-semibold"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>

        {/* Help text below card */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-400">
            New user? Sign Up as <button onClick={() => { setCurrentView('signup'); }} className="text-emerald-600 hover:underline font-medium">Parent</button> or <button onClick={() => { setCurrentView('signup'); }} className="text-violet-600 hover:underline font-medium">Nanny</button> to get started
          </p>
        </div>
      </motion.div>
    </div>
  );
}
