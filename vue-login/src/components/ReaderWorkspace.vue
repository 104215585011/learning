<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { apiRequest } from '../api'

const props = defineProps({
  token: { type: String, required: true },
})

const BOOK_KEY = 'reader-word-book'
const SENTENCE_BOOK_KEY = 'reader-sentence-book'
const HIGHLIGHT_KEY = 'reader-highlighted-words'
const DOC_KEY = 'reader-last-document'

const loading = ref(false)
const message = ref('')
const selectedWord = ref('')
const translation = reactive({
  translatedText: '',
  phonetic: '',
  examples: [],
  synonyms: [],
  meanings: [],
})
const translating = ref(false)
const readingText = ref(localStorage.getItem(DOC_KEY) || '')
const readingHtml = ref('')
const documentUrl = ref('')
const viewMode = ref('focus')
const selectedSentence = ref('')
const sentenceTranslation = ref('')
const translatingSentence = ref(false)
const highlightedWords = ref(new Set(JSON.parse(localStorage.getItem(HIGHLIGHT_KEY) || '[]')))
const vocabularyBook = ref(JSON.parse(localStorage.getItem(BOOK_KEY) || '[]'))
const sentenceBook = ref(JSON.parse(localStorage.getItem(SENTENCE_BOOK_KEY) || '[]'))

const uploadMeta = reactive({
  name: '',
  size: 0,
  type: '',
})

const formatSize = (size) => {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const saveLocal = () => {
  localStorage.setItem(BOOK_KEY, JSON.stringify(vocabularyBook.value))
  localStorage.setItem(SENTENCE_BOOK_KEY, JSON.stringify(sentenceBook.value))
  localStorage.setItem(HIGHLIGHT_KEY, JSON.stringify([...highlightedWords.value]))
  localStorage.setItem(DOC_KEY, readingText.value)
}

const normalizedWord = (word) => String(word || '').toLowerCase().replace(/[^a-z']/gi, '')

const tokens = computed(() => {
  const source = readingText.value
  if (!source) return []
  return source
    .split(/\n{2,}/)
    .map((block) => block.split(/(\s+|[^\w']+)/g).filter((item) => item.length > 0))
})

const isWord = (token) => /^[A-Za-z][A-Za-z']*$/.test(token)

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
    readingText.value = data.document.text
    readingHtml.value = data.document.html || ''
    documentUrl.value = data.document.originalUrl || ''
    uploadMeta.name = data.document.name
    uploadMeta.size = data.document.size
    uploadMeta.type = data.document.type
    message.value = '文档解析成功，点击单词即可高亮、翻译并加入生词本。'
    saveLocal()
  } catch (error) {
    message.value = error.message
  } finally {
    loading.value = false
    event.target.value = ''
  }
}

const toggleHighlight = (word) => {
  const key = normalizedWord(word)
  if (!key) return
  if (highlightedWords.value.has(key)) {
    highlightedWords.value.delete(key)
  } else {
    highlightedWords.value.add(key)
  }
  highlightedWords.value = new Set(highlightedWords.value)
  saveLocal()
}

const translateWord = async (word) => {
  selectedWord.value = word
  translation.translatedText = ''
  translation.phonetic = ''
  translation.examples = []
  translation.synonyms = []
  translation.meanings = []
  translating.value = true
  try {
    const data = await apiRequest(`/api/translate?word=${encodeURIComponent(word)}`, { token: props.token })
    translation.translatedText = data.translatedText || ''
    translation.phonetic = data.phonetic || ''
    translation.examples = Array.isArray(data.examples) ? data.examples : []
    translation.synonyms = Array.isArray(data.synonyms) ? data.synonyms : []
    translation.meanings = Array.isArray(data.meanings) ? data.meanings : []
  } catch (error) {
    translation.translatedText = error.message
  } finally {
    translating.value = false
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
      examples: translation.examples,
      synonyms: translation.synonyms,
      createdAt: new Date().toISOString(),
    })
    saveLocal()
  }
}

const translateSelectedSentence = async () => {
  const rawSelection = window.getSelection?.()?.toString() || ''
  const text = rawSelection.trim().replace(/\s+/g, ' ')
  if (!text) {
    sentenceTranslation.value = '请先在左侧阅读区选中一句话。'
    return
  }
  selectedSentence.value = text
  translatingSentence.value = true
  try {
    const data = await apiRequest(`/api/translate-sentence?text=${encodeURIComponent(text)}`, { token: props.token })
    sentenceTranslation.value = data.translatedText || ''
  } catch (error) {
    sentenceTranslation.value = error.message
  } finally {
    translatingSentence.value = false
  }
}

const addSentenceToBook = () => {
  if (!selectedSentence.value || !sentenceTranslation.value) return
  const exists = sentenceBook.value.some((item) => item.text === selectedSentence.value)
  if (!exists) {
    sentenceBook.value.unshift({
      text: selectedSentence.value,
      translatedText: sentenceTranslation.value,
      createdAt: new Date().toISOString(),
    })
    saveLocal()
  }
}

const playPronunciation = (word) => {
  if (!word || !window.speechSynthesis) return
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = 'en-US'
  utterance.rate = 0.9
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

const onWordClick = async (word) => {
  toggleHighlight(word)
  await translateWord(word)
}

const removeWord = (word) => {
  vocabularyBook.value = vocabularyBook.value.filter((item) => item.word !== word)
  saveLocal()
}

const removeSentence = (text) => {
  sentenceBook.value = sentenceBook.value.filter((item) => item.text !== text)
  saveLocal()
}

const onGlobalKeydown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    void translateSelectedSentence()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    addToVocabulary()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <article class="reader">
    <header class="reader-head">
      <div>
        <p class="reader-tag">Focused Reading</p>
        <h3>文档沉浸阅读</h3>
        <p>支持 PDF / Word / TXT / Markdown / RTF（最大 100MB）</p>
      </div>
      <label class="upload-btn">
        <input type="file" accept=".pdf,.doc,.docx,.txt,.md,.rtf" :disabled="loading" @change="handleUpload" />
        {{ loading ? '解析中...' : '上传文件' }}
      </label>
    </header>

    <p v-if="message" class="message">{{ message }}</p>

    <div v-if="uploadMeta.name" class="meta">
      <span>{{ uploadMeta.name }}</span>
      <span>{{ uploadMeta.type.toUpperCase() }}</span>
      <span>{{ formatSize(uploadMeta.size) }}</span>
      <button class="ghost-btn" type="button" @click="viewMode = viewMode === 'focus' ? 'original' : 'focus'">
        {{ viewMode === 'focus' ? '切换原文版式' : '切换学习版式' }}
      </button>
    </div>

    <section class="layout">
      <main class="reading-panel">
        <p v-if="!tokens.length" class="placeholder">上传文档后，这里会显示提取的文本内容。</p>
        <template v-else>
          <div v-if="viewMode === 'original' && readingHtml" class="original-html" v-html="readingHtml"></div>
          <article v-else class="text-flow">
            <p v-for="(block, blockIndex) in tokens" :key="`block-${blockIndex}`">
              <template v-for="(token, idx) in block" :key="`${blockIndex}-${idx}-${token}`">
                <span
                  v-if="isWord(token)"
                  :class="{ word: true, highlighted: highlightedWords.has(normalizedWord(token)) }"
                  @click="onWordClick(token)"
                >
                  {{ token }}
                </span>
                <span v-else>{{ token }}</span>
              </template>
            </p>
          </article>
          <div v-if="viewMode === 'original' && documentUrl" class="original-file">
            <h5>原文件预览</h5>
            <iframe :src="documentUrl" title="原文预览"></iframe>
          </div>
        </template>
      </main>

      <aside class="tool-panel">
        <section class="card">
          <h4>单词学习</h4>
          <p class="current">
            {{ selectedWord || '点击左侧单词开始' }}
            <span v-if="translation.phonetic" class="phonetic">{{ translation.phonetic }}</span>
          </p>
          <p class="translation">{{ translating ? '翻译中...' : translation.translatedText || '暂无翻译结果' }}</p>
          <div class="btns">
            <button type="button" :disabled="!selectedWord" @click="playPronunciation(selectedWord)">发音</button>
            <button type="button" :disabled="!selectedWord || !translation.translatedText" @click="addToVocabulary">
              加入生词本
            </button>
          </div>
          <div v-if="translation.meanings.length" class="detail">
            <h5>释义</h5>
            <ul>
              <li v-for="(meaning, idx) in translation.meanings" :key="`m-${idx}`">
                <strong v-if="meaning.partOfSpeech">{{ meaning.partOfSpeech }}:</strong>
                {{ meaning.definition }}
              </li>
            </ul>
          </div>
          <div v-if="translation.examples.length" class="detail">
            <h5>例句</h5>
            <ul>
              <li v-for="(example, idx) in translation.examples" :key="`e-${idx}`">{{ example }}</li>
            </ul>
          </div>
          <div v-if="translation.synonyms.length" class="detail">
            <h5>同义词</h5>
            <p class="synonyms">{{ translation.synonyms.join(' / ') }}</p>
          </div>
        </section>

        <section class="card">
          <h4>句子学习</h4>
          <p class="tip">在左侧选中句子后，按 `Ctrl/Cmd + K` 或点按钮翻译。</p>
          <p class="sentence">{{ selectedSentence || '还未选择句子' }}</p>
          <p class="translation">{{ translatingSentence ? '翻译中...' : sentenceTranslation || '暂无句子翻译' }}</p>
          <div class="btns">
            <button type="button" @click="translateSelectedSentence">翻译选中句子</button>
            <button type="button" :disabled="!selectedSentence || !sentenceTranslation" @click="addSentenceToBook">
              收藏句子
            </button>
          </div>
          <ul class="book sentence-book">
            <li v-for="item in sentenceBook" :key="item.text">
              <div>
                <strong>{{ item.text }}</strong>
                <p>{{ item.translatedText }}</p>
              </div>
              <button type="button" @click="removeSentence(item.text)">删除</button>
            </li>
            <li v-if="!sentenceBook.length" class="empty">还没有收藏句子。</li>
          </ul>
        </section>

        <section class="card">
          <h4>生词本（本地）</h4>
          <ul class="book">
            <li v-for="item in vocabularyBook" :key="item.word">
              <div>
                <strong>{{ item.word }}</strong>
                <p>{{ item.translatedText }}</p>
                <small v-if="item.phonetic">{{ item.phonetic }}</small>
              </div>
              <button type="button" @click="removeWord(item.word)">删除</button>
            </li>
            <li v-if="!vocabularyBook.length" class="empty">还没有生词，点击单词后可添加。</li>
          </ul>
        </section>
      </aside>
    </section>
  </article>
</template>

<style scoped>
.reader { display: grid; gap: 16px; }
.reader-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px; border-radius: 20px; background: #ffffff; box-shadow: inset 0 0 0 1px rgba(226,232,240,.9); }
.reader-tag { margin: 0 0 6px; font-size: 12px; letter-spacing: .12em; color: #0f766e; text-transform: uppercase; }
.reader-head h3 { margin: 0 0 6px; }
.reader-head p { margin: 0; color: #64748b; }
.upload-btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 14px; border-radius: 12px; background: #0f766e; color: #fff; cursor: pointer; font-weight: 700; }
.upload-btn input { display: none; }
.message { margin: 0; padding: 10px 12px; border-radius: 12px; background: #ecfeff; color: #0e7490; }
.meta { display: flex; gap: 10px; flex-wrap: wrap; color: #334155; font-size: 13px; align-items: center; }
.meta span { padding: 4px 8px; border-radius: 999px; background: #e2e8f0; }
.ghost-btn { border: 1px solid #cbd5e1; border-radius: 999px; background: #fff; color: #0f172a; padding: 4px 10px; cursor: pointer; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; }
.reading-panel, .card { padding: 20px; border-radius: 20px; background: #fff; box-shadow: inset 0 0 0 1px rgba(226,232,240,.9); }
.reading-panel { min-height: 520px; max-height: 72vh; overflow: auto; }
.placeholder { color: #64748b; }
.text-flow { margin: 0 auto; max-width: 860px; font-family: "Georgia", "Times New Roman", serif; font-size: 18px; line-height: 2; color: #0f172a; }
.text-flow p { margin: 0 0 1.1em; text-align: justify; }
.original-html { max-width: 900px; margin: 0 auto; line-height: 1.8; color: #1e293b; }
.original-file { margin-top: 16px; }
.original-file h5 { margin: 0 0 10px; }
.original-file iframe { width: 100%; min-height: 420px; border: 1px solid #cbd5e1; border-radius: 12px; }
.word { cursor: pointer; border-radius: 6px; padding: 1px 2px; transition: background .12s; }
.word:hover { background: #dbeafe; }
.word.highlighted { background: #fef08a; }
.tool-panel { display: grid; gap: 12px; align-content: start; }
.card h4 { margin: 0 0 10px; }
.current { margin: 0 0 8px; font-size: 18px; font-weight: 700; }
.phonetic { margin-left: 8px; color: #475569; font-weight: 500; font-size: 14px; }
.translation { margin: 0; min-height: 40px; color: #334155; }
.btns { display: flex; gap: 8px; margin-top: 10px; }
.btns button { border: none; border-radius: 10px; padding: 8px 10px; background: #0f172a; color: #fff; cursor: pointer; }
.btns button:disabled { opacity: .45; cursor: not-allowed; }
.detail { margin-top: 12px; }
.detail h5 { margin: 0 0 6px; font-size: 13px; color: #475569; }
.detail ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; color: #334155; }
.synonyms { margin: 0; color: #0f172a; line-height: 1.6; }
.book { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; max-height: 320px; overflow: auto; }
.book li { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
.book strong { text-transform: lowercase; }
.book p { margin: 4px 0 0; color: #64748b; font-size: 13px; }
.book small { color: #94a3b8; }
.book button { border: none; border-radius: 8px; padding: 4px 8px; background: #fee2e2; color: #b91c1c; cursor: pointer; }
.empty { color: #64748b; font-size: 13px; }
.tip { margin: 0 0 8px; color: #64748b; font-size: 12px; }
.sentence { margin: 0; color: #1e293b; line-height: 1.7; }
.sentence-book strong { text-transform: none; }
@media (max-width: 1080px) { .layout { grid-template-columns: 1fr; } .reading-panel { max-height: none; } }
</style>
