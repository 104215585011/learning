import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'fs'
import fsp from 'fs/promises'
import mammoth from 'mammoth'
import multer from 'multer'
import path from 'path'
import { PDFParse } from 'pdf-parse'
import { fileURLToPath } from 'url'
import {
  createSessionToken,
  databaseName,
  db,
  ensureDatabase,
  featurePagesTable,
  pageViewsTable,
  sessionsTable,
  studyLogsTable,
  studyProfilesTable,
  studyTasksTable,
  usersTable,
} from './db.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || 3001)
const onlineMinutes = 5
const defaultAvatar =
  'https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?auto=format&fit=crop&w=300&q=80'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.join(__dirname, 'uploads')
const docsDir = path.join(uploadsDir, 'docs')

fs.mkdirSync(uploadsDir, { recursive: true })
fs.mkdirSync(docsDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.png'
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`)
    },
  }),
})

const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, docsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.txt'
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`)
    },
  }),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const allowed = new Set(['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'])
    if (!allowed.has(ext)) {
      cb(new Error('仅支持 PDF、Word、TXT、Markdown、RTF 文件。'))
      return
    }
    cb(null, true)
  },
})

app.use(express.json({ limit: '5mb' }))
app.use('/uploads', express.static(uploadsDir))

const todayKey = () => new Date().toISOString().slice(0, 10)

const mapUser = (row) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name || row.username,
  avatarUrl: row.avatar_url || defaultAvatar,
  bio: row.bio || '这个人很低调，还没有填写个人介绍。',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const comparePassword = async (plainText, stored) => {
  if (!stored) return false
  if (stored.startsWith('$2')) return bcrypt.compare(plainText, stored)
  return plainText === stored
}

const ensurePasswordHash = async (row) => {
  if (!row || !row.password || row.password.startsWith('$2')) return row
  const hashed = await bcrypt.hash(row.password, 10)
  await db.execute(`UPDATE \`${usersTable}\` SET password = ? WHERE id = ?`, [hashed, row.id])
  return { ...row, password: hashed }
}

const getAuthUser = async (token) => {
  if (!token) return null
  const [rows] = await db.execute(
    `
      SELECT u.*
      FROM \`${sessionsTable}\` s
      JOIN \`${usersTable}\` u ON u.id = s.user_id
      WHERE s.token = ?
        AND s.is_active = 1
      LIMIT 1
    `,
    [token],
  )

  if (!rows.length) return null
  return ensurePasswordHash(rows[0])
}

const requireUser = async (req, res) => {
  const token =
    req.headers.authorization?.replace(/^Bearer\s+/i, '').trim() || req.body?.token || req.query?.token || ''
  const user = await getAuthUser(token)

  if (!user) {
    res.status(401).json({ ok: false, message: '登录状态已失效，请重新登录。' })
    return null
  }

  await db.execute(
    `UPDATE \`${sessionsTable}\` SET last_seen = CURRENT_TIMESTAMP WHERE token = ? AND is_active = 1`,
    [token],
  )

  return { token, user }
}

const getStats = async () => {
  const [[onlineUsers]] = await db.query(
    `
      SELECT COUNT(DISTINCT user_id) AS total
      FROM \`${sessionsTable}\`
      WHERE is_active = 1
        AND last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
    `,
    [onlineMinutes],
  )
  const [[pageViews]] = await db.query(`SELECT COUNT(*) AS total FROM \`${pageViewsTable}\``)
  const [[users]] = await db.query(`SELECT COUNT(*) AS total FROM \`${usersTable}\``)
  const [[todayLogins]] = await db.query(
    `SELECT COUNT(*) AS total FROM \`${sessionsTable}\` WHERE created_at >= CURDATE()`,
  )

  return {
    onlineUsers: Number(onlineUsers.total || 0),
    totalViews: Number(pageViews.total || 0),
    totalUsers: Number(users.total || 0),
    todayLogins: Number(todayLogins.total || 0),
  }
}

const ensureStudyProfile = async (userId) => {
  const [existing] = await db.execute(`SELECT * FROM \`${studyProfilesTable}\` WHERE user_id = ? LIMIT 1`, [userId])
  if (existing.length) return existing[0]

  await db.execute(
    `
      INSERT INTO \`${studyProfilesTable}\`
      (user_id, spanish_level, exam_target, exam_date, target_school, daily_study_minutes, focus_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [userId, 'A1', '考研英语一', null, '', 120, '优先建立稳定的学习节奏，阅读和考研主线都保持每天推进。'],
  )

  const [rows] = await db.execute(`SELECT * FROM \`${studyProfilesTable}\` WHERE user_id = ? LIMIT 1`, [userId])
  return rows[0]
}

const buildDailyTasks = (profile) => {
  const levelMap = {
    A1: ['阅读西语基础短文 20 分钟', '整理本页生词并复习 10 个', '考研英语长难句精读 2 句'],
    A2: ['阅读西语主题文章 25 分钟', '整理重点表达并复习 12 个', '考研英语阅读真题精读 1 篇'],
    B1: ['阅读中篇西语材料并做摘录', '总结一页语法或表达误区', '考研政治或专业课主线复盘'],
    B2: ['阅读较难西语材料并完成批注', '对比不同语言表达差异', '考研冲刺专题强化训练'],
  }

  const [readingTask, vocabTask, examTask] = levelMap[profile.spanish_level] || levelMap.A1
  const examTarget = profile.exam_target || '考研综合复习'
  const school = profile.target_school ? `目标院校：${profile.target_school}` : '暂未填写目标院校'

  return [
    {
      track: 'reading',
      title: readingTask,
      description: `围绕当前语言水平 ${profile.spanish_level} 进行沉浸阅读和段落理解。`,
      estimatedMinutes: 30,
      sortOrder: 1,
    },
    {
      track: 'reading',
      title: vocabTask,
      description: '结合阅读过程中的重点词语、句子和批注完成复盘。',
      estimatedMinutes: 20,
      sortOrder: 2,
    },
    {
      track: 'exam',
      title: examTask,
      description: `${examTarget}。${school}。`,
      estimatedMinutes: 40,
      sortOrder: 3,
    },
    {
      track: 'exam',
      title: '考研复盘与次日计划',
      description: '整理错题、记录薄弱项，并确认明天的复习节奏。',
      estimatedMinutes: 20,
      sortOrder: 4,
    },
  ]
}

const ensureTodayTasks = async (userId, profile) => {
  const today = todayKey()
  const [existing] = await db.execute(
    `SELECT * FROM \`${studyTasksTable}\` WHERE user_id = ? AND scheduled_for = ? ORDER BY sort_order ASC, id ASC`,
    [userId, today],
  )
  if (existing.length) return existing

  const generated = buildDailyTasks(profile)
  for (const task of generated) {
    await db.execute(
      `
        INSERT INTO \`${studyTasksTable}\`
        (user_id, track, title, description, estimated_minutes, status, scheduled_for, sort_order)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      `,
      [userId, task.track, task.title, task.description, task.estimatedMinutes, today, task.sortOrder],
    )
  }

  const [rows] = await db.execute(
    `SELECT * FROM \`${studyTasksTable}\` WHERE user_id = ? AND scheduled_for = ? ORDER BY sort_order ASC, id ASC`,
    [userId, today],
  )
  return rows
}

const getLearningStats = async (userId, profile) => {
  const today = todayKey()
  const [[taskStats]] = await db.execute(
    `
      SELECT
        COUNT(*) AS total_tasks,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS completed_tasks,
        SUM(CASE WHEN status = 'done' THEN estimated_minutes ELSE 0 END) AS completed_minutes
      FROM \`${studyTasksTable}\`
      WHERE user_id = ? AND scheduled_for = ?
    `,
    [userId, today],
  )

  const [[weeklyLog]] = await db.execute(
    `
      SELECT COALESCE(SUM(minutes_spent), 0) AS total_minutes
      FROM \`${studyLogsTable}\`
      WHERE user_id = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `,
    [userId],
  )

  const [[streakRows]] = await db.execute(
    `
      SELECT COUNT(DISTINCT DATE(created_at)) AS active_days
      FROM \`${studyLogsTable}\`
      WHERE user_id = ?
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
    `,
    [userId],
  )

  const examCountdown =
    profile.exam_date && !Number.isNaN(new Date(profile.exam_date).getTime())
      ? Math.max(0, Math.ceil((new Date(profile.exam_date) - new Date()) / (1000 * 60 * 60 * 24)))
      : null

  return {
    totalTasks: Number(taskStats.total_tasks || 0),
    completedTasks: Number(taskStats.completed_tasks || 0),
    completedMinutes: Number(taskStats.completed_minutes || 0),
    weeklyMinutes: Number(weeklyLog.total_minutes || 0),
    streakDays: Number(streakRows.active_days || 0),
    examCountdown,
  }
}

const mapStudyProfile = (row) => ({
  spanishLevel: row.spanish_level,
  examTarget: row.exam_target || '',
  examDate: row.exam_date ? new Date(row.exam_date).toISOString().slice(0, 10) : '',
  targetSchool: row.target_school || '',
  dailyStudyMinutes: row.daily_study_minutes,
  focusNotes: row.focus_notes || '',
})

const mapTask = (row) => ({
  id: row.id,
  track: row.track,
  title: row.title,
  description: row.description || '',
  estimatedMinutes: row.estimated_minutes,
  status: row.status,
  scheduledFor: row.scheduled_for,
  sortOrder: row.sort_order,
})

const stripBinaryNoise = (text) =>
  String(text || '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const escapeHtml = (text) =>
  String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const textToHtml = (text) =>
  escapeHtml(text)
    .split(/\n{2,}/)
    .map((part) => `<p>${part.replaceAll('\n', '<br />')}</p>`)
    .join('\n')

const extractDocumentContent = async (filePath, ext) => {
  if (ext === '.pdf') {
    const buffer = await fsp.readFile(filePath)
    const parser = new PDFParse({ data: buffer })
    const parsed = await parser.getText()
    await parser.destroy()
    const text = stripBinaryNoise(parsed?.text)
    return { text, html: textToHtml(text) }
  }

  if (ext === '.docx') {
    const htmlResult = await mammoth.convertToHtml({ path: filePath })
    const rawResult = await mammoth.extractRawText({ path: filePath })
    const text = stripBinaryNoise(rawResult.value)
    return { text, html: htmlResult.value || textToHtml(text) }
  }

  if (ext === '.txt' || ext === '.md' || ext === '.rtf') {
    const content = await fsp.readFile(filePath, 'utf8')
    const text = stripBinaryNoise(content)
    return { text, html: textToHtml(text) }
  }

  if (ext === '.doc') {
    const content = await fsp.readFile(filePath)
    const text = stripBinaryNoise(content.toString('utf8'))
    return { text, html: textToHtml(text) }
  }

  return { text: '', html: '' }
}

const languageMap = {
  auto: 'auto',
  zh: 'zh-CN',
  'zh-CN': 'zh-CN',
  en: 'en',
  es: 'es',
  fr: 'fr',
  de: 'de',
  ja: 'ja',
  ko: 'ko',
  ru: 'ru',
  pt: 'pt',
  it: 'it',
}

const normalizeLanguage = (code, fallback = 'auto') => {
  const value = String(code || '').trim()
  return languageMap[value] || fallback
}

const detectLanguage = (text) => {
  const value = String(text || '')
  if (/[\u4e00-\u9fff]/.test(value)) return 'zh-CN'
  if (/[\u3040-\u30ff]/.test(value)) return 'ja'
  if (/[\uac00-\ud7af]/.test(value)) return 'ko'
  if (/[\u0400-\u04ff]/.test(value)) return 'ru'
  if (/[áéíóúñü¿¡]/i.test(value)) return 'es'
  if (/[àâçéèêëîïôûùüÿœ]/i.test(value)) return 'fr'
  if (/[äöüß]/i.test(value)) return 'de'
  if (/[ãõç]/i.test(value)) return 'pt'
  if (/^[\x00-\x7F\s]+$/.test(value)) return 'en'
  return 'auto'
}

const translateWithMyMemory = async ({ text, sourceLanguage, targetLanguage }) => {
  const source = sourceLanguage === 'auto' ? detectLanguage(text) : sourceLanguage
  const from = source === 'auto' ? 'en' : source
  const to = normalizeLanguage(targetLanguage, 'zh-CN')

  if (from === to) {
    return {
      translatedText: text,
      detectedSourceLanguage: source,
      targetLanguage: to,
    }
  }

  const response = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(from)}|${encodeURIComponent(to)}`,
  )
  const data = await response.json()
  const translatedText =
    data?.responseData?.translatedText || data?.matches?.find((item) => item.translation)?.translation || ''

  if (!translatedText) {
    throw new Error('翻译服务暂时不可用，请稍后重试。')
  }

  return {
    translatedText,
    detectedSourceLanguage: source,
    targetLanguage: to,
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1')
    res.json({
      ok: true,
      database: databaseName,
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT || 3306),
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: '数据库连接失败，请检查 .env 中的 MySQL 配置。',
      detail: error.message,
    })
  }
})

app.post('/api/register', async (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '').trim()
  const displayName = String(req.body?.displayName || username).trim()

  if (!username || !password) {
    return res.status(400).json({ ok: false, message: '用户名和密码不能为空。' })
  }
  if (password.length < 6) {
    return res.status(400).json({ ok: false, message: '密码长度不能少于 6 位。' })
  }

  try {
    const [existing] = await db.execute(`SELECT id FROM \`${usersTable}\` WHERE username = ? LIMIT 1`, [username])
    if (existing.length) {
      return res.status(409).json({ ok: false, message: '这个账号已经存在，请换一个用户名。' })
    }

    const avatarUrl = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(username)}`
    const passwordHash = await bcrypt.hash(password, 10)
    const [result] = await db.execute(
      `INSERT INTO \`${usersTable}\` (username, password, display_name, avatar_url, bio) VALUES (?, ?, ?, ?, ?)`,
      [username, passwordHash, displayName || username, avatarUrl, '这是新注册用户，欢迎补充个人信息。'],
    )

    const token = createSessionToken()
    await db.execute(`INSERT INTO \`${sessionsTable}\` (token, user_id) VALUES (?, ?)`, [token, result.insertId])
    await ensureStudyProfile(result.insertId)
    const [rows] = await db.execute(`SELECT * FROM \`${usersTable}\` WHERE id = ? LIMIT 1`, [result.insertId])

    return res.json({ ok: true, message: '注册成功，已自动登录。', token, user: mapUser(rows[0]) })
  } catch (error) {
    return res.status(500).json({ ok: false, message: '注册失败，请稍后重试。', detail: error.message })
  }
})

app.post('/api/login', async (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '').trim()

  if (!username || !password) {
    return res.status(400).json({ ok: false, message: '用户名和密码不能为空。' })
  }

  try {
    const [rows] = await db.execute(`SELECT * FROM \`${usersTable}\` WHERE username = ? LIMIT 1`, [username])
    const userRow = rows[0] ? await ensurePasswordHash(rows[0]) : null

    if (!userRow || !(await comparePassword(password, userRow.password))) {
      return res.status(401).json({ ok: false, message: '用户名或密码错误。' })
    }

    const token = createSessionToken()
    await db.execute(`INSERT INTO \`${sessionsTable}\` (token, user_id) VALUES (?, ?)`, [token, userRow.id])
    await ensureStudyProfile(userRow.id)

    return res.json({ ok: true, message: '登录成功。', token, user: mapUser(userRow) })
  } catch (error) {
    return res.status(500).json({ ok: false, message: '登录接口调用失败，请稍后再试。', detail: error.message })
  }
})

app.post('/api/logout', async (req, res) => {
  const token = String(req.body?.token || '').trim()
  if (token) {
    await db.execute(`UPDATE \`${sessionsTable}\` SET is_active = 0 WHERE token = ?`, [token])
  }
  res.json({ ok: true })
})

app.post('/api/session/heartbeat', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return
  res.json({ ok: true })
})

app.get('/api/bootstrap', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const profile = await ensureStudyProfile(auth.user.id)
  const tasks = await ensureTodayTasks(auth.user.id, profile)
  const [pages] = await db.query(
    `
      SELECT id, title, slug, icon_label, sort_order, description, content, created_at, updated_at
      FROM \`${featurePagesTable}\`
      ORDER BY sort_order ASC, created_at ASC
    `,
  )

  return res.json({
    ok: true,
    user: mapUser(auth.user),
    stats: await getStats(),
    pages,
    studyProfile: mapStudyProfile(profile),
    todayTasks: tasks.map(mapTask),
    learningStats: await getLearningStats(auth.user.id, profile),
  })
})

app.put('/api/study/profile', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const spanishLevel = String(req.body?.spanishLevel || 'A1').trim().toUpperCase()
  const examTarget = String(req.body?.examTarget || '').trim()
  const examDate = String(req.body?.examDate || '').trim() || null
  const targetSchool = String(req.body?.targetSchool || '').trim()
  const dailyStudyMinutes = Math.max(30, Number(req.body?.dailyStudyMinutes || 120))
  const focusNotes = String(req.body?.focusNotes || '').trim()

  await ensureStudyProfile(auth.user.id)
  await db.execute(
    `
      UPDATE \`${studyProfilesTable}\`
      SET spanish_level = ?, exam_target = ?, exam_date = ?, target_school = ?, daily_study_minutes = ?, focus_notes = ?
      WHERE user_id = ?
    `,
    [spanishLevel, examTarget, examDate, targetSchool, dailyStudyMinutes, focusNotes, auth.user.id],
  )

  const [rows] = await db.execute(`SELECT * FROM \`${studyProfilesTable}\` WHERE user_id = ? LIMIT 1`, [auth.user.id])
  return res.json({
    ok: true,
    message: '学习档案已更新。',
    studyProfile: mapStudyProfile(rows[0]),
  })
})

app.post('/api/study/tasks/refresh', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const profile = await ensureStudyProfile(auth.user.id)
  await db.execute(`DELETE FROM \`${studyTasksTable}\` WHERE user_id = ? AND scheduled_for = ?`, [auth.user.id, todayKey()])
  const tasks = await ensureTodayTasks(auth.user.id, profile)

  return res.json({
    ok: true,
    message: '今日任务已重新生成。',
    todayTasks: tasks.map(mapTask),
    learningStats: await getLearningStats(auth.user.id, profile),
  })
})

app.post('/api/study/tasks/:id/toggle', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const taskId = Number(req.params.id)
  const [rows] = await db.execute(
    `SELECT * FROM \`${studyTasksTable}\` WHERE id = ? AND user_id = ? LIMIT 1`,
    [taskId, auth.user.id],
  )
  const task = rows[0]
  if (!task) {
    return res.status(404).json({ ok: false, message: '没有找到对应任务。' })
  }

  const nextStatus = task.status === 'done' ? 'pending' : 'done'
  await db.execute(`UPDATE \`${studyTasksTable}\` SET status = ? WHERE id = ?`, [nextStatus, taskId])
  await db.execute(
    `INSERT INTO \`${studyLogsTable}\` (user_id, log_type, minutes_spent, payload_json) VALUES (?, ?, ?, ?)`,
    [auth.user.id, nextStatus === 'done' ? 'task_completed' : 'task_reopened', task.estimated_minutes, JSON.stringify({ taskId })],
  )

  const profile = await ensureStudyProfile(auth.user.id)
  const [tasks] = await db.execute(
    `SELECT * FROM \`${studyTasksTable}\` WHERE user_id = ? AND scheduled_for = ? ORDER BY sort_order ASC, id ASC`,
    [auth.user.id, todayKey()],
  )

  return res.json({
    ok: true,
    message: nextStatus === 'done' ? '任务已完成。' : '任务已恢复为待完成。',
    todayTasks: tasks.map(mapTask),
    learningStats: await getLearningStats(auth.user.id, profile),
  })
})

app.post('/api/views', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const pageKey = String(req.body?.pageKey || '').trim()
  if (!pageKey) {
    return res.status(400).json({ ok: false, message: '页面标识不能为空。' })
  }

  await db.execute(`INSERT INTO \`${pageViewsTable}\` (user_id, page_key) VALUES (?, ?)`, [auth.user.id, pageKey])
  return res.json({ ok: true, stats: await getStats() })
})

app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return
  if (!req.file) {
    return res.status(400).json({ ok: false, message: '请选择要上传的头像文件。' })
  }

  const avatarUrl = `/uploads/${req.file.filename}`
  await db.execute(`UPDATE \`${usersTable}\` SET avatar_url = ? WHERE id = ?`, [avatarUrl, auth.user.id])
  const [rows] = await db.execute(`SELECT * FROM \`${usersTable}\` WHERE id = ? LIMIT 1`, [auth.user.id])
  return res.json({ ok: true, message: '头像上传成功。', avatarUrl, user: mapUser(rows[0]) })
})

app.post('/api/documents/upload', documentUpload.single('document'), async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return
  if (!req.file) {
    return res.status(400).json({ ok: false, message: '请选择要上传的文件。' })
  }

  const ext = path.extname(req.file.originalname || '').toLowerCase()

  try {
    const extracted = await extractDocumentContent(req.file.path, ext)
    if (!extracted.text) {
      return res.status(400).json({ ok: false, message: '未提取到有效文本，请检查文件内容或更换格式。' })
    }

    await db.execute(
      `INSERT INTO \`${studyLogsTable}\` (user_id, log_type, minutes_spent, payload_json) VALUES (?, ?, ?, ?)`,
      [auth.user.id, 'reading_upload', 15, JSON.stringify({ filename: req.file.originalname })],
    )

    return res.json({
      ok: true,
      message: '文件上传并解析成功。',
      document: {
        name: req.file.originalname,
        size: req.file.size,
        type: ext.replace('.', ''),
        text: extracted.text,
        html: extracted.html,
        originalUrl: `/uploads/docs/${req.file.filename}`,
      },
    })
  } catch (error) {
    return res.status(500).json({ ok: false, message: '文件解析失败，请稍后重试。', detail: error.message })
  }
})

app.get('/api/translate', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const text = String(req.query?.text || req.query?.word || '').trim()
  const sourceLanguage = normalizeLanguage(req.query?.sourceLanguage, 'auto')
  const targetLanguage = normalizeLanguage(req.query?.targetLanguage, 'zh-CN')

  if (!text) {
    return res.status(400).json({ ok: false, message: '待翻译内容不能为空。' })
  }

  try {
    const result = await translateWithMyMemory({
      text,
      sourceLanguage,
      targetLanguage,
    })

    let phonetic = ''
    const examples = []
    const synonyms = []
    const meanings = []

    if ((sourceLanguage === 'auto' ? result.detectedSourceLanguage : sourceLanguage) === 'en') {
      const dictResp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`)
      if (dictResp.ok) {
        const dictData = await dictResp.json()
        const entry = Array.isArray(dictData) ? dictData[0] : null
        phonetic = entry?.phonetic || entry?.phonetics?.find((item) => item?.text)?.text || ''
        for (const meaning of (entry?.meanings || []).slice(0, 4)) {
          const definition = meaning?.definitions?.[0]
          if (!definition?.definition) continue
          meanings.push({
            partOfSpeech: meaning?.partOfSpeech || '',
            definition: definition.definition,
          })
          if (definition.example && examples.length < 4) {
            examples.push(definition.example)
          }
          for (const synonym of (definition.synonyms || []).slice(0, 6)) {
            if (!synonyms.includes(synonym)) synonyms.push(synonym)
          }
        }
      }
    }

    return res.json({
      ok: true,
      text,
      translatedText: result.translatedText,
      detectedSourceLanguage: result.detectedSourceLanguage,
      targetLanguage: result.targetLanguage,
      phonetic,
      examples,
      synonyms,
      meanings,
    })
  } catch (error) {
    return res.status(502).json({ ok: false, message: error.message || '翻译服务调用失败。', detail: error.message })
  }
})

app.get('/api/translate-sentence', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const text = String(req.query?.text || '').trim()
  const sourceLanguage = normalizeLanguage(req.query?.sourceLanguage, 'auto')
  const targetLanguage = normalizeLanguage(req.query?.targetLanguage, 'zh-CN')

  if (!text) {
    return res.status(400).json({ ok: false, message: '待翻译句子不能为空。' })
  }

  try {
    const result = await translateWithMyMemory({
      text,
      sourceLanguage,
      targetLanguage,
    })
    return res.json({
      ok: true,
      text,
      translatedText: result.translatedText,
      detectedSourceLanguage: result.detectedSourceLanguage,
      targetLanguage: result.targetLanguage,
    })
  } catch (error) {
    return res.status(502).json({ ok: false, message: error.message || '句子翻译失败。', detail: error.message })
  }
})

app.post('/api/pages', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const title = String(req.body?.title || '').trim()
  const description = String(req.body?.description || '').trim()
  const content = String(req.body?.content || '').trim()
  const iconLabel = String(req.body?.iconLabel || title.slice(0, 2) || 'FX').trim().slice(0, 4).toUpperCase()
  const slug = String(req.body?.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim().replace(/^-+|-+$/g, '')

  if (!title || !slug) {
    return res.status(400).json({ ok: false, message: '功能页标题不能为空。' })
  }

  try {
    const [[lastSort]] = await db.query(`SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM \`${featurePagesTable}\``)
    const [result] = await db.execute(
      `INSERT INTO \`${featurePagesTable}\` (title, slug, icon_label, sort_order, description, content, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, slug, iconLabel || 'FX', Number(lastSort.maxSort || 0) + 1, description, content, auth.user.id],
    )
    const [rows] = await db.execute(
      `SELECT id, title, slug, icon_label, sort_order, description, content, created_at, updated_at FROM \`${featurePagesTable}\` WHERE id = ? LIMIT 1`,
      [result.insertId],
    )
    return res.json({ ok: true, message: '新功能页已创建。', page: rows[0] })
  } catch (error) {
    return res.status(500).json({ ok: false, message: '创建功能页失败，请检查标题是否重复。', detail: error.message })
  }
})

app.put('/api/pages/reorder', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return
  const pages = Array.isArray(req.body?.pages) ? req.body.pages : []
  if (!pages.length) {
    return res.status(400).json({ ok: false, message: '排序数据不能为空。' })
  }

  for (const item of pages) {
    await db.execute(`UPDATE \`${featurePagesTable}\` SET sort_order = ? WHERE id = ?`, [
      Number(item.sortOrder || 0),
      Number(item.id),
    ])
  }

  const [rows] = await db.query(
    `SELECT id, title, slug, icon_label, sort_order, description, content, created_at, updated_at
     FROM \`${featurePagesTable}\`
     ORDER BY sort_order ASC, created_at ASC`,
  )
  return res.json({ ok: true, message: '功能页排序已更新。', pages: rows })
})

app.put('/api/pages/:id', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const id = Number(req.params.id)
  const title = String(req.body?.title || '').trim()
  const description = String(req.body?.description || '').trim()
  const content = String(req.body?.content || '').trim()
  const iconLabel = String(req.body?.iconLabel || title.slice(0, 2) || 'FX').trim().slice(0, 4).toUpperCase()
  const slug = String(req.body?.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim().replace(/^-+|-+$/g, '')

  if (!id || !title || !slug) {
    return res.status(400).json({ ok: false, message: '功能页信息不完整。' })
  }

  try {
    await db.execute(
      `UPDATE \`${featurePagesTable}\` SET title = ?, slug = ?, icon_label = ?, description = ?, content = ? WHERE id = ?`,
      [title, slug, iconLabel || 'FX', description, content, id],
    )
    const [rows] = await db.execute(
      `SELECT id, title, slug, icon_label, sort_order, description, content, created_at, updated_at FROM \`${featurePagesTable}\` WHERE id = ? LIMIT 1`,
      [id],
    )
    return res.json({ ok: true, message: '功能页已更新。', page: rows[0] })
  } catch (error) {
    return res.status(500).json({ ok: false, message: '更新功能页失败。', detail: error.message })
  }
})

app.delete('/api/pages/:id', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const id = Number(req.params.id)
  if (!id) {
    return res.status(400).json({ ok: false, message: '功能页编号无效。' })
  }

  await db.execute(`DELETE FROM \`${featurePagesTable}\` WHERE id = ?`, [id])
  return res.json({ ok: true, message: '功能页已删除。' })
})

app.put('/api/profile', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const username = String(req.body?.username || auth.user.username).trim()
  const displayName = String(req.body?.displayName || auth.user.display_name || auth.user.username).trim()
  const bio = String(req.body?.bio || '').trim()
  const avatarUrl = String(req.body?.avatarUrl || '').trim()
  const currentPassword = String(req.body?.currentPassword || '').trim()
  const nextPassword = String(req.body?.nextPassword || '').trim()

  if (!username) {
    return res.status(400).json({ ok: false, message: '用户名不能为空。' })
  }
  if (nextPassword && nextPassword.length < 6) {
    return res.status(400).json({ ok: false, message: '新密码长度不能少于 6 位。' })
  }
  if (nextPassword && !(await comparePassword(currentPassword, auth.user.password))) {
    return res.status(400).json({ ok: false, message: '当前密码不正确。' })
  }

  const [nameRows] = await db.execute(
    `SELECT id FROM \`${usersTable}\` WHERE username = ? AND id <> ? LIMIT 1`,
    [username, auth.user.id],
  )
  if (nameRows.length) {
    return res.status(409).json({ ok: false, message: '这个用户名已被占用。' })
  }

  const passwordHash = nextPassword ? await bcrypt.hash(nextPassword, 10) : auth.user.password
  await db.execute(
    `UPDATE \`${usersTable}\` SET username = ?, display_name = ?, bio = ?, avatar_url = ?, password = ? WHERE id = ?`,
    [username, displayName || username, bio, avatarUrl, passwordHash, auth.user.id],
  )
  const [rows] = await db.execute(`SELECT * FROM \`${usersTable}\` WHERE id = ? LIMIT 1`, [auth.user.id])
  return res.json({ ok: true, message: '个人信息已更新。', user: mapUser(rows[0]) })
})

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ ok: false, message: '文件大小不能超过 100MB。' })
    }
    return res.status(400).json({ ok: false, message: error.message || '文件上传失败。' })
  }

  if (error?.message?.includes('仅支持')) {
    return res.status(400).json({ ok: false, message: error.message })
  }

  return res.status(500).json({
    ok: false,
    message: '服务器处理请求时发生异常。',
    detail: error?.message,
  })
})

const start = async () => {
  await ensureDatabase()
  app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`)
  })
}

start().catch((error) => {
  console.error('Failed to start server:', error.message)
  process.exit(1)
})
