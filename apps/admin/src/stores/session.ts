import { defineStore } from 'pinia';
import type {
  AdminAuthResponse,
  AdminBootstrapPayload,
  CardCatalogItem,
  AdminSession,
} from '@kayou/shared';
import { apiRequest } from '@/api/client';

const STORAGE_KEY = 'kayou.admin.session';

interface PersistedState {
  token: string;
  expiresAt: string;
  user: AdminSession['user'] | null;
}

interface AdminSessionState extends PersistedState {
  bootstrap: AdminBootstrapPayload | null;
  loading: boolean;
  initialized: boolean;
}

export interface CardImageConversionReport {
  sourceDirectory: string;
  outputDirectory: string;
  scannedPngCount: number;
  convertedCount: number;
  deletedSourceCount: number;
  converted: Array<{
    sourceFileName: string;
    outputFileName: string;
    outputRelativePath: string;
  }>;
  failures: Array<{
    sourceFileName: string;
    message: string;
  }>;
}

export interface CardBatchImportReport {
  totalRows: number;
  successCount: number;
  createdCount: number;
  updatedCount: number;
  failureCount: number;
  failures: Array<{
    rowNumber: number;
    code: string;
    name: string;
    message: string;
  }>;
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

export const useAdminSessionStore = defineStore('admin-session', {
  state: (): AdminSessionState => ({
    ...loadPersistedState(),
    bootstrap: null,
    loading: false,
    initialized: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    players: (state) => state.bootstrap?.players ?? [],
    configs: (state) => state.bootstrap?.configs ?? [],
    cards: (state) => state.bootstrap?.cards ?? [],
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
    applyAuth(response: AdminAuthResponse) {
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
    async login(payload: { account: string; password: string }) {
      this.loading = true;

      try {
        const response = await apiRequest<AdminAuthResponse>('/admin/auth/login', {
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
        const response = await apiRequest<AdminBootstrapPayload>('/admin/bootstrap', {
          token: this.token,
        });
        this.bootstrap = response;
        this.persist();
      } finally {
        this.loading = false;
      }
    },
    async searchPlayers(keyword: string) {
      if (!this.token) {
        return;
      }

      const search = new URLSearchParams({
        keyword,
      });
      const response = await apiRequest<AdminBootstrapPayload['players']>(
        `/admin/players?${search.toString()}`,
        {
          token: this.token,
        },
      );

      if (this.bootstrap) {
        this.bootstrap = {
          ...this.bootstrap,
          players: response,
        };
      }
    },
    async updateConfig(payload: {
      key: string;
      description: string;
      value: unknown;
    }) {
      if (!this.token) {
        return;
      }

      const response = await apiRequest<AdminBootstrapPayload['configs']>(
        `/admin/configs/${payload.key}`,
        {
          method: 'PUT',
          token: this.token,
          body: {
            description: payload.description,
            value: payload.value,
          },
        },
      );

      if (this.bootstrap) {
        this.bootstrap = {
          ...this.bootstrap,
          configs: response,
        };
      }
    },
    async saveCard(payload: CardCatalogItem, mode: 'create' | 'update') {
      if (!this.token) {
        return;
      }

      const path =
        mode === 'create' ? '/admin/cards' : `/admin/cards/${payload.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';
      const response = await apiRequest<AdminBootstrapPayload['cards']>(path, {
        method,
        token: this.token,
        body: {
          code: payload.code,
          name: payload.name,
          rarity: payload.rarity,
          series: payload.series,
          camp: payload.camp,
          attribute: payload.attribute,
          stats: payload.stats,
          story: payload.story,
          imageUrl: payload.imageUrl,
          multiplier: payload.multiplier,
          enabled: payload.enabled,
          skills: payload.skills.map((skill) => ({
            skillCode: skill.skillCode,
            sortIndex: skill.sortIndex,
            name: skill.name,
            type: skill.type,
            description: skill.description,
            valueText: skill.valueText,
            triggerCondition: skill.triggerCondition,
            targetSkillCode: skill.targetSkillCode,
            isHidden: skill.isHidden,
            isEnabled: skill.isEnabled,
          })),
          relations: payload.relations.map((relation) => ({
            relationCode: relation.relationCode,
            name: relation.name,
            triggerType: relation.triggerType,
            triggerDescription: relation.triggerDescription,
            effectType: relation.effectType,
            effectDescription: relation.effectDescription,
            effectPayload: relation.effectPayload,
            targetSkillCode: relation.targetSkillCode,
            memberCardCodes: relation.members.map((member) => member.code),
            canStack: relation.canStack,
            isEnabled: relation.isEnabled,
          })),
        },
      });

      if (this.bootstrap) {
        this.bootstrap = {
          ...this.bootstrap,
          cards: response,
        };
      }
    },
    async convertCardImages() {
      if (!this.token) {
        return null;
      }

      return apiRequest<CardImageConversionReport>('/admin/assets/card-images/convert', {
        method: 'POST',
        token: this.token,
      });
    },
    async importCardsFromCsv(csvText: string) {
      if (!this.token) {
        return null;
      }

      const response = await apiRequest<{
        report: CardBatchImportReport;
        cards: AdminBootstrapPayload['cards'];
      }>('/admin/cards/import', {
        method: 'POST',
        token: this.token,
        body: {
          csvText,
        },
      });

      if (this.bootstrap) {
        this.bootstrap = {
          ...this.bootstrap,
          cards: response.cards,
        };
      }

      return response.report;
    },
  },
});
