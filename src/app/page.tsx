'use client';

import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { useNotificationStore } from '@/stores/notification-store';
import { apiGet } from '@/lib/api';

import LandingPage from '@/components/landing/LandingPage';
import LoginForm from '@/components/auth/LoginForm';
import SignupForm from '@/components/auth/SignupForm';
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';
import { PricingPage } from '@/components/pricing/PricingPage';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

import ParentDashboard from '@/components/dashboard/parent/ParentDashboard';
import FindNannies from '@/components/dashboard/parent/FindNannies';
import MyCalls from '@/components/dashboard/parent/MyCalls';
import ScheduleCall from '@/components/dashboard/parent/ScheduleCall';
import SubscriptionPage from '@/components/dashboard/parent/SubscriptionPage';

import NannyDashboard from '@/components/dashboard/nanny/NannyDashboard';
import NannyCalls from '@/components/dashboard/nanny/NannyCalls';
import NannyEarnings from '@/components/dashboard/nanny/NannyEarnings';

import AdminDashboard from '@/components/dashboard/admin/AdminDashboard';
import AdminAnalytics from '@/components/dashboard/admin/AdminAnalytics';
import AdminUsers from '@/components/dashboard/admin/AdminUsers';
import AdminCalls from '@/components/dashboard/admin/AdminCalls';
import AdminApplications from '@/components/dashboard/admin/AdminApplications';
import AdminPayments from '@/components/dashboard/admin/AdminPayments';

import Settings from '@/components/dashboard/Settings';
import { VideoCallScreen } from '@/components/videocall/VideoCallScreen';
import { IncomingCallDialog } from '@/components/videocall/IncomingCallDialog';
import LegalPages from '@/components/common/LegalPages';
import ApplyAsNanny from '@/components/common/ApplyAsNanny';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center animate-pulse">
          <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </div>
        <p className="text-gray-500 text-sm font-medium">Loading Mumaa...</p>
      </motion.div>
    </div>
  );
}

function ParentDashboardRouter({ activePage }: { activePage: string }) {
  switch (activePage) {
    case 'find':
      return <FindNannies />;
    case 'calls':
      return <MyCalls />;
    case 'schedule':
      return <ScheduleCall />;
    case 'subscription':
      return <SubscriptionPage />;
    case 'settings':
      return <Settings />;
    default:
      return <ParentDashboard />;
  }
}

function NannyDashboardRouter({ activePage }: { activePage: string }) {
  switch (activePage) {
    case 'calls':
      return <NannyCalls />;
    case 'availability':
      return <NannyDashboard />;
    case 'earnings':
      return <NannyEarnings />;
    case 'settings':
      return <Settings />;
    default:
      return <NannyDashboard />;
  }
}

function AdminDashboardRouter({ activePage }: { activePage: string }) {
  switch (activePage) {
    case 'users':
      return <AdminUsers />;
    case 'calls':
      return <AdminCalls />;
    case 'analytics':
      return <AdminAnalytics />;
    case 'applications':
      return <AdminApplications />;
    case 'payments':
      return <AdminPayments />;
    default:
      return <AdminDashboard />;
  }
}

export default function Home() {
  const { user, isAuthenticated, isLoading, setUser, setSubscription } = useAuthStore();
  const { currentView, showVideoCall, incomingCall, setActiveTab, setCurrentView } = useAppStore();
  const { addNotification } = useNotificationStore();
  const [dashboardPage, setDashboardPage] = useState('dashboard');
  const [mounted, setMounted] = useState(false);

  // Mark as mounted and ensure loading is false after hydration
  useEffect(() => {
    // Immediately mark mounted
    setMounted(true);
    // Immediately force loading false - the store will rehydrate from localStorage
    useAuthStore.setState({ isLoading: false });
  }, []);

  // Sync activeTab with dashboardPage
  useEffect(() => {
    setActiveTab(dashboardPage);
  }, [dashboardPage, setActiveTab]);

  // Restore session on mount
  useEffect(() => {
    if (!user || isLoading) return;

    apiGet<{ user: any; subscription?: any }>(`/api/auth/me?userId=${user.id}`)
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          if (data.subscription) {
            setSubscription(data.subscription);
          }
        }
      })
      .catch(() => {
        // Session expired, stay with local data
      });

    apiGet<{ notifications: any[] }>(`/api/notifications?userId=${user.id}`)
      .then((data) => {
        if (data.notifications) {
          data.notifications.forEach((n: any) => {
            addNotification(n);
          });
        }
      })
      .catch(() => {});
  }, [user?.id]);

  // Redirect based on auth state
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && user) {
      if (currentView === 'landing' || currentView === 'login' || currentView === 'signup') {
        const view = user.role === 'ADMIN' ? 'admin-dashboard' : user.role === 'NANNY' ? 'nanny-dashboard' : 'parent-dashboard';
        setCurrentView(view);
      }
    } else if (!isAuthenticated) {
      if (currentView !== 'landing' && currentView !== 'login' && currentView !== 'signup' && currentView !== 'forgot-password' && currentView !== 'pricing' && currentView !== 'terms' && currentView !== 'privacy' && currentView !== 'about' && currentView !== 'apply-nanny') {
        setCurrentView('landing');
      }
    }
  }, [isAuthenticated, user, isLoading, currentView, setCurrentView]);

  const handlePageChange = useCallback((page: string) => {
    setDashboardPage(page);
  }, []);

  // Socket.IO for real-time features
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let socket: any = null;

    const initSocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        socket = io('/?XTransformPort=3003', {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        socket.on('connect', () => {
          socket.emit('auth', { userId: user.id, role: user.role });
        });

        socket.on('incoming-call', (data: any) => {
          useAppStore.getState().setIncomingCall({
            callId: data.callId,
            callerId: data.callerId,
            callerName: data.callerName,
            callerAvatar: null,
            type: data.callType || 'INSTANT',
          });
        });

        socket.on('call-ended', () => {
          useAppStore.getState().endCall();
        });

        socket.on('new-notification', (data: any) => {
          addNotification(data.notification);
        });
      } catch {
        // Socket not available, continue without real-time features
      }
    };

    initSocket();

    return () => {
      if (socket) socket.disconnect();
    };
  }, [isAuthenticated, user?.id]);

  if (!mounted) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Video Call Overlay - renders on top of everything */}
      {showVideoCall && <VideoCallScreen />}

      {/* Incoming Call Dialog */}
      <IncomingCallDialog call={incomingCall} />

      {/* Main Content */}
      {!showVideoCall && (
        <AnimatePresence mode="wait">
          {/* Public Pages */}
          {(!isAuthenticated || currentView === 'landing' || currentView === 'login' || currentView === 'signup' || currentView === 'forgot-password' || currentView === 'pricing' || currentView === 'terms' || currentView === 'privacy' || currentView === 'about' || currentView === 'apply-nanny') && (
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {currentView === 'landing' && <LandingPage />}
              {currentView === 'login' && (
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-pink-50 px-4">
                  <LoginForm />
                </div>
              )}
              {currentView === 'signup' && (
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-pink-50 px-4 py-8">
                  <SignupForm />
                </div>
              )}
              {currentView === 'forgot-password' && (
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-pink-50 px-4">
                  <ForgotPasswordForm />
                </div>
              )}
              {currentView === 'pricing' && (
                <div className="min-h-screen bg-white">
                  <PricingPage />
                </div>
              )}
              {(currentView === 'terms' || currentView === 'privacy' || currentView === 'about') && (
                <LegalPages
                  page={currentView as 'terms' | 'privacy' | 'about'}
                  onBack={() => setCurrentView('landing')}
                />
              )}
              {currentView === 'apply-nanny' && <ApplyAsNanny />}
            </motion.div>
          )}

          {/* Dashboard */}
          {isAuthenticated && user && (
            <motion.div
              key={`dashboard-${user.role}-${dashboardPage}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-screen"
            >
              <DashboardLayout activePage={dashboardPage} onPageChange={handlePageChange}>
                {user.role === 'PARENT' && <ParentDashboardRouter activePage={dashboardPage} />}
                {user.role === 'NANNY' && <NannyDashboardRouter activePage={dashboardPage} />}
                {user.role === 'ADMIN' && <AdminDashboardRouter activePage={dashboardPage} />}
              </DashboardLayout>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
