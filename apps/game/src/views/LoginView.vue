<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { useGameSessionStore } from '@/stores/session';

const router = useRouter();
const session = useGameSessionStore();
const mode = ref<'login' | 'register'>('login');
const showForm = ref(false);
const submitting = computed(() => session.loading);
const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
});

onMounted(async () => {
  await session.initialize();

  if (session.isAuthenticated) {
    void router.replace('/home');
  }
});

async function handleSubmit() {
  if (!form.username.trim() || !form.password.trim()) {
    ElMessage.warning('用户名和密码都不能为空');
    return;
  }

  if (mode.value === 'register') {
    if (form.password !== form.confirmPassword) {
      ElMessage.warning('两次输入的密码不一致');
      return;
    }
  }

  try {
    if (mode.value === 'login') {
      await session.login({
        username: form.username.trim(),
        password: form.password,
      });
      ElMessage.success('登录成功');
      void router.push('/home');
      return;
    }

    await session.register({
      username: form.username.trim(),
      password: form.password,
    });
    ElMessage.success('注册成功，已自动进入主界面');
    void router.push('/home');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '网络连接失败，请重试');
  }
}
</script>

<template>
  <main class="game-shell">
    <section class="entry-hero">
      <div class="entry-copy">
        <p class="eyebrow">Kayou Card Battle</p>
        <h1>四张卡出战的轻量爬塔冒险</h1>
        <p class="hero-copy">
          随机小游戏决定伤害倍率，卡组选择决定通关上限。当前版本已开始接入真实账号、卡牌与爬塔数据流。
        </p>

        <div class="entry-meta">
          <span>Version 0.1.0</span>
          <span>手机端竖屏优先</span>
          <span>隐私政策：仅保存账号与游戏进度数据</span>
        </div>

        <el-button
          class="entry-button"
          type="primary"
          size="large"
          @click="showForm = true"
        >
          进入登录
        </el-button>
      </div>

      <section v-if="showForm" class="auth-panel">
        <div class="auth-switch">
          <button
            class="mode-button"
            :class="{ active: mode === 'login' }"
            type="button"
            @click="mode = 'login'"
          >
            登录
          </button>
          <button
            class="mode-button"
            :class="{ active: mode === 'register' }"
            type="button"
            @click="mode = 'register'"
          >
            注册
          </button>
        </div>

        <el-form class="login-form" label-position="top" @submit.prevent="handleSubmit">
          <el-form-item label="用户名">
            <el-input v-model="form.username" placeholder="请输入用户名" />
          </el-form-item>

          <el-form-item label="密码">
            <el-input v-model="form.password" placeholder="请输入密码" show-password />
          </el-form-item>

          <el-form-item v-if="mode === 'register'" label="确认密码">
            <el-input
              v-model="form.confirmPassword"
              placeholder="请再次输入密码"
              show-password
            />
          </el-form-item>

          <el-button
            class="primary-button"
            type="primary"
            size="large"
            :loading="submitting"
            @click="handleSubmit"
          >
            {{ mode === 'login' ? '登录并进入主界面' : '创建账号并开始冒险' }}
          </el-button>
        </el-form>
      </section>
    </section>
  </main>
</template>
