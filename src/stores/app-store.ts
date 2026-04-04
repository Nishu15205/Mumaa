'use client';

import { create } from 'zustand';
import type { AppView, CallSession, IncomingCall } from '@/types';

interface AppState {
  currentView: AppView;
  sidebarOpen: boolean;
  activeTab: string;
  showVideoCall: boolean;
  currentCall: CallSession | null;
  incomingCall: IncomingCall | null;
  waitingForNanny: boolean;
}

interface AppActions {
  setCurrentView: (view: AppView) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
  startCall: (call: CallSession) => void;
  endCall: () => void;
  setIncomingCall: (call: IncomingCall | null) => void;
  setWaitingForNanny: (waiting: boolean) => void;
}

export const useAppStore = create<AppState & AppActions>()((set) => ({
  currentView: 'landing',
  sidebarOpen: true,
  activeTab: 'overview',
  showVideoCall: false,
  currentCall: null,
  incomingCall: null,
  waitingForNanny: false,

  setCurrentView: (currentView) => set({ currentView }),

  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  setActiveTab: (activeTab) => set({ activeTab }),

  startCall: (call) =>
    set({
      currentCall: call,
      showVideoCall: true,
      incomingCall: null,
      // NOTE: Do NOT reset waitingForNanny here.
      // The caller must manage it explicitly (e.g. setWaitingForNanny(true) before startCall for parent,
      // or let it stay false for nanny joining an accepted call).
    }),

  endCall: () =>
    set({
      currentCall: null,
      showVideoCall: false,
      waitingForNanny: false,
    }),

  setIncomingCall: (incomingCall) => set({ incomingCall }),

  setWaitingForNanny: (waiting) => set({ waitingForNanny: waiting }),
}));
