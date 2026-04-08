<script setup>
import { computed, reactive, watch } from 'vue'
import ReaderWorkspace from './ReaderWorkspace.vue'

const props = defineProps({
  user: { type: Object, required: true },
  token: { type: String, required: true },
  stats: { type: Object, required: true },
  pages: { type: Array, required: true },
  activePage: { type: String, required: true },
  globalMessage: { type: String, default: '' },
  studyProfile: { type: Object, required: true },
  todayTasks: { type: Array, required: true },
  learningStats: { type: Object, required: true },
})

const emit = defineEmits([
  'navigate',
  'save-profile',
  'upload-avatar',
  'save-study-profile',
  'refresh-tasks',
  'toggle-task',
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

const studyForm = reactive({
  spanishLevel: 'A1',
  examTarget: '',
  examDate: '',
  targetSchool: '',
  dailyStudyMinutes: 120,
  focusNotes: '',
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

watch(
  () => props.studyProfile,
  (value) => {
    if (!value) return
    studyForm.spanishLevel = value.spanishLevel
    studyForm.examTarget = value.examTarget
    studyForm.examDate = value.examDate
    studyForm.targetSchool = value.targetSchool
    studyForm.dailyStudyMinutes = value.dailyStudyMinutes
    studyForm.focusNotes = value.focusNotes
  },
  { immediate: true, deep: true },
)

const navItems = computed(() => [
  { key: 'home', label: '学习工作台', icon: 'WK' },
  { key: 'reader', label: '沉浸阅读', icon: 'RD' },
  { key: 'exam', label: '考研规划', icon: 'EX' },
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
  {
    label: '今日任务完成',
    value: `${props.learningStats.completedTasks}/${props.learningStats.totalTasks}`,
    accent: 'cyan',
    note: '工作台会把阅读和考研任务整合在同一条日程里。',
  },
  {
    label: '今日完成时长',
    value: `${props.learningStats.completedMinutes} 分钟`,
    accent: 'green',
    note: '完成任务后自动累计学习时长。',
  },
  {
    label: '近 7 日学习时长',
    value: `${props.learningStats.weeklyMinutes} 分钟`,
    accent: 'gold',
    note: '方便观察最近一周是否保持稳定投入。',
  },
  {
    label: '考研倒计时',
    value: props.learningStats.examCountdown ?? '--',
    accent: 'orange',
    note: props.learningStats.examCountdown == null ? '设置考试日期后开始显示。' : '距离目标考试的剩余天数。',
  },
])

const productStats = computed(() => [
  { label: '当前在线用户', value: props.stats.onlineUsers },
  { label: '累计页面浏览', value: props.stats.totalViews },
  { label: '注册用户数', value: props.stats.totalUsers },
  { label: '今日登录次数', value: props.stats.todayLogins },
])

const taskCompletionRate = computed(() => {
  if (!props.learningStats.totalTasks) return 0
  return Math.round((props.learningStats.completedTasks / props.learningStats.totalTasks) * 100)
})

const suggestions = computed(() => [
  `优先保证每天至少 ${props.studyProfile.dailyStudyMinutes} 分钟的稳定学习时段。`,
  '把沉浸阅读放到主流程里，先读一页，再查词，再记录句子，最后再复盘。',
  props.studyProfile.examTarget
    ? `当前考研目标聚焦在 ${props.studyProfile.examTarget}，建议把阅读能力和真题复盘绑定起来。`
    : '还没有设置考研目标，建议先补全目标科目和院校，让任务更准确。',
  props.studyProfile.focusNotes || '把今天阅读中遇到的难点和考研错题一起记到学习札记里。',
])

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

const saveStudyProfile = () => {
  emit('save-study-profile', {
    ...studyForm,
    dailyStudyMinutes: Number(studyForm.dailyStudyMinutes || 120),
  })
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
        <div class="brand-mark">ZX</div>
        <div>
          <h1>智学助手</h1>
          <p>以沉浸阅读为核心，串起语言学习与考研复习。</p>
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
        <input v-model="pageForm.title" placeholder="例如：错题本" type="text" />
        <input v-model="pageForm.iconLabel" maxlength="4" placeholder="图标字母，例如 WR" type="text" />
        <textarea v-model="pageForm.description" placeholder="页面用途说明" rows="2"></textarea>
        <textarea v-model="pageForm.content" placeholder="页面初始内容" rows="4"></textarea>
        <button type="submit">添加到左侧导航</button>
      </form>

      <button class="logout-button" type="button" @click="emit('logout')">退出登录</button>
    </aside>

    <div class="content">
      <header class="topbar">
        <div>
          <p class="welcome">今日学习</p>
          <h2>{{ user.displayName }}</h2>
        </div>

        <div class="topbar-user">
          <img :src="user.avatarUrl" alt="用户头像" />
          <div>
            <strong>{{ user.username }}</strong>
            <span>{{ studyProfile.spanishLevel }} · {{ studyProfile.examTarget || '未设置考研目标' }}</span>
          </div>
        </div>
      </header>

      <p v-if="globalMessage" class="global-message">{{ globalMessage }}</p>

      <section v-if="activePage === 'home'" class="panel-stack">
        <div class="hero-banner">
          <div>
            <p class="banner-tag">Workspace</p>
            <h3>把阅读放在主流程里，今天先推进一页。</h3>
            <p>工作台会把沉浸阅读、生词整理和考研复盘串成一条路径，先阅读，再记录，再回到任务和复盘里。</p>
          </div>
          <div class="hero-side">
            <strong>{{ taskCompletionRate }}%</strong>
            <span>今日任务完成率</span>
          </div>
        </div>

        <div class="stats-grid">
          <article v-for="card in dashboardCards" :key="card.label" class="stat-card" :data-accent="card.accent">
            <p>{{ card.label }}</p>
            <strong>{{ card.value }}</strong>
            <span>{{ card.note }}</span>
          </article>
        </div>

        <div class="workspace-grid">
          <section class="card">
            <div class="section-head">
              <h3>今日任务</h3>
              <button class="secondary-button" type="button" @click="emit('refresh-tasks')">重新生成</button>
            </div>
            <ul class="task-list">
              <li v-for="task in todayTasks" :key="task.id" :class="{ done: task.status === 'done' }">
                <button class="check-button" type="button" @click="emit('toggle-task', task.id)">
                  {{ task.status === 'done' ? '已完成' : '待完成' }}
                </button>
                <div>
                  <strong>{{ task.title }}</strong>
                  <p>{{ task.description }}</p>
                  <span>{{ task.track === 'exam' ? '考研学习' : '阅读学习' }} · {{ task.estimatedMinutes }} 分钟</span>
                </div>
              </li>
              <li v-if="!todayTasks.length" class="empty">还没有生成任务，先去完善学习档案。</li>
            </ul>
          </section>

          <section class="card">
            <div class="section-head">
              <h3>学习建议</h3>
              <span>围绕你的当前目标自动生成</span>
            </div>
            <ul class="suggestion-list">
              <li v-for="item in suggestions" :key="item">{{ item }}</li>
            </ul>

            <div class="mini-stats">
              <article v-for="stat in productStats" :key="stat.label">
                <strong>{{ stat.value }}</strong>
                <span>{{ stat.label }}</span>
              </article>
            </div>
          </section>
        </div>
      </section>

      <section v-else-if="activePage === 'reader'" class="panel-stack">
        <ReaderWorkspace :token="token" :user-id="user.id" />
      </section>

      <section v-else-if="activePage === 'exam'" class="panel-stack">
        <div class="two-col">
          <form class="card study-form" @submit.prevent="saveStudyProfile">
            <div class="section-head">
              <h3>学习与考研档案</h3>
              <span>系统会据此生成每天的阅读与复习任务</span>
            </div>

            <div class="form-grid">
              <label class="field">
                <span>语言等级</span>
                <select v-model="studyForm.spanishLevel">
                  <option>A1</option>
                  <option>A2</option>
                  <option>B1</option>
                  <option>B2</option>
                </select>
              </label>

              <label class="field">
                <span>考研目标</span>
                <input v-model="studyForm.examTarget" type="text" placeholder="例如：考研英语一 / 教育学综合" />
              </label>

              <label class="field">
                <span>目标院校</span>
                <input v-model="studyForm.targetSchool" type="text" placeholder="例如：中山大学" />
              </label>

              <label class="field">
                <span>考试日期</span>
                <input v-model="studyForm.examDate" type="date" />
              </label>

              <label class="field">
                <span>每日学习时长</span>
                <input v-model="studyForm.dailyStudyMinutes" min="30" step="10" type="number" />
              </label>

              <label class="field wide">
                <span>当前重点 / 薄弱项</span>
                <textarea
                  v-model="studyForm.focusNotes"
                  rows="5"
                  placeholder="例如：阅读速度慢；西语动词变位不稳定；政治选择题错误率高。"
                ></textarea>
              </label>
            </div>

            <button class="primary-button" type="submit">保存学习档案</button>
          </form>

          <section class="card">
            <div class="section-head">
              <h3>规划摘要</h3>
              <span>让系统告诉你下一步学什么</span>
            </div>

            <ul class="suggestion-list">
              <li>当前设定的每日学习时长为 {{ studyProfile.dailyStudyMinutes }} 分钟。</li>
              <li v-if="learningStats.examCountdown != null">距离考试还有 {{ learningStats.examCountdown }} 天。</li>
              <li v-else>还没有设置考试日期，建议先设定倒计时目标。</li>
              <li>本周累计学习 {{ learningStats.weeklyMinutes }} 分钟，连续活跃 {{ learningStats.streakDays }} 天。</li>
              <li>建议把“沉浸阅读 + 重点摘录 + 真题复盘”作为固定三段式节奏。</li>
            </ul>
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

        <form class="card study-form" @submit.prevent="saveProfile">
          <div class="form-grid">
            <label class="field">
              <span>账号</span>
              <input v-model="profileForm.username" type="text" />
            </label>

            <label class="field">
              <span>昵称</span>
              <input v-model="profileForm.displayName" type="text" />
            </label>

            <label class="field wide">
              <span>头像地址</span>
              <input v-model="profileForm.avatarUrl" type="text" />
            </label>

            <label class="field wide">
              <span>上传头像文件</span>
              <input accept="image/*" type="file" @change="handleAvatarUpload" />
            </label>

            <label class="field wide">
              <span>个人简介</span>
              <textarea v-model="profileForm.bio" rows="4"></textarea>
            </label>

            <label class="field">
              <span>当前密码</span>
              <input v-model="profileForm.currentPassword" type="password" />
            </label>

            <label class="field">
              <span>新密码</span>
              <input v-model="profileForm.nextPassword" type="password" />
            </label>
          </div>

          <button class="primary-button" type="submit">保存个人信息</button>
        </form>
      </section>

      <section v-else-if="selectedFeaturePage" class="panel-stack feature-layout">
        <article class="card feature-page">
          <div class="feature-head">
            <div class="feature-icon">{{ selectedFeaturePage.icon_label || 'FX' }}</div>
            <div>
              <p class="banner-tag">自定义页面</p>
              <h3>{{ selectedFeaturePage.title }}</h3>
              <span>{{ selectedFeaturePage.description || '这是一个自定义功能页。' }}</span>
            </div>
          </div>

          <div class="feature-body">
            <p>{{ selectedFeaturePage.content || '这个页面内容还没有填写。' }}</p>
          </div>
        </article>

        <form class="card study-form" @submit.prevent="updatePage">
          <div class="section-head">
            <h3>编辑当前页面</h3>
            <span>可以扩展错题本、词汇本、周计划等模块</span>
          </div>

          <div class="form-grid">
            <label class="field">
              <span>标题</span>
              <input v-model="editorForm.title" type="text" />
            </label>

            <label class="field">
              <span>图标字母</span>
              <input v-model="editorForm.iconLabel" maxlength="4" type="text" />
            </label>

            <label class="field wide">
              <span>描述</span>
              <textarea v-model="editorForm.description" rows="3"></textarea>
            </label>

            <label class="field wide">
              <span>正文</span>
              <textarea v-model="editorForm.content" rows="6"></textarea>
            </label>
          </div>

          <div class="action-row">
            <button class="primary-button" type="submit">保存页面</button>
            <button
              class="secondary-button"
              :disabled="selectedIndex <= 0"
              type="button"
              @click="emit('move-page', { id: editorForm.id, direction: -1 })"
            >
              上移
            </button>
            <button
              class="secondary-button"
              :disabled="selectedIndex < 0 || selectedIndex >= pages.length - 1"
              type="button"
              @click="emit('move-page', { id: editorForm.id, direction: 1 })"
            >
              下移
            </button>
            <button class="danger-button" type="button" @click="deletePage">删除页面</button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>

<style scoped>
.dashboard {
  width: min(1480px, 100%);
  min-height: calc(100vh - 48px);
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 24px;
}

.sidebar,
.content {
  border-radius: 30px;
  backdrop-filter: blur(18px);
}

.sidebar {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 22px;
  padding: 24px;
  background:
    linear-gradient(180deg, rgba(12, 31, 61, 0.97), rgba(20, 46, 88, 0.94)),
    radial-gradient(circle at top, rgba(14, 165, 233, 0.18), transparent 40%);
  color: #e2e8f0;
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
}

.brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.brand-mark {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #fff;
  font-weight: 800;
}

.brand h1,
.topbar h2,
.hero-banner h3,
.section-head h3,
.profile-card h3,
.feature-head h3 {
  margin: 0;
}

.brand p {
  margin: 6px 0 0;
  color: #94a3b8;
  font-size: 13px;
}

.nav-list {
  display: grid;
  gap: 10px;
}

.nav-list button {
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  border-radius: 18px;
  padding: 12px 14px;
  background: transparent;
  color: #cbd5e1;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.nav-list button.active {
  background: rgba(14, 165, 233, 0.18);
  color: #f8fafc;
}

.nav-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.12);
  font-size: 12px;
  font-weight: 700;
}

.page-builder {
  display: grid;
  gap: 10px;
  align-content: start;
}

.page-builder h2 {
  margin: 0;
  font-size: 16px;
}

.page-builder input,
.page-builder textarea,
.study-form input,
.study-form textarea,
.study-form select {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
}

.page-builder button,
.primary-button,
.secondary-button,
.logout-button,
.danger-button {
  border: none;
  border-radius: 16px;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.page-builder button,
.primary-button {
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #fff;
}

.secondary-button {
  background: #e2e8f0;
  color: #0f172a;
}

.secondary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.logout-button {
  background: rgba(244, 63, 94, 0.12);
  color: #fecdd3;
}

.danger-button {
  background: #fee2e2;
  color: #b91c1c;
}

.content {
  padding: 24px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.14);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.welcome,
.banner-tag {
  margin: 0 0 8px;
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.topbar-user {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-radius: 20px;
  background: rgba(241, 245, 249, 0.92);
}

.topbar-user img,
.profile-card img {
  object-fit: cover;
  border-radius: 50%;
}

.topbar-user img {
  width: 50px;
  height: 50px;
}

.topbar-user strong,
.topbar-user span {
  display: block;
}

.topbar-user span {
  color: #64748b;
  font-size: 13px;
}

.global-message {
  margin: 0 0 18px;
  border-radius: 16px;
  padding: 12px 14px;
  background: #eff6ff;
  color: #1d4ed8;
}

.panel-stack {
  display: grid;
  gap: 20px;
}

.hero-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 28px;
  border-radius: 28px;
  color: #f8fafc;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(14, 116, 144, 0.84)),
    radial-gradient(circle at top right, rgba(253, 224, 71, 0.22), transparent 32%);
}

.hero-banner p {
  max-width: 580px;
  margin: 0;
  color: rgba(248, 250, 252, 0.76);
  line-height: 1.7;
}

.hero-side {
  min-width: 120px;
  text-align: center;
}

.hero-side strong {
  display: block;
  font-size: 40px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat-card,
.card {
  padding: 22px;
  border-radius: 26px;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.9);
}

.stat-card p,
.stat-card span {
  margin: 0;
}

.stat-card strong {
  display: block;
  margin: 14px 0 10px;
  font-size: 28px;
}

.stat-card span {
  color: #64748b;
  line-height: 1.6;
}

.stat-card[data-accent='cyan'] strong {
  color: #0891b2;
}

.stat-card[data-accent='green'] strong {
  color: #16a34a;
}

.stat-card[data-accent='gold'] strong {
  color: #ca8a04;
}

.stat-card[data-accent='orange'] strong {
  color: #ea580c;
}

.workspace-grid,
.two-col,
.feature-layout,
.profile-page {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 18px;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.section-head span,
.feature-head span {
  color: #64748b;
  font-size: 14px;
}

.task-list,
.suggestion-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
}

.task-list li {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 14px;
  border-radius: 18px;
  padding: 14px;
  background: #f8fafc;
}

.task-list li.done {
  background: #ecfdf5;
}

.task-list strong,
.suggestion-list li {
  line-height: 1.6;
}

.task-list p {
  margin: 6px 0;
  color: #475569;
}

.task-list span {
  color: #64748b;
  font-size: 13px;
}

.check-button {
  border: none;
  border-radius: 14px;
  padding: 10px 12px;
  background: #0f172a;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.task-list li.done .check-button {
  background: #15803d;
}

.mini-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.mini-stats article {
  border-radius: 18px;
  padding: 14px;
  background: #f8fafc;
}

.mini-stats strong {
  display: block;
  font-size: 22px;
}

.mini-stats span {
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.study-form {
  color: #0f172a;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.field {
  display: grid;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
}

.field.wide {
  grid-column: 1 / -1;
}

.study-form input,
.study-form textarea,
.study-form select {
  background: #f8fafc;
  color: #0f172a;
}

.profile-card {
  display: grid;
  gap: 16px;
  padding: 24px;
  border-radius: 26px;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.9);
}

.profile-card img {
  width: 120px;
  height: 120px;
}

.profile-card p {
  margin: 8px 0 0;
  color: #64748b;
  line-height: 1.8;
}

.feature-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}

.feature-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: linear-gradient(135deg, #1d4ed8, #0f766e);
  color: #fff;
  font-weight: 800;
}

.feature-body {
  color: #334155;
  line-height: 1.9;
}

.action-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.empty {
  color: #64748b;
}

@media (max-width: 1260px) {
  .stats-grid,
  .workspace-grid,
  .two-col,
  .profile-page,
  .feature-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .dashboard {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .content,
  .sidebar {
    padding: 18px;
  }

  .topbar,
  .hero-banner {
    flex-direction: column;
    align-items: flex-start;
  }

  .stats-grid,
  .mini-stats,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .action-row {
    flex-direction: column;
  }
}
</style>
