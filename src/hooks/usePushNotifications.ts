'use client';

// ============================================================
// MUMAA Platform — React Hook for Push Notifications
// ============================================================
// Wraps push-client.ts utilities into a convenient hook that
// automatically tracks permission state and subscription
// status, and wires up a toggle for the authenticated user.
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import {
  isPushSupported,
  getNotificationPermission,
  registerServiceWorker,
  fetchVapidPublicKey,
  subscribeToPush,
  unsubscribeFromPush,
  hasActiveSubscription,
} from '@/lib/push-client';
import type { PermissionStatus } from '@/lib/push-client';

// ── Return type ──────────────────────────────────────────────

export interface UsePushNotificationsReturn {
  /** True when the browser supports Service Workers + Push + Notifications */
  isSupported: boolean;
  /** Current Notification.permission mapped to our PermissionStatus type */
  permissionStatus: PermissionStatus;
  /** True when the user has an active push subscription */
  isSubscribed: boolean;
  /** True while an async operation (subscribe / unsubscribe) is in flight */
  isLoading: boolean;
  /** Fetched VAPID public key, or null if the server isn't configured */
  vapidPublicKey: string | null;
  /** Request permission and create a push subscription */
  subscribe: () => Promise<void>;
  /** Remove the push subscription */
  unsubscribe: () => Promise<void>;
  /** Request notification permission *only* (no subscription created) */
  requestPermission: () => Promise<PermissionStatus>;
  /** Show a test notification via the service worker (dev helper) */
  showTestNotification: () => Promise<void>;
  /** Human-readable error from the last operation, if any */
  lastError: string | null;
}

// ── Hook ─────────────────────────────────────────────────────

export function usePushNotifications(): UsePushNotificationsReturn {
  const user = useAuthStore((s) => s.user);

  // Derived once (browser APIs don't change at runtime)
  const supported = useMemo(() => isPushSupported(), []);
  const initialPermission = useMemo(() => getNotificationPermission(), []);

  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>(initialPermission);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const didInit = useRef(false);

  // ── Init on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!supported || didInit.current) return;
    didInit.current = true;

    // Fetch VAPID key from the server
    fetchVapidPublicKey()
      .then((key) => setVapidPublicKey(key))
      .catch(() => setVapidPublicKey(null));

    // Check whether the user is already subscribed
    hasActiveSubscription()
      .then((active) => setIsSubscribed(active))
      .catch(() => setIsSubscribed(false));
  }, [supported]);

  // ── Subscribe ──────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!user) {
      setLastError('You must be signed in to enable push notifications.');
      return;
    }

    setIsLoading(true);
    setLastError(null);

    const result = await subscribeToPush(user.id);

    if (result.success) {
      setIsSubscribed(true);
      setPermissionStatus('granted');
    } else {
      setLastError(result.error || 'Subscription failed.');
      // Refresh permission in case the user denied it
      setPermissionStatus(getNotificationPermission());
    }

    setIsLoading(false);
  }, [user]);

  // ── Unsubscribe ────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!user) {
      setLastError('You must be signed in to manage notifications.');
      return;
    }

    setIsLoading(true);
    setLastError(null);

    const result = await unsubscribeFromPush(user.id);

    if (result.success) {
      setIsSubscribed(false);
    } else {
      setLastError(result.error || 'Unsubscribe failed.');
    }

    setIsLoading(false);
  }, [user]);

  // ── Permission-only request ────────────────────────────────
  const requestPermission = useCallback(async (): Promise<PermissionStatus> => {
    if (!('Notification' in window)) {
      setLastError('Notifications are not supported in this browser.');
      return 'unsupported';
    }

    const status = await Notification.requestPermission();
    setPermissionStatus(status as PermissionStatus);
    return status as PermissionStatus;
  }, []);

  // ── Test notification (local, via service worker) ──────────
  const showTestNotification = useCallback(async () => {
    if (!isSubscribed) {
      setLastError('You need to be subscribed first.');
      return;
    }

    try {
      const registration = await registerServiceWorker();
      if (!registration) {
        setLastError('Service worker is not available.');
        return;
      }

      await registration.showNotification('MUMAA Test', {
        body: 'Push notifications are working! You will receive call and message alerts.',
        icon: '/logo.svg',
        badge: '/logo.svg',
        tag: 'mumaa-test',
        vibrate: [100],
      });
    } catch {
      setLastError('Could not show a test notification.');
    }
  }, [isSubscribed]);

  return {
    isSupported: supported,
    permissionStatus,
    isSubscribed,
    isLoading,
    vapidPublicKey,
    subscribe,
    unsubscribe,
    requestPermission,
    showTestNotification,
    lastError,
  };
}
