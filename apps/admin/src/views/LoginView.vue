<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { useAdminSessionStore } from '@/stores/session';

const router = useRouter();
const session = useAdminSessionStore();
const submitting = computed(() => session.loading);
const form = reactive({
  account: '',
  password: '',
});

onMounted(async () => {
  await session.initialize();

  if (session.isAuthenticated) {
    void router.replace('/dashboard');
  }
});

async function handleLogin() {
  if (!form.account.trim() || !form.password.trim()) {
    ElMessage.warning('管理员账号和密码不能为空');
    return;
  }

  try {
    await session.login({
      account: form.account.trim(),
      password: form.password,
    });
    ElMessage.success('后台登录成功');
    void router.push('/dashboard');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '后台登录失败');
  }
}
</script>

<template>
  <main class="admin-shell">
    <section class="admin-login-card">
      <p class="eyebrow">Kayou Admin</p>
      <h1>后台管理系统骨架</h1>
      <p class="admin-copy">
        当前版本已经接入真实管理员登录、玩家查询和基础数值查看。开发环境默认管理员账号为
        <strong>admin / kayouadmin</strong>。
      </p>

      <el-form class="admin-form" label-position="top" @submit.prevent="handleLogin">
        <el-form-item label="管理员账号">
          <el-input v-model="form.account" placeholder="请输入管理员账号" />
        </el-form-item>

        <el-form-item label="密码">
          <el-input v-model="form.password" placeholder="请输入管理员密码" show-password />
        </el-form-item>

        <el-button
          class="full-width"
          type="primary"
          size="large"
          :loading="submitting"
          @click="handleLogin"
        >
          登录后台
        </el-button>
      </el-form>
    </section>
  </main>
</template>
