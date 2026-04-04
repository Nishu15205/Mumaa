'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Eye, EyeOff, Loader2, ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import type { AppView } from '@/types';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';

export default function SignupForm() {
  const [role, setRole] = useState<'PARENT' | 'NANNY'>('PARENT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Common fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Parent fields
  const [childrenCount, setChildrenCount] = useState('');
  const [childrenAges, setChildrenAges] = useState('');

  // Nanny fields
  const [experience, setExperience] = useState('');
  const [skills, setSkills] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [languages, setLanguages] = useState('');
  const [certifications, setCertifications] = useState('');

  const { setUser, setSubscription } = useAuthStore();
  const { setCurrentView } = useAppStore();

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingRole, setOnboardingRole] = useState<'PARENT' | 'NANNY'>('PARENT');
  const [onboardingName, setOnboardingName] = useState('');

  const validate = (): boolean => {
    setError('');
    if (!name.trim() || !email.trim() || !phone.trim() || !password.trim()) {
      setError('Please fill in all required fields.');
      return false;
    }
    if (!email.includes('@') || !email.includes('.')) {
      setError('Please enter a valid email address.');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }
    if (!agreed) {
      setError('Please agree to the Terms & Conditions.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    try {
      const body: Record<string, string> = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role,
      };

      if (role === 'PARENT') {
        body.childrenCount = childrenCount;
        body.childrenAges = childrenAges;
      } else {
        body.experience = experience;
        body.skills = skills;
        body.hourlyRate = hourlyRate;
        body.languages = languages;
        body.certifications = certifications;
      }

      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || data?.message || 'Signup failed. Please try again.');
        return;
      }

      setUser(data.user);
      if (data.subscription) {
        setSubscription(data.subscription);
      }

      // Trigger onboarding after signup
      setOnboardingRole(role);
      setOnboardingName(data.user.name || name);
      setShowOnboarding(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Onboarding complete handler
  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    const viewMap: Record<string, AppView> = {
      PARENT: 'parent-dashboard',
      NANNY: 'nanny-dashboard',
    };
    setCurrentView(viewMap[onboardingRole] || 'landing');
  };

  // Show onboarding flow if triggered
  if (showOnboarding) {
    return (
      <OnboardingFlow
        role={onboardingRole}
        userName={onboardingName}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-pink-50 to-orange-50 px-4 py-12">
      <div className="absolute top-20 -left-20 w-72 h-72 bg-rose-200/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 -right-20 w-64 h-64 bg-pink-200/25 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg relative"
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
            Create Your Account
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            Join thousands of parents and nannies on Mumaa
          </p>

          {/* Role Tabs */}
          <Tabs value={role} onValueChange={(v) => setRole(v as 'PARENT' | 'NANNY')} className="mb-6">
            <TabsList className="w-full grid grid-cols-2 h-12 rounded-xl bg-gray-100 p-1">
              <TabsTrigger
                value="PARENT"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-rose-600 transition-all text-sm font-medium"
              >
                I&apos;m a Parent
              </TabsTrigger>
              <TabsTrigger
                value="NANNY"
                className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-rose-600 transition-all text-sm font-medium"
              >
                I&apos;m a Nanny
              </TabsTrigger>
            </TabsList>
          </Tabs>

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
            {/* Common Fields */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">
                Full Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">
                  Email <span className="text-rose-500">*</span>
                </Label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">
                  Phone <span className="text-rose-500">*</span>
                </Label>
                <Input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">
                  Password <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20 pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">
                  Confirm Password <span className="text-rose-500">*</span>
                </Label>
                <Input
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Parent-specific fields */}
            {role === 'PARENT' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">Number of Children</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 1"
                      min="0"
                      max="10"
                      value={childrenCount}
                      onChange={(e) => setChildrenCount(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">Children&apos;s Ages</Label>
                    <Input
                      placeholder="e.g., 2, 5"
                      value={childrenAges}
                      onChange={(e) => setChildrenAges(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                      disabled={loading}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Nanny-specific fields */}
            {role === 'NANNY' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">Years of Experience</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 5"
                      min="0"
                      value={experience}
                      onChange={(e) => setExperience(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">Hourly Rate (₹)</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 500"
                      min="0"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">Skills</Label>
                  <Input
                    placeholder="e.g., newborn care, sleep training, toddler activities"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-400">Separate multiple skills with commas</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">Languages</Label>
                    <Input
                      placeholder="e.g., Hindi, English"
                      value={languages}
                      onChange={(e) => setLanguages(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">Certifications</Label>
                    <Input
                      placeholder="e.g., CPR, First Aid"
                      value={certifications}
                      onChange={(e) => setCertifications(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus:border-rose-400 focus:ring-rose-400/20"
                      disabled={loading}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Terms */}
            <div className="flex items-start gap-3 pt-2">
              <Checkbox
                id="terms"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="mt-0.5 data-[state=checked]:bg-rose-500 data-[state=checked]:border-rose-500"
              />
              <label htmlFor="terms" className="text-sm text-gray-600 leading-relaxed cursor-pointer">
                I agree to the{' '}
                <button type="button" className="text-rose-600 hover:underline font-medium">
                  Terms of Service
                </button>{' '}
                and{' '}
                <button type="button" className="text-rose-600 hover:underline font-medium">
                  Privacy Policy
                </button>
              </label>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-semibold shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          {/* Login link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <button
                onClick={() => setCurrentView('login')}
                className="text-rose-600 hover:text-rose-700 font-semibold"
              >
                Log In
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
