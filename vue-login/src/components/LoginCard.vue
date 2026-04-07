<script setup>
import { reactive, ref } from 'vue'

const form = reactive({
  username: '',
  password: '',
  remember: false,
})

const loading = ref(false)
const message = reactive({
  text: '',
  type: '',
})

const submit = () => {
  const username = form.username.trim()
  const password = form.password.trim()

  if (!username || !password) {
    message.text = '用户名和密码不能为空。'
    message.type = 'error'
    return
  }

  if (password.length < 6) {
    message.text = '密码长度不能少于 6 位。'
    message.type = 'error'
    return
  }

  loading.value = true
  message.text = ''
  message.type = ''

  setTimeout(() => {
    const rememberText = form.remember ? '（已记住登录）' : ''
    message.text = `登录成功，欢迎你：${username}${rememberText}`
    message.type = 'success'
    loading.value = false
  }, 800)
}
</script>

<template>
  <section class="login-card" aria-labelledby="login-title">
    <h1 id="login-title">欢迎登录</h1>
    <p class="subtitle">请输入账号和密码继续</p>

    <form class="form" @submit.prevent="submit" novalidate>
      <label for="username">用户名</label>
      <input
        id="username"
        v-model="form.username"
        name="username"
        type="text"
        placeholder="请输入用户名"
        autocomplete="username"
        required
      />

      <label for="password">密码</label>
      <input
        id="password"
        v-model="form.password"
        name="password"
        type="password"
        placeholder="请输入密码"
        autocomplete="current-password"
        required
      />

      <div class="row">
        <label class="checkbox">
          <input id="remember" v-model="form.remember" name="remember" type="checkbox" />
          <span>记住我</span>
        </label>
        <a href="#" class="link">忘记密码？</a>
      </div>

      <button id="submit-btn" type="submit" :disabled="loading">
        {{ loading ? '登录中...' : '登录' }}
      </button>

      <p class="message" :class="message.type" aria-live="polite">
        {{ message.text }}
      </p>
    </form>
  </section>
</template>

<style scoped>
.login-card {
  width: 100%;
  max-width: 400px;
  background: #ffffff;
  border-radius: 14px;
  padding: 28px 24px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
}

h1 {
  margin: 0;
  font-size: 26px;
}

.subtitle {
  margin: 8px 0 20px;
  color: #64748b;
}

.form {
  display: grid;
  gap: 12px;
}

label {
  font-size: 14px;
}

input[type='text'],
input[type='password'] {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s;
}

input[type='text']:focus,
input[type='password']:focus {
  border-color: #2563eb;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  margin-top: 2px;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.link {
  color: #2563eb;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

#submit-btn {
  margin-top: 4px;
  border: none;
  border-radius: 10px;
  padding: 11px 12px;
  font-size: 16px;
  color: #ffffff;
  background: #2563eb;
  cursor: pointer;
  transition: background 0.2s;
}

#submit-btn:hover:enabled {
  background: #1d4ed8;
}

#submit-btn:disabled {
  cursor: not-allowed;
  opacity: 0.8;
}

.message {
  min-height: 20px;
  margin: 2px 0 0;
  font-size: 14px;
}

.message.error {
  color: #dc2626;
}

.message.success {
  color: #16a34a;
}
</style>
