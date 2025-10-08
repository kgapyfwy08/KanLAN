import { Hono } from 'hono'

const app = new Hono()

/**
 * 通用 API 处理器
 * 请求示例: /api?token=<TOKEN>&path=<PATH>
 * 注意：path 参数必须以 "/" 开头，代表 ZeroTier API 的后半部分路径。
 */
app.all('/api', async (c: any) => {
  if (c.req.method.toUpperCase() === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
      }
    })
  }

  const token = c.req.query('token')
  const path = c.req.query('path')

  if (!token || !path) {
    return c.json(
      { error: 'missing token or path parameter' },
      400,
      {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
      }
    )
  }

  if (!path.startsWith('/')) {
    return c.json(
      { error: 'path must start with "/"' },
      400,
      {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
      }
    )
  }

  const apiUrl = `https://api.zerotier.com/api/v1${path}`

  try {
    const method = c.req.method.toUpperCase()
    const headers: Record<string, string> = {
      'Authorization': `token ${token}`
    }

    const incomingContentType = c.req.header('content-type')
    if (incomingContentType) {
      headers['Content-Type'] = incomingContentType
    }

    let body: ArrayBuffer | undefined
    if (!['GET', 'HEAD'].includes(method)) {
      const requestBody = await c.req.arrayBuffer().catch(() => undefined)
      if (requestBody && requestBody.byteLength > 0) {
        body = requestBody
      }
    }

    const response = await fetch(apiUrl, {
      method,
      headers,
      body
    })

    const responseContentType = response.headers.get('content-type') || 'application/json'
    const isJson = responseContentType.includes('application/json')
    const responseBody = isJson ? await response.json() : await response.text()

    return new Response(isJson ? JSON.stringify(responseBody) : responseBody, {
      status: response.status,
      headers: {
        'Content-Type': responseContentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
      }
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.toString() }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
      }
    })
  }
})

// 其它路径的请求转发给静态资源处理
app.all('*', async (c: any) => {
  return await c.env.ASSETS.fetch(c.req.raw)
})

export default app
