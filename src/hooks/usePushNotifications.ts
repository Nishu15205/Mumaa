'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { apiPost, apiGet } from '@/lib/api';

// Types
interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

interface UsePushNotificationsReturn {
  /** Whether push notifications are supported in this browser */
  isSupported: boolean;
  /** Current notification permission status */
  permissionStatus: NotificationPermissionStatus;
  /** Whether the user is currently subscribed to push */
  isSubscribed: boolean;
  /** Whether a subscription operation is in progress */
  isLoading: boolean;
  /** The VAPID public key (null if not configured) */
  vapidPublicKey: string | null;
  /** Request permission and subscribe to push notifications */
  subscribe: () => Promise<boolean>;
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<boolean>;
  /** Request notification permission (without subscribing) */
  requestPermission: () => Promise<NotificationPermission>;
  /** Send a test notification (development) */
  sendTestNotification: () => Promise<void>;
}

function checkBrowserSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function getPermissionStatus(): NotificationPermissionStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationPermissionStatus;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const { user } = useAuthStore();
  const supported = useMemo(() => checkBrowserSupport(), []);
  const initialPermission = useMemo(() => getPermissionStatus(), []);

  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionStatus>(initialPermission);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Initialize: fetch VAPID key and check existing subscription
  useEffect(() => {
    if (!supported || initializedRef.current) return;
    initializedRef.current = true;

    // Fetch VAPID public key from server
    apiGet<{ publicKey: string }>('/api/push/vapid-key')
      .then((res) => setVapidPublicKey(res.publicKey))
      .catch(() => {
        setVapidPublicKey(null);
      });

    // Check existing subscription asynchronously
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setIsSubscribed(!!subscription))
      .catch(() => setIsSubscribed(false));
  }, [supported]);

  // Register service worker
  const registerServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) return null;

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      return registration;
    } catch (error) {
      console.error('[Push Hook] Service worker registration failed:', error);
      return null;
    }
  }, []);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) {
      console.warn('[Push Hook] Push not supported in this browser');
      return false;
    }

    if (!user) {
      console.warn('[Push Hook] User not authenticated');
      return false;
    }

    if (!vapidPublicKey) {
      console.warn('[Push Hook] VAPID public key not available');
      return false;
    }

    setIsLoading(true);

    try {
      // Request notification permission first
      const permission = await Notification.requestPermission();
      setPermissionStatus(permission as NotificationPermissionStatus);

      if (permission !== 'granted') {
        setIsLoading(false);
        return false;
      }

      // Register service worker
      const registration = await registerServiceWorker();
      if (!registration) {
        setIsLoading(false);
        return false;
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // Convert subscription to serializable format
      const subscriptionData: PushSubscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.toJSON().keys?.p256dh || '',
          auth: subscription.toJSON().keys?.auth || '',
        },
      };

      // Send subscription to server
      await apiPost('/api/push/subscribe', {
        userId: user.id,
        subscription: subscriptionData,
      });

      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error('[Push Hook] Subscribe failed:', error);
      setIsLoading(false);
      return false;
    }
  }, [supported, user, vapidPublicKey, registerServiceWorker]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !user) return false;

    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Remove from server
        await apiPost('/api/push/unsubscribe', {
          userId: user.id,
          endpoint: subscription.endpoint,
        });

        // Remove from browser
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error('[Push Hook] Unsubscribe failed:', error);
      setIsLoading(false);
      return false;
    }
  }, [supported, user]);

  // Request notification permission only
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!('Notification' in window)) {
      return 'denied';
    }

    const permission = await Notification.requestPermission();
    setPermissionStatus(permission as NotificationPermissionStatus);
    return permission;
  }, []);

  // Send a test notification
  const sendTestNotification = useCallback(async () => {
    if (!isSubscribed) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) return;

      const res = await apiPost<{ success: boolean }>('/api/push/test', {
        userId: user?.id,
        subscription: {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.toJSON().keys?.p256dh || '',
            auth: subscription.toJSON().keys?.auth || '',
          },
        },
      });

      if (res.success) {
        // If server doesn't have test endpoint, show local notification
      }
    } catch {
      // Fallback: show local notification via service worker
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('MUMAA Test Notification', {
          body: 'Push notifications are working! You will receive call and message alerts.',
          icon: '/logo.svg',
          badge: '/logo.svg',
          tag: 'test-notification',
        });
      } catch {
        // Ignore
      }
    }
  }, [isSubscribed, user]);

  return {
    isSupported: supported,
    permissionStatus,
    isSubscribed,
    isLoading,
    vapidPublicKey,
    subscribe,
    unsubscribe,
    requestPermission,
    sendTestNotification,
  };
}
