import { Hono } from 'hono'

const app = new Hono()

/**
 * 通用 API 处理器
 * 请求示例: /api?token=<TOKEN>&path=<PATH>
 * 注意：path 参数必须以 "/" 开头，代表 ZeroTier API 的后半部分路径。
 */
app.all('/api', async (c: any) => {
  // 从查询参数中获取 token 与 path
  const token = c.req.query('token')
  const path = c.req.query('path')

  if (!token || !path) {
    return c.json(
      { error: 'missing token or path parameter' },
      400,
      { 'Access-Control-Allow-Origin': '*' }
    )
  }

  // 构造完整的 ZeroTier API URL
  const apiUrl = `https://api.zerotier.com/api/v1${path}`

  try {
    // 使用原请求的 method，可以支持 GET/POST/PUT 等其它请求方式
    const response = await fetch(apiUrl, {
      method: c.req.method,
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      // 若需要透传请求体，可使用下面方式：
      body: c.req.method !== 'GET' && c.req.body ? c.req.body : undefined
    })

    const data = await response.json()
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.toString() }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
})

// 其它路径的请求转发给静态资源处理
app.all('*', async (c: any) => {
  return await c.env.ASSETS.fetch(c.req.raw)
})

export default app
