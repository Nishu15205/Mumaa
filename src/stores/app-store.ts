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
  /** Shared Socket.IO connection — created once in page.tsx, reused everywhere */
  socket: any | null;
  /** Whether the socket has been authenticated with the server */
  socketAuthenticated: boolean;
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
  setSocket: (socket: any) => void;
  setSocketAuthenticated: (auth: boolean) => void;
}

export const useAppStore = create<AppState & AppActions>()((set) => ({
  currentView: 'landing',
  sidebarOpen: true,
  activeTab: 'overview',
  showVideoCall: false,
  currentCall: null,
  incomingCall: null,
  waitingForNanny: false,
  socket: null,
  socketAuthenticated: false,

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
    }),

  endCall: () =>
    set({
      currentCall: null,
      showVideoCall: false,
      waitingForNanny: false,
    }),

  setIncomingCall: (incomingCall) => set({ incomingCall }),

  setWaitingForNanny: (waiting) => set({ waitingForNanny: waiting }),

  setSocket: (socket) => set({ socket }),

  setSocketAuthenticated: (socketAuthenticated) => set({ socketAuthenticated }),
}));
