<script setup>
import { reactive, ref } from 'vue'
import { apiRequest } from '../api'

const props = defineProps({
  globalMessage: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['authenticated'])

const mode = ref('login')
const loading = ref(false)
const healthText = ref('正在连接服务...')
const localMessage = reactive({
  type: '',
  text: '',
})

const loginForm = reactive({
  username: '',
  password: '',
})

const registerForm = reactive({
  username: '',
  displayName: '',
  password: '',
  confirmPassword: '',
})

const checkHealth = async () => {
  try {
    const result = await apiRequest('/api/health')
    healthText.value = `服务正常，数据库 ${result.database} 已连接`
  } catch (error) {
    healthText.value = error.message
  }
}

checkHealth()

const handleLogin = async () => {
  if (!loginForm.username.trim() || !loginForm.password.trim()) {
    localMessage.type = 'error'
    localMessage.text = '请输入用户名和密码。'
    return
  }

  loading.value = true
  localMessage.type = ''
  localMessage.text = ''

  try {
    const result = await apiRequest('/api/login', {
      method: 'POST',
      body: loginForm,
    })
    emit('authenticated', result)
  } catch (error) {
    localMessage.type = 'error'
    localMessage.text = error.message
  } finally {
    loading.value = false
  }
}

const handleRegister = async () => {
  if (!registerForm.username.trim() || !registerForm.password.trim()) {
    localMessage.type = 'error'
    localMessage.text = '请先填写完整的注册信息。'
    return
  }

  if (registerForm.password !== registerForm.confirmPassword) {
    localMessage.type = 'error'
    localMessage.text = '两次输入的密码不一致。'
    return
  }

  loading.value = true
  localMessage.type = ''
  localMessage.text = ''

  try {
    const result = await apiRequest('/api/register', {
      method: 'POST',
      body: {
        username: registerForm.username,
        displayName: registerForm.displayName,
        password: registerForm.password,
      },
    })
    emit('authenticated', result)
  } catch (error) {
    localMessage.type = 'error'
    localMessage.text = error.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="auth-layout">
    <div class="hero-panel">
      <p class="eyebrow">Control Center</p>
      <h1>一个登录入口，直接进入你的数据后台。</h1>
      <p class="hero-copy">
        首页支持注册，登录后进入左侧导航后台。你可以查看大屏统计、管理个人信息，还能继续手动添加新的功能页。
      </p>
      <div class="hero-metrics">
        <article>
          <strong>实时</strong>
          <span>在线人数与活跃会话</span>
        </article>
        <article>
          <strong>可扩展</strong>
          <span>左侧功能栏支持继续新增</span>
        </article>
        <article>
          <strong>个人中心</strong>
          <span>头像、账号、密码都能改</span>
        </article>
      </div>
    </div>

    <div class="auth-card">
      <div class="auth-tabs">
        <button :class="{ active: mode === 'login' }" type="button" @click="mode = 'login'">登录</button>
        <button :class="{ active: mode === 'register' }" type="button" @click="mode = 'register'">注册</button>
      </div>

      <p class="health">{{ healthText }}</p>
      <p v-if="props.globalMessage" class="message error">{{ props.globalMessage }}</p>
      <p v-if="localMessage.text" class="message" :class="localMessage.type">{{ localMessage.text }}</p>

      <form v-if="mode === 'login'" class="auth-form" @submit.prevent="handleLogin">
        <label for="login-username">账号</label>
        <input id="login-username" v-model="loginForm.username" autocomplete="username" placeholder="请输入账号" type="text" />

        <label for="login-password">密码</label>
        <input id="login-password" v-model="loginForm.password" autocomplete="current-password" placeholder="请输入密码" type="password" />

        <button class="submit-button" :disabled="loading" type="submit">
          {{ loading ? '登录中...' : '进入后台' }}
        </button>
      </form>

      <form v-else class="auth-form" @submit.prevent="handleRegister">
        <label for="register-username">账号</label>
        <input id="register-username" v-model="registerForm.username" autocomplete="username" placeholder="至少 1 个字符" type="text" />

        <label for="register-display-name">昵称</label>
        <input id="register-display-name" v-model="registerForm.displayName" placeholder="用于首页和个人中心展示" type="text" />

        <label for="register-password">密码</label>
        <input id="register-password" v-model="registerForm.password" autocomplete="new-password" placeholder="不少于 6 位" type="password" />

        <label for="register-confirm-password">确认密码</label>
        <input id="register-confirm-password" v-model="registerForm.confirmPassword" autocomplete="new-password" placeholder="再次输入密码" type="password" />

        <button class="submit-button" :disabled="loading" type="submit">
          {{ loading ? '注册中...' : '注册并进入后台' }}
        </button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.auth-layout { width: min(1180px, 100%); display: grid; grid-template-columns: 1.2fr 0.9fr; gap: 28px; align-items: stretch; }
.hero-panel, .auth-card { border-radius: 32px; padding: 32px; backdrop-filter: blur(18px); }
.hero-panel { color: #eff6ff; background: linear-gradient(160deg, rgba(11,37,69,.95), rgba(14,116,144,.88)); box-shadow: 0 28px 80px rgba(15,23,42,.24); }
.eyebrow { margin: 0 0 16px; color: #bae6fd; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(32px, 4vw, 54px); line-height: 1.05; }
.hero-copy { max-width: 560px; margin: 18px 0 26px; color: rgba(239,246,255,.82); font-size: 17px; line-height: 1.7; }
.hero-metrics { display: grid; gap: 14px; }
.hero-metrics article { padding: 18px 20px; border: 1px solid rgba(186,230,253,.16); border-radius: 20px; background: rgba(15,23,42,.18); }
.hero-metrics strong { display: block; margin-bottom: 6px; font-size: 20px; }
.hero-metrics span { color: rgba(239,246,255,.72); }
.auth-card { border: 1px solid rgba(148,163,184,.2); background: rgba(255,255,255,.9); box-shadow: 0 28px 80px rgba(15,23,42,.14); }
.auth-tabs { display: inline-grid; grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 6px; border-radius: 999px; background: #e2e8f0; }
.auth-tabs button { border: none; border-radius: 999px; padding: 10px 18px; background: transparent; color: #475569; font-size: 14px; font-weight: 700; cursor: pointer; }
.auth-tabs button.active { background: #fff; color: #0f172a; box-shadow: 0 10px 18px rgba(15,23,42,.08); }
.health { margin: 20px 0 12px; color: #0369a1; font-size: 14px; }
.auth-form { display: grid; gap: 12px; }
label { font-size: 14px; font-weight: 700; }
input { width: 100%; border: 1px solid #cbd5e1; border-radius: 16px; padding: 14px 16px; font-size: 15px; transition: border-color .2s ease, box-shadow .2s ease; }
input:focus { border-color: #0ea5e9; box-shadow: 0 0 0 4px rgba(14,165,233,.12); outline: none; }
.submit-button { margin-top: 8px; border: none; border-radius: 16px; padding: 14px 18px; background: linear-gradient(135deg, #0f766e, #0284c7); color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; }
.submit-button:disabled { opacity: .72; cursor: not-allowed; }
.message { margin: 12px 0; border-radius: 14px; padding: 12px 14px; font-size: 14px; }
.message.error { background: #fff1f2; color: #be123c; }
@media (max-width: 960px) { .auth-layout { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .hero-panel, .auth-card { padding: 24px; } }
</style>
