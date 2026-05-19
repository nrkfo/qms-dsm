import { create } from 'zustand';

export type Role = 'Admin' | 'Inspector' | 'Viewer';

export interface User {
  id: number;
  username: string;
  role: Role;
  permissions?: string[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null, // by default, no one is logged in
  token: null,
  
  login: (user, token) => {
    set({ user, token });
    // In a real app, save token to localStorage here
    localStorage.setItem('dsm_qms_token', token);
    localStorage.setItem('dsm_qms_user', JSON.stringify(user));
  },
  
  logout: () => {
    set({ user: null, token: null });
    localStorage.removeItem('dsm_qms_token');
    localStorage.removeItem('dsm_qms_user');
  },
  
  isAuthenticated: () => {
    return get().user !== null || localStorage.getItem('dsm_qms_token') !== null;
  }
}));

// Quick Hydration trigger
export const hydrateAuth = () => {
  const token = localStorage.getItem('dsm_qms_token');
  const userStr = localStorage.getItem('dsm_qms_user');
  if (token && userStr) {
    try {
      const user = JSON.parse(userStr);
      useAuthStore.getState().login(user, token);
    } catch {
      // Ignored
    }
  }
};
