import { defineStore } from 'pinia';
import type {
  DeckPreset,
  PlayerAuthResponse,
  PlayerBootstrapPayload,
  PlayerSession,
} from '@kayou/shared';
import { apiRequest } from '@/api/client';

const STORAGE_KEY = 'kayou.game.session';

interface PersistedState {
  token: string;
  expiresAt: string;
  user: PlayerSession['user'] | null;
}

interface GameSessionState extends PersistedState {
  bootstrap: PlayerBootstrapPayload | null;
  loading: boolean;
  initialized: boolean;
}

function loadPersistedState(): PersistedState {
  if (typeof window === 'undefined') {
    return {
      token: '',
      expiresAt: '',
      user: null,
    };
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return {
      token: '',
      expiresAt: '',
      user: null,
    };
  }

  try {
    return JSON.parse(raw) as PersistedState;
  } catch {
    return {
      token: '',
      expiresAt: '',
      user: null,
    };
  }
}

export const useGameSessionStore = defineStore('game-session', {
  state: (): GameSessionState => ({
    ...loadPersistedState(),
    bootstrap: null,
    loading: false,
    initialized: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    profile: (state) => state.bootstrap?.profile ?? null,
    collection: (state) => state.bootstrap?.collection ?? [],
    deckPresets: (state) => state.bootstrap?.deckPresets ?? [],
    tower: (state) => state.bootstrap?.tower ?? null,
  },
  actions: {
    persist() {
      if (typeof window === 'undefined') {
        return;
      }

      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          token: this.token,
          expiresAt: this.expiresAt,
          user: this.user,
        }),
      );
    },
    applyAuth(response: PlayerAuthResponse) {
      this.token = response.session.token;
      this.expiresAt = response.session.expiresAt;
      this.user = response.session.user;
      this.bootstrap = response.bootstrap;
      this.persist();
    },
    signOut() {
      this.token = '';
      this.expiresAt = '';
      this.user = null;
      this.bootstrap = null;
      this.loading = false;
      this.persist();
    },
    async initialize() {
      if (this.initialized) {
        return;
      }

      this.initialized = true;

      if (!this.token) {
        return;
      }

      try {
        await this.fetchBootstrap();
      } catch {
        this.signOut();
      }
    },
    async register(payload: { username: string; password: string }) {
      this.loading = true;

      try {
        const response = await apiRequest<PlayerAuthResponse>('/player/auth/register', {
          method: 'POST',
          body: payload,
        });
        this.applyAuth(response);
      } finally {
        this.loading = false;
      }
    },
    async login(payload: { username: string; password: string }) {
      this.loading = true;

      try {
        const response = await apiRequest<PlayerAuthResponse>('/player/auth/login', {
          method: 'POST',
          body: payload,
        });
        this.applyAuth(response);
      } finally {
        this.loading = false;
      }
    },
    async fetchBootstrap() {
      if (!this.token) {
        return;
      }

      this.loading = true;

      try {
        const response = await apiRequest<PlayerBootstrapPayload>('/player/bootstrap', {
          token: this.token,
        });
        this.bootstrap = response;
        this.persist();
      } finally {
        this.loading = false;
      }
    },
    async saveDeck(payload: {
      slotIndex: number;
      presetName: string;
      cardIds: number[];
    }) {
      if (!this.token) {
        return;
      }

      this.loading = true;

      try {
        const response = await apiRequest<PlayerBootstrapPayload>('/player/deck', {
          method: 'PUT',
          token: this.token,
          body: payload,
        });
        this.bootstrap = response;
        this.persist();
      } finally {
        this.loading = false;
      }
    },
    usePreset(preset: DeckPreset | null) {
      if (!this.bootstrap || !preset) {
        return;
      }

      this.bootstrap = {
        ...this.bootstrap,
        deckPresets: this.bootstrap.deckPresets.map((item) => ({
          ...item,
          isActive: item.slotIndex === preset.slotIndex,
        })),
      };
    },
  },
});
