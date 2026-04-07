<script setup>
import { computed, reactive, watch } from 'vue'

const props = defineProps({
  user: { type: Object, required: true },
  stats: { type: Object, required: true },
  pages: { type: Array, required: true },
  activePage: { type: String, required: true },
  globalMessage: { type: String, default: '' },
})

const emit = defineEmits([
  'navigate',
  'save-profile',
  'upload-avatar',
  'create-page',
  'update-page',
  'delete-page',
  'move-page',
  'logout',
])

const profileForm = reactive({
  username: '',
  displayName: '',
  avatarUrl: '',
  bio: '',
  currentPassword: '',
  nextPassword: '',
})

const pageForm = reactive({
  title: '',
  iconLabel: '',
  description: '',
  content: '',
})

const editorForm = reactive({
  id: null,
  title: '',
  iconLabel: '',
  description: '',
  content: '',
})

watch(
  () => props.user,
  (value) => {
    if (!value) return
    profileForm.username = value.username
    profileForm.displayName = value.displayName
    profileForm.avatarUrl = value.avatarUrl
    profileForm.bio = value.bio
    profileForm.currentPassword = ''
    profileForm.nextPassword = ''
  },
  { immediate: true },
)

const navItems = computed(() => [
  { key: 'home', label: '首页', icon: 'HM' },
  { key: 'profile', label: '个人中心', icon: 'ME' },
  ...props.pages.map((page) => ({
    key: page.slug,
    label: page.title,
    icon: page.icon_label || 'FX',
  })),
])

const selectedFeaturePage = computed(() => props.pages.find((page) => page.slug === props.activePage) || null)

const selectedIndex = computed(() =>
  props.pages.findIndex((page) => page.slug === props.activePage || page.id === editorForm.id),
)

watch(
  selectedFeaturePage,
  (page) => {
    if (!page) return
    editorForm.id = page.id
    editorForm.title = page.title
    editorForm.iconLabel = page.icon_label || ''
    editorForm.description = page.description || ''
    editorForm.content = page.content || ''
  },
  { immediate: true },
)

const dashboardCards = computed(() => [
  { label: '网站实时登录人数', value: props.stats.onlineUsers, accent: 'cyan', note: '最近 5 分钟仍保持在线的用户' },
  { label: '网站浏览次数', value: props.stats.totalViews, accent: 'green', note: '全站累计页面浏览记录' },
  { label: '网站用户数', value: props.stats.totalUsers, accent: 'gold', note: '已注册用户总量' },
  { label: '今日登录次数', value: props.stats.todayLogins, accent: 'orange', note: '今天产生的登录会话数' },
])

const localizedTrend = computed(() => {
  const base = [
    props.stats.onlineUsers,
    Math.max(1, Math.round(props.stats.onlineUsers * 1.4)),
    Math.max(1, Math.round(props.stats.totalUsers * 0.65)),
    Math.max(1, Math.round(props.stats.todayLogins * 1.2)),
    props.stats.totalViews,
    Math.max(1, Math.round(props.stats.totalViews * 0.82)),
  ]
  const max = Math.max(...base, 1)

  return base.map((value, index) => ({
    label: ['00时', '04时', '08时', '12时', '18时', '22时'][index],
    value,
    height: `${Math.max(18, Math.round((value / max) * 100))}%`,
  }))
})

const bars = computed(() => {
  const max = Math.max(
    props.stats.onlineUsers || 1,
    props.stats.totalViews || 1,
    props.stats.totalUsers || 1,
    props.stats.todayLogins || 1,
  )

  return dashboardCards.value.map((item) => ({
    ...item,
    width: `${Math.max(16, Math.round((item.value / max) * 100))}%`,
  }))
})

const saveProfile = () => {
  emit('save-profile', { ...profileForm })
  profileForm.currentPassword = ''
  profileForm.nextPassword = ''
}

const handleAvatarUpload = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  emit('upload-avatar', file)
  event.target.value = ''
}

const createPage = () => {
  if (!pageForm.title.trim()) return
  emit('create-page', {
    ...pageForm,
    title: pageForm.title.trim(),
    slug: pageForm.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  })
  pageForm.title = ''
  pageForm.iconLabel = ''
  pageForm.description = ''
  pageForm.content = ''
}

const updatePage = () => {
  if (!editorForm.id || !editorForm.title.trim()) return
  emit('update-page', {
    id: editorForm.id,
    title: editorForm.title.trim(),
    iconLabel: editorForm.iconLabel,
    description: editorForm.description,
    content: editorForm.content,
    slug: editorForm.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  })
}

const deletePage = () => {
  if (!editorForm.id) return
  emit('delete-page', editorForm.id)
}
</script>

<template>
  <section class="dashboard">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">BI</div>
        <div>
          <h1>后台总控台</h1>
          <p>登录、注册、个人中心、功能页都在这里</p>
        </div>
      </div>

      <nav class="nav-list">
        <button
          v-for="item in navItems"
          :key="item.key"
          :class="{ active: item.key === activePage }"
          type="button"
          @click="emit('navigate', item.key)"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <form class="page-builder" @submit.prevent="createPage">
        <h2>新增功能页</h2>
        <input v-model="pageForm.title" placeholder="功能页标题" type="text" />
        <input v-model="pageForm.iconLabel" maxlength="4" placeholder="图标字母，如 AI" type="text" />
        <textarea v-model="pageForm.description" placeholder="左侧说明" rows="2"></textarea>
        <textarea v-model="pageForm.content" placeholder="页面内容说明" rows="4"></textarea>
        <button type="submit">添加到左侧功能栏</button>
      </form>

      <button class="logout-button" type="button" @click="emit('logout')">退出登录</button>
    </aside>

    <div class="content">
      <header class="topbar">
        <div>
          <p class="welcome">欢迎回来</p>
          <h2>{{ user.displayName }}</h2>
        </div>

        <div class="topbar-user">
          <img :src="user.avatarUrl" alt="用户头像" />
          <div>
            <strong>{{ user.username }}</strong>
            <span>{{ activePage === 'home' ? '首页总览' : activePage === 'profile' ? '个人中心' : '功能页' }}</span>
          </div>
        </div>
      </header>

      <p v-if="globalMessage" class="global-message">{{ globalMessage }}</p>

      <section v-if="activePage === 'home'" class="panel-stack">
        <div class="hero-banner">
          <div>
            <p class="banner-tag">Data Screen</p>
            <h3>网站实时运营大屏</h3>
            <p>首页集中展示站点核心实时数据，并用更接近中文后台的柱状图和趋势图做总览。</p>
          </div>
          <div class="hero-avatar">
            <img :src="user.avatarUrl" alt="用户头像" />
          </div>
        </div>

        <div class="stats-grid">
          <article v-for="card in dashboardCards" :key="card.label" class="stat-card" :data-accent="card.accent">
            <p>{{ card.label }}</p>
            <strong>{{ card.value }}</strong>
            <span>{{ card.note }}</span>
          </article>
        </div>

        <div class="analytics-grid">
          <section class="chart-panel">
            <div class="panel-header">
              <h3>站点核心指标对比</h3>
              <span>根据当前数据库实时计算</span>
            </div>

            <div class="bar-list">
              <article v-for="item in bars" :key="item.label" class="bar-item">
                <header>
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </header>
                <div class="bar-track">
                  <div class="bar-fill" :style="{ width: item.width }"></div>
                </div>
              </article>
            </div>
          </section>

          <section class="summary-panel">
            <div class="panel-header">
              <h3>站点实时趋势</h3>
              <span>示意展示全天分时波动</span>
            </div>

            <div class="trend-bars">
              <div v-for="item in localizedTrend" :key="item.label" class="trend-item">
                <div class="trend-column">
                  <div class="trend-fill" :style="{ height: item.height }"></div>
                </div>
                <strong>{{ item.value }}</strong>
                <span>{{ item.label }}</span>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section v-else-if="activePage === 'profile'" class="panel-stack profile-page">
        <div class="profile-card">
          <img :src="profileForm.avatarUrl || user.avatarUrl" alt="用户头像" />
          <div>
            <h3>{{ profileForm.displayName || profileForm.username }}</h3>
            <p>{{ profileForm.bio || '写一句个人介绍，让这个页面更完整。' }}</p>
          </div>
        </div>

        <form class="profile-form" @submit.prevent="saveProfile">
          <div class="form-grid">
            <label>
              <span>账号</span>
              <input v-model="profileForm.username" type="text" />
            </label>

            <label>
              <span>昵称</span>
              <input v-model="profileForm.displayName" type="text" />
            </label>

            <label class="wide">
              <span>头像地址</span>
              <input v-model="profileForm.avatarUrl" type="text" />
            </label>

            <label class="wide">
              <span>上传头像文件</span>
              <input accept="image/*" type="file" @change="handleAvatarUpload" />
            </label>

            <label class="wide">
              <span>个人介绍</span>
              <textarea v-model="profileForm.bio" rows="4"></textarea>
            </label>

            <label>
              <span>当前密码</span>
              <input v-model="profileForm.currentPassword" type="password" />
            </label>

            <label>
              <span>新密码</span>
              <input v-model="profileForm.nextPassword" type="password" />
            </label>
          </div>

          <button class="primary-button" type="submit">保存个人信息</button>
        </form>
      </section>

      <section v-else-if="selectedFeaturePage" class="panel-stack feature-layout">
        <article class="feature-page">
          <div class="feature-head">
            <div class="feature-icon">{{ selectedFeaturePage.icon_label || 'FX' }}</div>
            <div>
              <p class="banner-tag">功能页</p>
              <h3>{{ selectedFeaturePage.title }}</h3>
              <span>{{ selectedFeaturePage.description || '这是一个自定义功能页。' }}</span>
            </div>
          </div>

          <div class="feature-body">
            <p>{{ selectedFeaturePage.content || '这个页面内容还没有填写。' }}</p>
          </div>
        </article>

        <form class="profile-form" @submit.prevent="updatePage">
          <div class="panel-header">
            <h3>编辑当前功能页</h3>
            <span>可以直接修改标题、说明和内容</span>
          </div>

          <div class="form-grid">
            <label>
              <span>标题</span>
              <input v-model="editorForm.title" type="text" />
            </label>

            <label>
              <span>图标字母</span>
              <input v-model="editorForm.iconLabel" maxlength="4" type="text" />
            </label>

            <label class="wide">
              <span>描述</span>
              <textarea v-model="editorForm.description" rows="3"></textarea>
            </label>

            <label class="wide">
              <span>正文</span>
              <textarea v-model="editorForm.content" rows="6"></textarea>
            </label>
          </div>

          <div class="action-row">
            <button class="primary-button" type="submit">保存功能页</button>
            <button class="secondary-button" :disabled="selectedIndex <= 0" type="button" @click="emit('move-page', { id: editorForm.id, direction: -1 })">上移</button>
            <button class="secondary-button" :disabled="selectedIndex < 0 || selectedIndex >= pages.length - 1" type="button" @click="emit('move-page', { id: editorForm.id, direction: 1 })">下移</button>
            <button class="danger-button" type="button" @click="deletePage">删除功能页</button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>

<style scoped>
.dashboard { width: min(1400px, 100%); min-height: calc(100vh - 48px); display: grid; grid-template-columns: 310px minmax(0, 1fr); gap: 24px; }
.sidebar, .content { border-radius: 30px; backdrop-filter: blur(18px); }
.sidebar { display: grid; grid-template-rows: auto auto 1fr auto; gap: 22px; padding: 24px; background: linear-gradient(180deg, rgba(15,23,42,.96), rgba(30,41,59,.93)); color: #e2e8f0; box-shadow: 0 28px 80px rgba(15,23,42,.28); }
.brand { display: flex; align-items: center; gap: 16px; }
.brand-mark { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 18px; background: linear-gradient(135deg, #06b6d4, #22c55e); color: #fff; font-weight: 800; }
.brand h1, .topbar h2, .hero-banner h3, .panel-header h3, .profile-card h3, .feature-head h3 { margin: 0; }
.brand p { margin: 6px 0 0; color: #94a3b8; font-size: 13px; }
.nav-list { display: grid; gap: 10px; }
.nav-list button { display: flex; align-items: center; gap: 12px; border: none; border-radius: 18px; padding: 12px 14px; background: transparent; color: #cbd5e1; font-size: 15px; text-align: left; cursor: pointer; }
.nav-list button.active { background: rgba(14,165,233,.18); color: #f8fafc; }
.nav-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 12px; background: rgba(148,163,184,.12); font-size: 12px; font-weight: 700; }
.page-builder { display: grid; gap: 10px; align-content: start; }
.page-builder h2 { margin: 0; font-size: 16px; }
.page-builder input, .page-builder textarea, .profile-form input, .profile-form textarea { width: 100%; border: 1px solid rgba(148,163,184,.24); border-radius: 16px; padding: 12px 14px; background: rgba(255,255,255,.08); color: inherit; font: inherit; }
.page-builder button, .primary-button, .secondary-button, .logout-button, .danger-button { border: none; border-radius: 16px; padding: 12px 14px; font-size: 14px; font-weight: 700; cursor: pointer; }
.page-builder button, .primary-button { background: linear-gradient(135deg, #22c55e, #06b6d4); color: #fff; }
.secondary-button { background: #e2e8f0; color: #0f172a; }
.secondary-button:disabled { opacity: .5; cursor: not-allowed; }
.logout-button { background: rgba(244,63,94,.12); color: #fecdd3; }
.danger-button { background: #fee2e2; color: #b91c1c; }
.content { padding: 24px; background: rgba(255,255,255,.84); box-shadow: 0 28px 80px rgba(15,23,42,.14); }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
.welcome, .banner-tag { margin: 0 0 8px; color: #0f766e; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.topbar-user { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 20px; background: rgba(241,245,249,.92); }
.topbar-user img, .profile-card img, .hero-avatar img { object-fit: cover; border-radius: 50%; }
.topbar-user img { width: 50px; height: 50px; }
.topbar-user strong, .topbar-user span { display: block; }
.topbar-user span { color: #64748b; font-size: 13px; }
.global-message { margin: 0 0 18px; border-radius: 16px; padding: 12px 14px; background: #eff6ff; color: #1d4ed8; }
.panel-stack { display: grid; gap: 20px; }
.hero-banner { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 26px; border-radius: 28px; color: #f8fafc; background: linear-gradient(135deg, rgba(15,23,42,.95), rgba(8,145,178,.84)); }
.hero-banner p { max-width: 560px; margin: 0; color: rgba(248,250,252,.76); line-height: 1.7; }
.hero-avatar img { width: 92px; height: 92px; border: 3px solid rgba(255,255,255,.28); }
.stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px; }
.stat-card { padding: 20px; border-radius: 24px; background: #fff; box-shadow: inset 0 0 0 1px rgba(226,232,240,.9); }
.stat-card p, .stat-card span { margin: 0; }
.stat-card strong { display: block; margin: 14px 0 10px; font-size: 34px; }
.stat-card span { color: #64748b; line-height: 1.6; }
.stat-card[data-accent='cyan'] strong { color: #0891b2; }
.stat-card[data-accent='green'] strong { color: #16a34a; }
.stat-card[data-accent='gold'] strong { color: #ca8a04; }
.stat-card[data-accent='orange'] strong { color: #ea580c; }
.analytics-grid, .feature-layout { display: grid; grid-template-columns: 1.3fr 0.9fr; gap: 18px; }
.chart-panel, .summary-panel, .profile-card, .profile-form, .feature-page { padding: 24px; border-radius: 26px; background: #fff; box-shadow: inset 0 0 0 1px rgba(226,232,240,.9); }
.panel-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.panel-header span, .feature-head span { color: #64748b; font-size: 14px; }
.bar-list { display: grid; gap: 16px; }
.bar-item header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.bar-track { height: 12px; overflow: hidden; border-radius: 999px; background: #e2e8f0; }
.bar-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #0f766e, #06b6d4); }
.trend-bars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; align-items: end; min-height: 240px; }
.trend-item { display: grid; gap: 8px; justify-items: center; }
.trend-column { width: 100%; height: 160px; display: flex; align-items: end; border-radius: 16px; background: linear-gradient(180deg, #e2e8f0, #f8fafc); overflow: hidden; }
.trend-fill { width: 100%; border-radius: 16px 16px 0 0; background: linear-gradient(180deg, #0ea5e9, #0f766e); }
.trend-item strong { font-size: 14px; }
.trend-item span { color: #64748b; font-size: 12px; }
.profile-page { grid-template-columns: 320px minmax(0,1fr); align-items: start; }
.profile-card { display: grid; gap: 16px; }
.profile-card img { width: 120px; height: 120px; }
.profile-card p { margin: 8px 0 0; color: #64748b; line-height: 1.8; }
.profile-form { color: #0f172a; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; margin-bottom: 18px; }
.form-grid label { display: grid; gap: 8px; font-size: 14px; font-weight: 700; }
.form-grid .wide { grid-column: 1 / -1; }
.profile-form input, .profile-form textarea { background: #f8fafc; color: #0f172a; }
.feature-page { min-height: 320px; }
.feature-head { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
.feature-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 18px; background: linear-gradient(135deg, #1d4ed8, #0f766e); color: #fff; font-weight: 800; }
.feature-body { color: #334155; line-height: 1.9; }
.action-row { display: flex; gap: 12px; flex-wrap: wrap; }
@media (max-width: 1200px) { .stats-grid, .analytics-grid, .profile-page, .feature-layout { grid-template-columns: 1fr; } }
@media (max-width: 980px) { .dashboard { grid-template-columns: 1fr; } }
@media (max-width: 720px) { .content, .sidebar { padding: 18px; } .topbar, .hero-banner { flex-direction: column; align-items: flex-start; } .stats-grid, .trend-bars, .form-grid { grid-template-columns: 1fr; } .action-row { flex-direction: column; } }
</style>
