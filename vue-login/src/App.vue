<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { apiRequest } from './api'
import AuthPanel from './components/AuthPanel.vue'
import DashboardShell from './components/DashboardShell.vue'

const SESSION_KEY = 'vue-login-session-token'

const token = ref(localStorage.getItem(SESSION_KEY) || '')
const user = ref(null)
const stats = ref({
  onlineUsers: 0,
  totalViews: 0,
  totalUsers: 0,
  todayLogins: 0,
})
const pages = ref([])
const activePage = ref('home')
const booting = ref(Boolean(token.value))
const globalMessage = ref('')
let heartbeatTimer = null

const isAuthenticated = computed(() => Boolean(token.value && user.value))

const loadBootstrap = async () => {
  if (!token.value) return
  booting.value = true

  try {
    const data = await apiRequest('/api/bootstrap', { token: token.value })
    user.value = data.user
    stats.value = data.stats
    pages.value = data.pages
    globalMessage.value = ''
  } catch (error) {
    token.value = ''
    user.value = null
    pages.value = []
    localStorage.removeItem(SESSION_KEY)
    globalMessage.value = error.message
  } finally {
    booting.value = false
  }
}

const trackView = async (pageKey) => {
  if (!token.value || !pageKey) return
  try {
    const data = await apiRequest('/api/views', {
      method: 'POST',
      token: token.value,
      body: { pageKey },
    })
    stats.value = data.stats
  } catch (error) {
    globalMessage.value = error.message
  }
}

const startHeartbeat = () => {
  if (heartbeatTimer || !token.value) return
  heartbeatTimer = window.setInterval(async () => {
    try {
      await apiRequest('/api/session/heartbeat', {
        method: 'POST',
        token: token.value,
      })
    } catch (error) {
      globalMessage.value = error.message
    }
  }, 60000)
}

const stopHeartbeat = () => {
  if (!heartbeatTimer) return
  window.clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

const applyAuth = async (payload) => {
  token.value = payload.token
  user.value = payload.user
  localStorage.setItem(SESSION_KEY, payload.token)
  await loadBootstrap()
  startHeartbeat()
  activePage.value = 'home'
  await trackView('home')
}

const handleLogout = async () => {
  if (token.value) {
    try {
      await apiRequest('/api/logout', {
        method: 'POST',
        body: { token: token.value },
      })
    } catch {
      // ignore
    }
  }

  stopHeartbeat()
  token.value = ''
  user.value = null
  pages.value = []
  activePage.value = 'home'
  localStorage.removeItem(SESSION_KEY)
}

const handleProfileSaved = async (form) => {
  const data = await apiRequest('/api/profile', {
    method: 'PUT',
    token: token.value,
    body: form,
  })
  user.value = data.user
  globalMessage.value = data.message
}

const handleUploadAvatar = async (file) => {
  const formData = new FormData()
  formData.append('avatar', file)

  const response = await fetch('/api/upload-avatar', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.value}`,
    },
    body: formData,
  })

  const data = await response.json()

  if (!response.ok || data.ok === false) {
    throw new Error(data.message || '头像上传失败。')
  }

  user.value = data.user
  globalMessage.value = data.message
}

const handleCreatePage = async (form) => {
  const data = await apiRequest('/api/pages', {
    method: 'POST',
    token: token.value,
    body: form,
  })
  pages.value = [...pages.value, data.page]
  activePage.value = data.page.slug
  globalMessage.value = data.message
  await trackView(data.page.slug)
}

const handleUpdatePage = async (form) => {
  const data = await apiRequest(`/api/pages/${form.id}`, {
    method: 'PUT',
    token: token.value,
    body: form,
  })
  pages.value = pages.value.map((page) => (page.id === form.id ? data.page : page))
  activePage.value = data.page.slug
  globalMessage.value = data.message
}

const handleDeletePage = async (id) => {
  const target = pages.value.find((page) => page.id === id)
  const data = await apiRequest(`/api/pages/${id}`, {
    method: 'DELETE',
    token: token.value,
  })
  pages.value = pages.value.filter((page) => page.id !== id)
  if (target && activePage.value === target.slug) {
    activePage.value = 'home'
  }
  globalMessage.value = data.message
}

const handleMovePage = async ({ id, direction }) => {
  const index = pages.value.findIndex((page) => page.id === id)
  const targetIndex = index + direction

  if (index < 0 || targetIndex < 0 || targetIndex >= pages.value.length) {
    return
  }

  const reordered = [...pages.value]
  ;[reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]]

  const payload = reordered.map((page, orderIndex) => ({
    id: page.id,
    sortOrder: orderIndex + 1,
  }))

  const data = await apiRequest('/api/pages/reorder', {
    method: 'PUT',
    token: token.value,
    body: { pages: payload },
  })

  pages.value = data.pages
  globalMessage.value = data.message
}

watch(activePage, async (pageKey, previous) => {
  if (!isAuthenticated.value || !pageKey || pageKey === previous) return
  await trackView(pageKey)
})

onMounted(async () => {
  if (!token.value) return
  await loadBootstrap()
  if (user.value) {
    startHeartbeat()
    await trackView(activePage.value)
  }
})

onBeforeUnmount(() => {
  stopHeartbeat()
})
</script>

<template>
  <main class="app-shell">
    <div v-if="booting" class="loading-state">正在恢复登录状态...</div>

    <AuthPanel v-else-if="!isAuthenticated" :global-message="globalMessage" @authenticated="applyAuth" />

    <DashboardShell
      v-else
      :active-page="activePage"
      :global-message="globalMessage"
      :pages="pages"
      :stats="stats"
      :user="user"
      @create-page="handleCreatePage"
      @delete-page="handleDeletePage"
      @logout="handleLogout"
      @move-page="handleMovePage"
      @navigate="activePage = $event"
      @save-profile="handleProfileSaved"
      @upload-avatar="handleUploadAvatar"
      @update-page="handleUpdatePage"
    />
  </main>
</template>
