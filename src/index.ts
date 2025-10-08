import { Hono } from 'hono'

type Bindings = {
  ASSETS: Fetcher
}

const ZT_BASE_URL = 'https://api.zerotier.com/api/v1'

const app = new Hono<{ Bindings: Bindings }>()

const allowCors = (headers: HeadersInit = {}) => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ZT-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  ...headers
})

const getZeroTierToken = (c: any) => {
  const queryToken = c.req.query('token')
  const headerAuth = c.req.header('Authorization')
  const headerToken = c.req.header('X-ZT-Token')

  if (queryToken) return queryToken

  if (headerToken) return headerToken

  if (headerAuth) {
    const [scheme, value] = headerAuth.split(' ')
    if (value && scheme.toLowerCase() === 'bearer') {
      return value
    }
    return headerAuth.replace(/^token\s+/i, '')
  }

  return null
}

const normalizePath = (path: string | null | undefined) => {
  if (!path) return null
  if (!path.startsWith('/')) {
    return null
  }
  return path
}

const pickForwardHeaders = (source: Headers) => {
  const headers = new Headers(allowCors())
  const allowed = ['content-type', 'content-length', 'etag']
  source.forEach((value, key) => {
    if (allowed.includes(key.toLowerCase())) {
      headers.set(key, value)
    }
  })
  return headers
}

const proxyZeroTier = async (c: any, path: string, init: RequestInit = {}) => {
  const token = getZeroTierToken(c)

  if (!token) {
    return c.json({ error: 'missing ZeroTier token' }, 401, allowCors())
  }

  const headers = new Headers(init.headers || {})
  headers.set('Authorization', `token ${token}`)

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }

  try {
    const response = await fetch(`${ZT_BASE_URL}${path}`, {
      ...init,
      headers
    })

    if (response.status === 204) {
      return new Response(null, {
        status: response.status,
        headers: allowCors()
      })
    }

    const responseHeaders = pickForwardHeaders(response.headers)
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    })
  } catch (error: any) {
    return c.json({ error: error?.message || 'upstream request failed' }, 500, allowCors())
  }
}

app.options('/api/*', (c) => new Response(null, { headers: allowCors() }))

/**
 * 通用 API 处理器
 * 请求示例: /api?token=<TOKEN>&path=<PATH>
 * 注意：path 参数必须以 "/" 开头，代表 ZeroTier API 的后半部分路径。
 */
app.all('/api', async (c) => {
  const path = normalizePath(c.req.query('path'))

  if (!path) {
    return c.json({ error: 'missing or invalid path parameter' }, 400, allowCors())
  }

  let body: BodyInit | undefined
  if (!['GET', 'HEAD'].includes(c.req.method)) {
    const contentType = c.req.header('Content-Type') || ''
    if (contentType.includes('application/json')) {
      body = JSON.stringify(await c.req.json())
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      body = await c.req.text()
    } else if (contentType.includes('text/plain')) {
      body = await c.req.text()
    } else if (contentType.includes('multipart/form-data')) {
      body = await c.req.arrayBuffer()
    } else {
      const rawBody = await c.req.arrayBuffer()
      body = rawBody
    }
  }

  const headers: HeadersInit = {}
  const incomingContentType = c.req.header('Content-Type')
  if (incomingContentType) {
    ;(headers as Record<string, string>)['Content-Type'] = incomingContentType
  }

  return proxyZeroTier(c, path, {
    method: c.req.method,
    body,
    headers
  })
})

// REST 风格的 ZeroTier API 封装
app.get('/api/networks', (c) => {
  return proxyZeroTier(c, '/network')
})

app.get('/api/networks/:netId', (c) => {
  const netId = c.req.param('netId')
  return proxyZeroTier(c, `/network/${netId}`)
})

app.get('/api/networks/:netId/members', (c) => {
  const netId = c.req.param('netId')
  return proxyZeroTier(c, `/network/${netId}/member`)
})

app.get('/api/networks/:netId/members/:memberId', (c) => {
  const netId = c.req.param('netId')
  const memberId = c.req.param('memberId')
  return proxyZeroTier(c, `/network/${netId}/member/${memberId}`)
})

app.patch('/api/networks/:netId/members/:memberId', async (c) => {
  const netId = c.req.param('netId')
  const memberId = c.req.param('memberId')
  const payload = await c.req.json().catch(() => null)

  if (!payload) {
    return c.json({ error: 'invalid JSON payload' }, 400, allowCors())
  }

  return proxyZeroTier(c, `/network/${netId}/member/${memberId}`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  })
})

app.delete('/api/networks/:netId/members/:memberId', (c) => {
  const netId = c.req.param('netId')
  const memberId = c.req.param('memberId')
  return proxyZeroTier(c, `/network/${netId}/member/${memberId}`, {
    method: 'DELETE'
  })
})

// 其它路径的请求转发给静态资源处理
app.all('*', async (c) => {
  return await c.env.ASSETS.fetch(c.req.raw)
})

export default app
