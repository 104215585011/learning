<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { apiRequest } from '../api'

const props = defineProps({
  token: { type: String, required: true },
  userId: { type: [Number, String], required: true },
})

const storageKey = computed(() => `reader-workspace-v3-${props.userId}`)
const vocabularyKey = computed(() => `reader-vocabulary-v3-${props.userId}`)
const sentenceKey = computed(() => `reader-sentences-v3-${props.userId}`)

const loading = ref(false)
const message = ref('')
const selectedWord = ref('')
const selectedSentence = ref('')
const translatingWord = ref(false)
const translatingSentence = ref(false)
const vocabularyBook = ref([])
const sentenceBook = ref([])
const translation = reactive({
  translatedText: '',
  phonetic: '',
  examples: [],
  synonyms: [],
  meanings: [],
  detectedSourceLanguage: 'auto',
  targetLanguage: 'zh-CN',
})
const sentenceTranslation = reactive({
  translatedText: '',
  detectedSourceLanguage: 'auto',
  targetLanguage: 'zh-CN',
})
const workspace = reactive({
  documents: [],
  windows: [],
  activeWindowId: '',
  sourceLanguage: 'auto',
  targetLanguage: 'zh-CN',
})

const languageOptions = [
  { label: '自动识别', value: 'auto' },
  { label: '中文', value: 'zh-CN' },
  { label: '英语', value: 'en' },
  { label: '西班牙语', value: 'es' },
  { label: '法语', value: 'fr' },
  { label: '德语', value: 'de' },
  { label: '日语', value: 'ja' },
  { label: '韩语', value: 'ko' },
  { label: '俄语', value: 'ru' },
  { label: '葡萄牙语', value: 'pt' },
  { label: '意大利语', value: 'it' },
]

const paginationCache = new Map()

const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const formatSize = (size) => {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const loadLocalState = () => {
  try {
    const savedWorkspace = JSON.parse(localStorage.getItem(storageKey.value) || '{}')
    workspace.documents = Array.isArray(savedWorkspace.documents) ? savedWorkspace.documents : []
    workspace.windows = Array.isArray(savedWorkspace.windows) ? savedWorkspace.windows : []
    workspace.activeWindowId = savedWorkspace.activeWindowId || workspace.windows[0]?.id || ''
    workspace.sourceLanguage = savedWorkspace.sourceLanguage || 'auto'
    workspace.targetLanguage = savedWorkspace.targetLanguage || 'zh-CN'
  } catch {
    workspace.documents = []
    workspace.windows = []
    workspace.activeWindowId = ''
  }

  try {
    vocabularyBook.value = JSON.parse(localStorage.getItem(vocabularyKey.value) || '[]')
  } catch {
    vocabularyBook.value = []
  }

  try {
    sentenceBook.value = JSON.parse(localStorage.getItem(sentenceKey.value) || '[]')
  } catch {
    sentenceBook.value = []
  }

  if (!workspace.windows.length && workspace.documents.length) {
    workspace.windows = [
      {
        id: createId('window'),
        documentId: workspace.documents[0].id,
      },
    ]
    workspace.activeWindowId = workspace.windows[0].id
  }
}

const persistWorkspace = () => {
  localStorage.setItem(
    storageKey.value,
    JSON.stringify({
      documents: workspace.documents,
      windows: workspace.windows,
      activeWindowId: workspace.activeWindowId,
      sourceLanguage: workspace.sourceLanguage,
      targetLanguage: workspace.targetLanguage,
    }),
  )
}

const persistBooks = () => {
  localStorage.setItem(vocabularyKey.value, JSON.stringify(vocabularyBook.value))
  localStorage.setItem(sentenceKey.value, JSON.stringify(sentenceBook.value))
}

loadLocalState()

watch(
  () => [workspace.documents, workspace.windows, workspace.activeWindowId, workspace.sourceLanguage, workspace.targetLanguage],
  persistWorkspace,
  { deep: true },
)

watch([vocabularyBook, sentenceBook], persistBooks, { deep: true })

const ensureSegmenter = () => {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return new Intl.Segmenter(undefined, { granularity: 'word' })
  }
  return null
}

const segmenter = ensureSegmenter()

const splitParagraph = (paragraph) => {
  if (!paragraph) return []

  if (segmenter) {
    return Array.from(segmenter.segment(paragraph)).map((item) => ({
      text: item.segment,
      isWord: Boolean(item.isWordLike),
    }))
  }

  return paragraph
    .split(/(\s+|[^\p{L}\p{N}_'-]+)/u)
    .filter((item) => item.length > 0)
    .map((item) => ({
      text: item,
      isWord: /[\p{L}\p{N}]/u.test(item),
    }))
}

const paginateDocument = (document) => {
  if (!document?.text) return []

  const cacheKey = `${document.id}:${document.text.length}`
  if (paginationCache.has(cacheKey)) {
    return paginationCache.get(cacheKey)
  }

  const paragraphs = String(document.text)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)

  const pages = []
  let currentPage = []
  let currentLength = 0
  const pageLimit = 1200

  for (const paragraph of paragraphs) {
    const block = {
      text: paragraph,
      segments: splitParagraph(paragraph),
    }
    const paragraphLength = paragraph.length

    if (currentPage.length && currentLength + paragraphLength > pageLimit) {
      pages.push(currentPage)
      currentPage = []
      currentLength = 0
    }

    currentPage.push(block)
    currentLength += paragraphLength
  }

  if (currentPage.length) {
    pages.push(currentPage)
  }

  const finalPages = pages.length ? pages : [[{ text: document.text, segments: splitParagraph(document.text) }]]
  paginationCache.set(cacheKey, finalPages)
  return finalPages
}

const documentMap = computed(() => {
  const map = new Map()
  for (const document of workspace.documents) {
    map.set(document.id, document)
  }
  return map
})

const activeWindow = computed(() => workspace.windows.find((item) => item.id === workspace.activeWindowId) || null)

const windowViews = computed(() =>
  workspace.windows.map((windowItem) => {
    const document = documentMap.value.get(windowItem.documentId) || null
    const pages = paginateDocument(document)
    const pageCount = pages.length
    const pageIndex = Math.min(Math.max(Number(document?.lastPage || 0), 0), Math.max(pageCount - 1, 0))

    return {
      ...windowItem,
      document,
      pages,
      pageCount,
      pageIndex,
      currentPage: pages[pageIndex] || [],
    }
  }),
)

const hasDocuments = computed(() => workspace.documents.length > 0)

const openWindowForDocument = (documentId) => {
  if (!documentId) return
  const windowId = createId('window')
  workspace.windows.push({
    id: windowId,
    documentId,
  })
  workspace.activeWindowId = windowId
}

const addEmptyWindow = () => {
  if (!workspace.documents.length) return
  openWindowForDocument(workspace.documents[0].id)
}

const closeWindow = (windowId) => {
  workspace.windows = workspace.windows.filter((item) => item.id !== windowId)
  if (!workspace.windows.length && workspace.documents.length) {
    workspace.windows = [
      {
        id: createId('window'),
        documentId: workspace.documents[0].id,
      },
    ]
  }
  if (!workspace.windows.find((item) => item.id === workspace.activeWindowId)) {
    workspace.activeWindowId = workspace.windows[0]?.id || ''
  }
}

const updateWindowDocument = (windowId, documentId) => {
  const windowItem = workspace.windows.find((item) => item.id === windowId)
  if (!windowItem) return
  windowItem.documentId = documentId
  workspace.activeWindowId = windowId
}

const setDocumentPage = (documentId, nextPage) => {
  const document = workspace.documents.find((item) => item.id === documentId)
  if (!document) return
  const pageCount = paginateDocument(document).length
  document.lastPage = Math.min(Math.max(nextPage, 0), Math.max(pageCount - 1, 0))
}

const goToPage = (windowId, offset) => {
  const windowView = windowViews.value.find((item) => item.id === windowId)
  if (!windowView?.document) return
  setDocumentPage(windowView.document.id, windowView.pageIndex + offset)
  workspace.activeWindowId = windowId
}

const removeDocument = (documentId) => {
  workspace.documents = workspace.documents.filter((item) => item.id !== documentId)
  workspace.windows = workspace.windows.filter((item) => item.documentId !== documentId)
  if (!workspace.windows.length && workspace.documents.length) {
    workspace.windows = [
      {
        id: createId('window'),
        documentId: workspace.documents[0].id,
      },
    ]
  }
  workspace.activeWindowId = workspace.windows[0]?.id || ''
}

const activeDocument = computed(() => {
  if (!activeWindow.value) return null
  return documentMap.value.get(activeWindow.value.documentId) || null
})

const normalizedWord = (word) =>
  String(word || '')
    .trim()
    .toLocaleLowerCase()

const handleUpload = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  if (file.size > 100 * 1024 * 1024) {
    message.value = '文件大小不能超过 100MB。'
    event.target.value = ''
    return
  }

  const formData = new FormData()
  formData.append('document', file)
  loading.value = true
  message.value = ''

  try {
    const response = await fetch('/api/documents/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${props.token}`,
      },
      body: formData,
    })
    const data = await response.json()
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || '文件上传失败。')
    }

    const document = {
      id: createId('doc'),
      name: data.document.name,
      size: data.document.size,
      type: data.document.type,
      text: data.document.text,
      html: data.document.html || '',
      originalUrl: data.document.originalUrl || '',
      lastPage: 0,
      createdAt: new Date().toISOString(),
    }

    workspace.documents.unshift(document)
    openWindowForDocument(document.id)
    message.value = '文档解析成功，已加入阅读工作区。'
  } catch (error) {
    message.value = error.message
  } finally {
    loading.value = false
    event.target.value = ''
  }
}

const translateWord = async (word) => {
  selectedWord.value = word
  translation.translatedText = ''
  translation.phonetic = ''
  translation.examples = []
  translation.synonyms = []
  translation.meanings = []
  translatingWord.value = true

  try {
    const data = await apiRequest(
      `/api/translate?text=${encodeURIComponent(word)}&sourceLanguage=${encodeURIComponent(workspace.sourceLanguage)}&targetLanguage=${encodeURIComponent(workspace.targetLanguage)}`,
      { token: props.token },
    )

    translation.translatedText = data.translatedText || ''
    translation.phonetic = data.phonetic || ''
    translation.examples = Array.isArray(data.examples) ? data.examples : []
    translation.synonyms = Array.isArray(data.synonyms) ? data.synonyms : []
    translation.meanings = Array.isArray(data.meanings) ? data.meanings : []
    translation.detectedSourceLanguage = data.detectedSourceLanguage || workspace.sourceLanguage
    translation.targetLanguage = data.targetLanguage || workspace.targetLanguage
  } catch (error) {
    translation.translatedText = error.message
  } finally {
    translatingWord.value = false
  }
}

const translateSelectedSentence = async () => {
  const rawSelection = window.getSelection?.()?.toString() || ''
  const text = rawSelection.trim().replace(/\s+/g, ' ')
  if (!text) {
    sentenceTranslation.translatedText = '请先在阅读窗口中选中一句完整的话。'
    return
  }

  selectedSentence.value = text
  translatingSentence.value = true

  try {
    const data = await apiRequest(
      `/api/translate-sentence?text=${encodeURIComponent(text)}&sourceLanguage=${encodeURIComponent(workspace.sourceLanguage)}&targetLanguage=${encodeURIComponent(workspace.targetLanguage)}`,
      { token: props.token },
    )
    sentenceTranslation.translatedText = data.translatedText || ''
    sentenceTranslation.detectedSourceLanguage = data.detectedSourceLanguage || workspace.sourceLanguage
    sentenceTranslation.targetLanguage = data.targetLanguage || workspace.targetLanguage
  } catch (error) {
    sentenceTranslation.translatedText = error.message
  } finally {
    translatingSentence.value = false
  }
}

const addToVocabulary = () => {
  const key = normalizedWord(selectedWord.value)
  if (!key || !translation.translatedText) return
  const exists = vocabularyBook.value.some((item) => item.word === key)
  if (!exists) {
    vocabularyBook.value.unshift({
      word: key,
      translatedText: translation.translatedText,
      phonetic: translation.phonetic,
      sourceLanguage: translation.detectedSourceLanguage,
      targetLanguage: translation.targetLanguage,
      createdAt: new Date().toISOString(),
    })
  }
}

const addSentenceToBook = () => {
  if (!selectedSentence.value || !sentenceTranslation.translatedText) return
  const exists = sentenceBook.value.some((item) => item.text === selectedSentence.value)
  if (!exists) {
    sentenceBook.value.unshift({
      text: selectedSentence.value,
      translatedText: sentenceTranslation.translatedText,
      sourceLanguage: sentenceTranslation.detectedSourceLanguage,
      targetLanguage: sentenceTranslation.targetLanguage,
      createdAt: new Date().toISOString(),
    })
  }
}

const removeWord = (word) => {
  vocabularyBook.value = vocabularyBook.value.filter((item) => item.word !== word)
}

const removeSentence = (text) => {
  sentenceBook.value = sentenceBook.value.filter((item) => item.text !== text)
}

const onTokenClick = async (token, windowId) => {
  if (!token?.isWord || !token.text.trim()) return
  workspace.activeWindowId = windowId
  await translateWord(token.text.trim())
}
</script>

<template>
  <article class="reader">
    <header class="reader-head">
      <div>
        <p class="reader-tag">Immersive Reading</p>
        <h3>多文档分页阅读工作区</h3>
        <p>支持 PDF / Word / TXT / Markdown / RTF，多窗口同时阅读，并自动记住上次页码。</p>
      </div>
      <div class="head-actions">
        <label class="upload-btn">
          <input type="file" accept=".pdf,.doc,.docx,.txt,.md,.rtf" :disabled="loading" @change="handleUpload" />
          {{ loading ? '解析中...' : '上传文档' }}
        </label>
        <button class="ghost-btn" :disabled="!hasDocuments" type="button" @click="addEmptyWindow">新增阅读窗口</button>
      </div>
    </header>

    <p v-if="message" class="message">{{ message }}</p>

    <section class="settings-bar">
      <label class="setting">
        <span>源语言</span>
        <select v-model="workspace.sourceLanguage">
          <option v-for="item in languageOptions" :key="`source-${item.value}`" :value="item.value">{{ item.label }}</option>
        </select>
      </label>

      <label class="setting">
        <span>目标语言</span>
        <select v-model="workspace.targetLanguage">
          <option v-for="item in languageOptions.filter((entry) => entry.value !== 'auto')" :key="`target-${item.value}`" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>

      <p class="setting-tip">当系统无法准确判断语言时，可以直接在这里指定翻译方向。</p>
    </section>

    <section class="layout">
      <main class="reader-main">
        <div class="window-tabs">
          <button
            v-for="windowItem in windowViews"
            :key="windowItem.id"
            :class="{ active: workspace.activeWindowId === windowItem.id }"
            type="button"
            @click="workspace.activeWindowId = windowItem.id"
          >
            {{ windowItem.document?.name || '未选择文档' }}
          </button>
        </div>

        <div v-if="!windowViews.length" class="empty-shell">
          上传第一本书后，这里会生成阅读窗口。每本书都按页显示，并自动记录上次停留的位置。
        </div>

        <div v-else class="window-grid" :class="`count-${Math.min(windowViews.length, 3)}`">
          <section
            v-for="windowItem in windowViews"
            :key="windowItem.id"
            class="reader-window"
            :class="{ focused: workspace.activeWindowId === windowItem.id }"
            @click="workspace.activeWindowId = windowItem.id"
          >
            <header class="window-head">
              <label class="window-select">
                <span>当前文档</span>
                <select :value="windowItem.documentId" @change="updateWindowDocument(windowItem.id, $event.target.value)">
                  <option v-for="document in workspace.documents" :key="document.id" :value="document.id">{{ document.name }}</option>
                </select>
              </label>

              <button class="close-button" type="button" @click.stop="closeWindow(windowItem.id)">关闭</button>
            </header>

            <div v-if="windowItem.document" class="window-meta">
              <span>{{ windowItem.document.type.toUpperCase() }}</span>
              <span>{{ formatSize(windowItem.document.size) }}</span>
              <span>第 {{ windowItem.pageIndex + 1 }} / {{ windowItem.pageCount }} 页</span>
            </div>

            <article v-if="windowItem.document" class="page-card">
              <p v-for="(paragraph, paragraphIndex) in windowItem.currentPage" :key="`${windowItem.id}-${paragraphIndex}`" class="page-paragraph">
                <template v-for="(segment, segmentIndex) in paragraph.segments" :key="`${windowItem.id}-${paragraphIndex}-${segmentIndex}`">
                  <button
                    v-if="segment.isWord"
                    class="word-chip"
                    type="button"
                    @click.stop="onTokenClick(segment, windowItem.id)"
                  >
                    {{ segment.text }}
                  </button>
                  <span v-else>{{ segment.text }}</span>
                </template>
              </p>
            </article>

            <div v-else class="empty-page">请先在这个窗口选择一本书。</div>

            <footer v-if="windowItem.document" class="pager">
              <button :disabled="windowItem.pageIndex <= 0" type="button" @click.stop="goToPage(windowItem.id, -1)">上一页</button>
              <span>已记住到第 {{ windowItem.pageIndex + 1 }} 页</span>
              <button :disabled="windowItem.pageIndex >= windowItem.pageCount - 1" type="button" @click.stop="goToPage(windowItem.id, 1)">下一页</button>
            </footer>
          </section>
        </div>
      </main>

      <aside class="tool-panel">
        <section class="card">
          <div class="section-head">
            <h4>文档书架</h4>
            <span>{{ workspace.documents.length }} 本</span>
          </div>
          <ul class="library-list">
            <li v-for="document in workspace.documents" :key="document.id">
              <div>
                <strong>{{ document.name }}</strong>
                <p>{{ document.type.toUpperCase() }} · {{ formatSize(document.size) }}</p>
                <small>上次阅读到第 {{ (document.lastPage || 0) + 1 }} 页</small>
              </div>
              <div class="library-actions">
                <button type="button" @click="openWindowForDocument(document.id)">新窗口打开</button>
                <button class="danger" type="button" @click="removeDocument(document.id)">删除</button>
              </div>
            </li>
            <li v-if="!workspace.documents.length" class="empty">还没有导入文档。</li>
          </ul>
        </section>

        <section class="card">
          <div class="section-head">
            <h4>单词翻译</h4>
            <span>{{ translation.detectedSourceLanguage }} → {{ translation.targetLanguage }}</span>
          </div>
          <p class="current-word">{{ selectedWord || '点击任意阅读页里的完整词语开始翻译。' }}</p>
          <p class="translation-result">{{ translatingWord ? '翻译中...' : translation.translatedText || '暂无翻译结果。' }}</p>
          <p v-if="translation.phonetic" class="phonetic">{{ translation.phonetic }}</p>
          <div class="action-row">
            <button type="button" :disabled="!selectedWord || !translation.translatedText" @click="addToVocabulary">加入生词本</button>
          </div>
          <div v-if="translation.meanings.length" class="detail">
            <h5>释义</h5>
            <ul>
              <li v-for="(meaning, index) in translation.meanings" :key="`meaning-${index}`">
                <strong v-if="meaning.partOfSpeech">{{ meaning.partOfSpeech }}:</strong>
                {{ meaning.definition }}
              </li>
            </ul>
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <h4>句子翻译</h4>
            <span>{{ sentenceTranslation.detectedSourceLanguage }} → {{ sentenceTranslation.targetLanguage }}</span>
          </div>
          <p class="tip">在任意阅读页中选中一句完整的话后，点击下面的按钮进行翻译。</p>
          <p class="sentence-preview">{{ selectedSentence || '还没有选中句子。' }}</p>
          <p class="translation-result">{{ translatingSentence ? '翻译中...' : sentenceTranslation.translatedText || '暂无句子翻译。' }}</p>
          <div class="action-row">
            <button type="button" @click="translateSelectedSentence">翻译选中句子</button>
            <button type="button" :disabled="!selectedSentence || !sentenceTranslation.translatedText" @click="addSentenceToBook">
              收藏句子
            </button>
          </div>
        </section>

        <section class="card">
          <h4>生词本</h4>
          <ul class="book-list">
            <li v-for="item in vocabularyBook" :key="item.word">
              <div>
                <strong>{{ item.word }}</strong>
                <p>{{ item.translatedText }}</p>
              </div>
              <button class="danger" type="button" @click="removeWord(item.word)">删除</button>
            </li>
            <li v-if="!vocabularyBook.length" class="empty">还没有收藏词语。</li>
          </ul>
        </section>

        <section class="card">
          <h4>句子本</h4>
          <ul class="book-list">
            <li v-for="item in sentenceBook" :key="item.text">
              <div>
                <strong>{{ item.text }}</strong>
                <p>{{ item.translatedText }}</p>
              </div>
              <button class="danger" type="button" @click="removeSentence(item.text)">删除</button>
            </li>
            <li v-if="!sentenceBook.length" class="empty">还没有收藏句子。</li>
          </ul>
        </section>
      </aside>
    </section>
  </article>
</template>

<style scoped>
.reader {
  display: grid;
  gap: 18px;
}

.reader-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 22px;
  border-radius: 24px;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.9);
}

.reader-tag {
  margin: 0 0 6px;
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.reader-head h3 {
  margin: 0 0 8px;
}

.reader-head p {
  margin: 0;
  color: #64748b;
}

.head-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.upload-btn,
.ghost-btn,
.pager button,
.action-row button,
.library-actions button,
.close-button,
.word-chip {
  border: none;
  cursor: pointer;
}

.upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 14px;
  border-radius: 12px;
  background: #0f766e;
  color: #fff;
  font-weight: 700;
}

.upload-btn input {
  display: none;
}

.ghost-btn {
  border-radius: 12px;
  padding: 10px 14px;
  background: #e2e8f0;
  color: #0f172a;
}

.message {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px;
  background: #ecfeff;
  color: #0e7490;
}

.settings-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: end;
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.9);
}

.setting {
  display: grid;
  gap: 8px;
  min-width: 180px;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.setting select {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
  font: inherit;
}

.setting-tip {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 18px;
}

.reader-main,
.card {
  padding: 20px;
  border-radius: 24px;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.9);
}

.window-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.window-tabs button {
  border: none;
  border-radius: 999px;
  padding: 8px 14px;
  background: #e2e8f0;
  color: #334155;
  cursor: pointer;
}

.window-tabs button.active {
  background: #0f766e;
  color: #fff;
}

.window-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.window-grid.count-1 {
  grid-template-columns: 1fr;
}

.reader-window {
  border-radius: 22px;
  padding: 18px;
  background: #f8fafc;
  box-shadow: inset 0 0 0 1px rgba(203, 213, 225, 0.8);
}

.reader-window.focused {
  box-shadow: inset 0 0 0 2px rgba(15, 118, 110, 0.7);
}

.window-head,
.section-head,
.library-actions,
.pager,
.action-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.window-select {
  display: grid;
  gap: 6px;
  flex: 1;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.window-select select {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
  font: inherit;
}

.close-button {
  border-radius: 10px;
  padding: 8px 10px;
  background: #fee2e2;
  color: #b91c1c;
}

.window-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 14px 0;
}

.window-meta span {
  border-radius: 999px;
  padding: 4px 10px;
  background: #e2e8f0;
  color: #475569;
  font-size: 12px;
}

.page-card {
  min-height: 420px;
  padding: 20px;
  border-radius: 18px;
  background: #fff;
  color: #0f172a;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 18px;
  line-height: 2;
  overflow: auto;
}

.page-paragraph {
  margin: 0 0 1.2em;
  text-align: justify;
}

.word-chip {
  display: inline;
  border-radius: 8px;
  padding: 1px 2px;
  background: transparent;
  color: inherit;
  font: inherit;
}

.word-chip:hover {
  background: #dbeafe;
}

.pager {
  margin-top: 14px;
}

.pager button,
.action-row button,
.library-actions button {
  border-radius: 10px;
  padding: 8px 10px;
  background: #0f172a;
  color: #fff;
}

.pager button:disabled,
.action-row button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tool-panel {
  display: grid;
  gap: 14px;
}

.library-list,
.book-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
}

.library-list li,
.book-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
}

.library-list strong,
.book-list strong {
  color: #0f172a;
}

.library-list p,
.book-list p,
.current-word,
.translation-result,
.sentence-preview,
.tip {
  margin: 4px 0 0;
  color: #64748b;
}

.library-list small,
.phonetic {
  color: #94a3b8;
}

.danger {
  background: #fee2e2 !important;
  color: #b91c1c !important;
}

.current-word {
  min-height: 28px;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.translation-result,
.sentence-preview {
  line-height: 1.8;
}

.detail {
  margin-top: 14px;
}

.detail h5 {
  margin: 0 0 8px;
  color: #475569;
}

.detail ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: #334155;
}

.empty,
.empty-page,
.empty-shell {
  color: #64748b;
}

.empty-shell {
  padding: 40px 20px;
  border-radius: 20px;
  background: #f8fafc;
  text-align: center;
}

@media (max-width: 1200px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .window-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .reader-head,
  .settings-bar {
    flex-direction: column;
    align-items: flex-start;
  }

  .head-actions,
  .window-head,
  .pager,
  .library-actions,
  .action-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
