import bcrypt from 'bcryptjs'
import express from 'express'
import dotenv from 'dotenv'
import fs from 'fs'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  createSessionToken,
  databaseName,
  db,
  ensureDatabase,
  featurePagesTable,
  pageViewsTable,
  sessionsTable,
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

fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.png'
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`)
  },
})

const upload = multer({ storage })

app.use(express.json({ limit: '5mb' }))
app.use('/uploads', express.static(uploadsDir))

const mapUser = (row) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name || row.username,
  avatarUrl: row.avatar_url || defaultAvatar,
  bio: row.bio || '这个人很低调，还没有写个人介绍。',
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
    req.headers.authorization?.replace(/^Bearer\s+/i, '').trim() || req.body?.token || req.query?.token
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
    res.status(500).json({ ok: false, message: '数据库连接失败，请检查 .env 中的 MySQL 配置。', detail: error.message })
  }
})

app.post('/api/register', async (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '').trim()
  const displayName = String(req.body?.displayName || username).trim()

  if (!username || !password) return res.status(400).json({ ok: false, message: '用户名和密码不能为空。' })
  if (password.length < 6) return res.status(400).json({ ok: false, message: '密码长度不能少于 6 位。' })

  try {
    const [existing] = await db.execute(`SELECT id FROM \`${usersTable}\` WHERE username = ? LIMIT 1`, [username])
    if (existing.length) return res.status(409).json({ ok: false, message: '这个账号已经存在，请换一个用户名。' })

    const avatarUrl = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(username)}`
    const passwordHash = await bcrypt.hash(password, 10)
    const [result] = await db.execute(
      `INSERT INTO \`${usersTable}\` (username, password, display_name, avatar_url, bio) VALUES (?, ?, ?, ?, ?)`,
      [username, passwordHash, displayName || username, avatarUrl, '这是新注册用户，欢迎补充个人信息。'],
    )

    const token = createSessionToken()
    await db.execute(`INSERT INTO \`${sessionsTable}\` (token, user_id) VALUES (?, ?)`, [token, result.insertId])
    const [rows] = await db.execute(`SELECT * FROM \`${usersTable}\` WHERE id = ? LIMIT 1`, [result.insertId])

    return res.json({ ok: true, message: '注册成功，已自动登录。', token, user: mapUser(rows[0]) })
  } catch (error) {
    return res.status(500).json({ ok: false, message: '注册失败，请稍后重试。', detail: error.message })
  }
})

app.post('/api/login', async (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '').trim()

  if (!username || !password) return res.status(400).json({ ok: false, message: '用户名和密码不能为空。' })

  try {
    const [rows] = await db.execute(`SELECT * FROM \`${usersTable}\` WHERE username = ? LIMIT 1`, [username])
    const userRow = rows[0] ? await ensurePasswordHash(rows[0]) : null
    if (!userRow || !(await comparePassword(password, userRow.password))) {
      return res.status(401).json({ ok: false, message: '用户名或密码错误。' })
    }

    const token = createSessionToken()
    await db.execute(`INSERT INTO \`${sessionsTable}\` (token, user_id) VALUES (?, ?)`, [token, userRow.id])
    return res.json({ ok: true, message: '登录成功。', token, user: mapUser(userRow) })
  } catch (error) {
    return res.status(500).json({ ok: false, message: '登录接口调用失败，请稍后再试。', detail: error.message })
  }
})

app.post('/api/logout', async (req, res) => {
  const token = String(req.body?.token || '').trim()
  if (token) await db.execute(`UPDATE \`${sessionsTable}\` SET is_active = 0 WHERE token = ?`, [token])
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

  const [pages] = await db.query(
    `SELECT id, title, slug, icon_label, sort_order, description, content, created_at, updated_at
     FROM \`${featurePagesTable}\`
     ORDER BY sort_order ASC, created_at ASC`,
  )

  return res.json({ ok: true, user: mapUser(auth.user), stats: await getStats(), pages })
})

app.post('/api/views', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return
  const pageKey = String(req.body?.pageKey || '').trim()
  if (!pageKey) return res.status(400).json({ ok: false, message: '页面标识不能为空。' })

  await db.execute(`INSERT INTO \`${pageViewsTable}\` (user_id, page_key) VALUES (?, ?)`, [auth.user.id, pageKey])
  return res.json({ ok: true, stats: await getStats() })
})

app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return
  if (!req.file) return res.status(400).json({ ok: false, message: '请选择要上传的头像文件。' })

  const avatarUrl = `/uploads/${req.file.filename}`
  await db.execute(`UPDATE \`${usersTable}\` SET avatar_url = ? WHERE id = ?`, [avatarUrl, auth.user.id])
  const [rows] = await db.execute(`SELECT * FROM \`${usersTable}\` WHERE id = ? LIMIT 1`, [auth.user.id])
  return res.json({ ok: true, message: '头像上传成功。', avatarUrl, user: mapUser(rows[0]) })
})

app.post('/api/pages', async (req, res) => {
  const auth = await requireUser(req, res)
  if (!auth) return

  const title = String(req.body?.title || '').trim()
  const description = String(req.body?.description || '').trim()
  const content = String(req.body?.content || '').trim()
  const iconLabel = String(req.body?.iconLabel || title.slice(0, 2) || 'FX').trim().slice(0, 4).toUpperCase()
  const slug = String(req.body?.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim().replace(/^-+|-+$/g, '')

  if (!title || !slug) return res.status(400).json({ ok: false, message: '功能页标题不能为空。' })

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
  if (!pages.length) return res.status(400).json({ ok: false, message: '排序数据不能为空。' })

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

  if (!id || !title || !slug) return res.status(400).json({ ok: false, message: '功能页信息不完整。' })

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
  if (!id) return res.status(400).json({ ok: false, message: '功能页编号无效。' })
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

  if (!username) return res.status(400).json({ ok: false, message: '用户名不能为空。' })
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
  if (nameRows.length) return res.status(409).json({ ok: false, message: '这个用户名已被占用。' })

  const passwordHash = nextPassword ? await bcrypt.hash(nextPassword, 10) : auth.user.password
  await db.execute(
    `UPDATE \`${usersTable}\` SET username = ?, display_name = ?, bio = ?, avatar_url = ?, password = ? WHERE id = ?`,
    [username, displayName || username, bio, avatarUrl, passwordHash, auth.user.id],
  )
  const [rows] = await db.execute(`SELECT * FROM \`${usersTable}\` WHERE id = ? LIMIT 1`, [auth.user.id])
  return res.json({ ok: true, message: '个人信息已更新。', user: mapUser(rows[0]) })
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
