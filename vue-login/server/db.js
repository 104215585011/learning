import crypto from 'crypto'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const connectionOptions = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
}

const databaseName = process.env.MYSQL_DATABASE || 'vue_login'
const usersTable = process.env.MYSQL_USERS_TABLE || 'users'
const sessionsTable = 'user_sessions'
const featurePagesTable = 'feature_pages'
const pageViewsTable = 'page_views'

export const createServerConnection = () => mysql.createConnection(connectionOptions)

export const db = mysql.createPool({
  ...connectionOptions,
  database: databaseName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

const addColumnIfMissing = async (connection, tableName, columnName, definition) => {
  const [rows] = await connection.query(
    `
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [databaseName, tableName, columnName],
  )

  if (!rows.length) {
    await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`)
  }
}

export const ensureDatabase = async () => {
  const connection = await createServerConnection()

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
    await connection.query(`USE \`${databaseName}\``)

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`${usersTable}\` (
        id INT NOT NULL AUTO_INCREMENT,
        username VARCHAR(50) NOT NULL,
        password VARCHAR(255) NOT NULL,
        display_name VARCHAR(80) NULL,
        avatar_url VARCHAR(500) NULL,
        bio TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_username (username)
      )
    `)

    await addColumnIfMissing(connection, usersTable, 'display_name', '`display_name` VARCHAR(80) NULL')
    await addColumnIfMissing(connection, usersTable, 'avatar_url', '`avatar_url` VARCHAR(500) NULL')
    await addColumnIfMissing(connection, usersTable, 'bio', '`bio` TEXT NULL')
    await addColumnIfMissing(
      connection,
      usersTable,
      'updated_at',
      '`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    )

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`${sessionsTable}\` (
        id INT NOT NULL AUTO_INCREMENT,
        token VARCHAR(128) NOT NULL,
        user_id INT NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_token (token),
        KEY idx_active_last_seen (is_active, last_seen),
        CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES \`${usersTable}\` (id) ON DELETE CASCADE
      )
    `)

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`${featurePagesTable}\` (
        id INT NOT NULL AUTO_INCREMENT,
        title VARCHAR(80) NOT NULL,
        slug VARCHAR(80) NOT NULL,
        icon_label VARCHAR(4) NOT NULL DEFAULT 'FX',
        sort_order INT NOT NULL DEFAULT 0,
        description VARCHAR(255) NULL,
        content TEXT NULL,
        created_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_slug (slug),
        CONSTRAINT fk_feature_page_user FOREIGN KEY (created_by) REFERENCES \`${usersTable}\` (id) ON DELETE SET NULL
      )
    `)

    await addColumnIfMissing(connection, featurePagesTable, 'sort_order', '`sort_order` INT NOT NULL DEFAULT 0')
    await connection.query(`UPDATE \`${featurePagesTable}\` SET sort_order = id WHERE sort_order = 0`)

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`${pageViewsTable}\` (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NULL,
        page_key VARCHAR(80) NOT NULL,
        viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_page_key (page_key),
        CONSTRAINT fk_page_view_user FOREIGN KEY (user_id) REFERENCES \`${usersTable}\` (id) ON DELETE SET NULL
      )
    `)

    await connection.query(
      `INSERT INTO \`${usersTable}\` (username, password, display_name, avatar_url, bio)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         password = VALUES(password),
         display_name = COALESCE(display_name, VALUES(display_name)),
         avatar_url = COALESCE(avatar_url, VALUES(avatar_url)),
         bio = COALESCE(bio, VALUES(bio))`,
      [
        'admin',
        '123456',
        '系统管理员',
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
        '负责维护系统公告、功能页和站点总览数据。',
      ],
    )

    await connection.query(
      `INSERT INTO \`${featurePagesTable}\` (title, slug, icon_label, sort_order, description, content)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         description = VALUES(description),
         content = VALUES(content)`,
      [
        '运营日报',
        'operations-report',
        'OP',
        1,
        '查看今天的站点波动、活跃时段和重点提醒。',
        '这里可以放日报、待办、值班说明，后续你也可以在左侧新增更多功能页。',
      ],
    )
  } finally {
    await connection.end()
  }
}

export const createSessionToken = () => crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36)

export {
  databaseName,
  featurePagesTable,
  pageViewsTable,
  sessionsTable,
  usersTable,
}
