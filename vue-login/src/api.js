const parseJson = async (response) => {
  const text = await response.text()
  return text ? JSON.parse(text) : {}
}

export const apiRequest = async (path, options = {}) => {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const data = await parseJson(response)

  if (!response.ok || data.ok === false) {
    throw new Error(data.message || '请求失败，请稍后再试。')
  }

  return data
}
