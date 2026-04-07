import { useState } from 'react'
import './LoginCard.css'

function LoginCard() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })

  const handleSubmit = (event) => {
    event.preventDefault()
    const safeUsername = username.trim()
    const safePassword = password.trim()

    if (!safeUsername || !safePassword) {
      setMessage({ text: '用户名和密码不能为空。', type: 'error' })
      return
    }

    if (safePassword.length < 6) {
      setMessage({ text: '密码长度不能少于 6 位。', type: 'error' })
      return
    }

    setLoading(true)
    setMessage({ text: '', type: '' })

    setTimeout(() => {
      const rememberText = remember ? '（已记住登录）' : ''
      setMessage({
        text: `登录成功，欢迎你：${safeUsername}${rememberText}`,
        type: 'success',
      })
      setLoading(false)
    }, 800)
  }

  return (
    <section className="login-card" aria-labelledby="login-title">
      <h1 id="login-title">欢迎登录</h1>
      <p className="subtitle">请输入账号和密码继续</p>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="username">用户名</label>
        <input
          id="username"
          name="username"
          type="text"
          placeholder="请输入用户名"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />

        <label htmlFor="password">密码</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="请输入密码"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <div className="row">
          <label className="checkbox">
            <input
              id="remember"
              name="remember"
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>记住我</span>
          </label>
          <a href="#" className="link">
            忘记密码？
          </a>
        </div>

        <button id="submit-btn" type="submit" disabled={loading}>
          {loading ? '登录中...' : '登录'}
        </button>

        <p className={`message ${message.type}`} aria-live="polite">
          {message.text}
        </p>
      </form>
    </section>
  )
}

export default LoginCard
