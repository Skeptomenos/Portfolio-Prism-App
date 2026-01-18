/**
 * Portfolio Prism API Proxy - Cloudflare Worker
 *
 * This worker provides:
 * - API key injection for Finnhub and other services
 * - Rate limiting per IP
 * - CORS handling for Tauri clients
 * - Feedback endpoint (creates GitHub issues)
 */

// Rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
}

// Payload size limit (10KB) to prevent abuse on feedback/report endpoints
const MAX_PAYLOAD_SIZE = 10 * 1024 // 10KB

// Input validation patterns
// Stock symbols: 1-10 alphanumeric chars, dots, hyphens (e.g., "AAPL", "BRK.A", "BRK-B")
const SYMBOL_PATTERN = /^[A-Z0-9./-]{1,10}$/i
// Search queries: 1-50 chars, alphanumeric + basic punctuation, no injection patterns
const QUERY_PATTERN = /^[A-Za-z0-9\s./'&,-]{1,50}$/

/**
 * Validate request payload size
 * @param {Request} request - The incoming request
 * @returns {Promise<{valid: boolean, error?: string, size?: number}>}
 */
async function validatePayloadSize(request) {
  // Check Content-Length header first (fast path)
  const contentLength = request.headers.get('Content-Length')
  if (contentLength) {
    const size = parseInt(contentLength, 10)
    if (!isNaN(size) && size > MAX_PAYLOAD_SIZE) {
      return {
        valid: false,
        error: `Payload too large. Maximum size is ${MAX_PAYLOAD_SIZE / 1024}KB.`,
        size,
      }
    }
  }
  return { valid: true }
}

/**
 * Validate Finnhub stock symbol
 * @returns {string|null} Normalized symbol or null if invalid
 */
function validateSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') {
    return null
  }
  const normalized = symbol.trim().toUpperCase()
  if (!SYMBOL_PATTERN.test(normalized)) {
    return null
  }
  return normalized
}

/**
 * Validate Finnhub search query
 * @returns {string|null} Trimmed query or null if invalid
 */
function validateQuery(query) {
  if (!query || typeof query !== 'string') {
    return null
  }
  const trimmed = query.trim()
  if (!QUERY_PATTERN.test(trimmed)) {
    return null
  }
  return trimmed
}

// In-memory rate limit store (fallback when KV is not available)
const rateLimitStore = new Map()

/**
 * Check rate limit for an IP using KV storage (persistent) or in-memory (fallback)
 *
 * KV-based rate limiting provides:
 * - Persistence across worker restarts
 * - Consistency across edge locations
 * - Protection against rate limit bypass via geo-distribution
 *
 * @param {string} ip - Client IP address
 * @param {object} env - Worker environment bindings
 * @returns {Promise<boolean>} - True if request is allowed, false if rate limited
 */
async function checkRateLimit(ip, env) {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT.windowMs

  // Use KV-based rate limiting if available (production)
  if (env.RATE_LIMIT_KV) {
    try {
      const key = `ratelimit:${ip}`
      const stored = await env.RATE_LIMIT_KV.get(key, { type: 'json' })

      let entry = stored
      if (!entry || entry.windowStart < windowStart) {
        entry = { windowStart: now, count: 0 }
      }

      entry.count++

      // Store with TTL matching rate limit window (in seconds)
      // Add buffer to ensure entry persists through the window
      const ttlSeconds = Math.ceil(RATE_LIMIT.windowMs / 1000) + 60
      await env.RATE_LIMIT_KV.put(key, JSON.stringify(entry), {
        expirationTtl: ttlSeconds,
      })

      return entry.count <= RATE_LIMIT.maxRequests
    } catch (err) {
      // KV error - fall through to in-memory rate limiting
      // Log error for observability but don't block requests
      console.error('KV rate limit error, falling back to in-memory:', err.message)
    }
  }

  // Fallback: In-memory rate limiting
  // Note: Resets on worker restart, not shared across edge locations
  let entry = rateLimitStore.get(ip)
  if (!entry || entry.windowStart < windowStart) {
    entry = { windowStart: now, count: 0 }
  }

  entry.count++
  rateLimitStore.set(ip, entry)

  return entry.count <= RATE_LIMIT.maxRequests
}

/**
 * CORS headers for responses
 */
function corsHeaders(origin) {
  const allowedOrigins = [
    'tauri://localhost',
    'http://localhost:1420',
    'http://localhost:8501',
    'https://localhost',
  ]

  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0]

  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

/**
 * Handle CORS preflight
 */
function handleOptions(request) {
  const origin = request.headers.get('Origin') || ''
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  })
}

/**
 * Proxy request to Finnhub API
 */
async function proxyFinnhub(endpoint, params, env) {
  const url = new URL(`https://finnhub.io/api/v1/${endpoint}`)

  // Add API key from secrets
  params.token = env.FINNHUB_API_KEY

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url.toString())
  return response.json()
}

/**
 * Search for existing GitHub issues by error hash
 */
async function findExistingIssue(errorHash, env) {
  if (!errorHash) return null

  const query = `repo:${env.GITHUB_REPO} is:issue is:open "${errorHash}"`
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}`

  const response = await fetch(url, {
    headers: {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'PortfolioPrism-Worker',
    },
  })

  if (!response.ok) return null

  const data = await response.json()
  return data.total_count > 0 ? data.items[0] : null
}

/**
 * Add a comment to an existing issue
 */
async function addIssueComment(issueNumber, message, env) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/issues/${issueNumber}/comments`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'PortfolioPrism-Worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      body: `## Additional Occurrence\n\n${message}\n\n*Auto-updated by Portfolio Prism Sentinel*`,
    }),
  })

  return response.ok
}

function formatFeedbackTitle(type, message) {
  const typeLabels = {
    functional: 'BUG',
    feature: 'FEATURE',
    ui_ux: 'UI/UX',
    critical: 'CRITICAL',
  }
  const label = typeLabels[type] || type.toUpperCase()
  const truncated = message.length > 50 ? message.substring(0, 47) + '...' : message
  return `[${label}] ${truncated}`
}

function mapFeedbackLabels(type) {
  const labelMap = {
    functional: ['bug', 'user-feedback'],
    feature: ['enhancement', 'user-feedback'],
    ui_ux: ['ui/ux', 'user-feedback'],
    critical: ['bug', 'critical', 'user-feedback'],
  }
  return labelMap[type] || [type, 'user-feedback']
}

function formatFeedbackBody(message, metadata) {
  const view = metadata.view || 'unknown'
  const version = metadata.version || 'dev'
  const platform = metadata.platform || 'unknown'
  const environment = metadata.environment || 'unknown'
  const timestamp = metadata.timestamp || new Date().toISOString()

  let body = `## Description\n\n${message}\n\n`
  body += `## Context\n\n`
  body += `| Field | Value |\n`
  body += `|-------|-------|\n`
  body += `| View | ${view} |\n`
  body += `| Version | ${version} |\n`
  body += `| Platform | ${platform} |\n`
  body += `| Environment | ${environment} |\n`
  body += `| Timestamp | ${timestamp} |\n`

  if (metadata.lastSync) {
    body += `| Last Sync | ${metadata.lastSync} |\n`
  }

  body += `\n---\n*Submitted via Portfolio Prism Feedback*`
  return body
}

/**
 * Create GitHub issue for feedback or auto-report
 */
async function createGitHubIssue(type, title, message, labels, env, errorHash = null) {
  const body = errorHash ? `${message}\n\n<!-- error_hash: ${errorHash} -->` : message

  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'PortfolioPrism-Worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: title || `[${type.toUpperCase()}] User Feedback`,
      body: body,
      labels: labels || [type, 'user-feedback'],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`GitHub API error: ${response.status} - ${err}`)
  }

  const issue = await response.json()
  return { issue_url: issue.html_url }
}

async function handleReport(body, env) {
  const { type, title, message, labels, error_hash } = body

  const existingIssue = await findExistingIssue(error_hash, env)

  if (existingIssue) {
    await addIssueComment(existingIssue.number, message, env)
    return { issue_url: existingIssue.html_url, status: 'updated' }
  } else {
    const result = await createGitHubIssue(type, title, message, labels, env, error_hash)
    return { ...result, status: 'created' }
  }
}

/**
 * Main request handler
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || ''
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request)
    }

    // Check rate limit (uses KV if available, falls back to in-memory)
    const allowed = await checkRateLimit(ip, env)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(origin),
        },
      })
    }

    // Validate payload size for endpoints that accept user content (feedback, report)
    // This prevents abuse via oversized payloads that could consume memory/bandwidth
    const payloadEndpoints = ['/feedback', '/report']
    if (request.method === 'POST' && payloadEndpoints.includes(url.pathname)) {
      const sizeCheck = await validatePayloadSize(request)
      if (!sizeCheck.valid) {
        return new Response(JSON.stringify({ error: sizeCheck.error }), {
          status: 413, // Payload Too Large
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
          },
        })
      }
    }

    try {
      let data
      const body = request.method === 'POST' ? await request.json() : {}

      // Route handlers
      switch (url.pathname) {
        case '/api/finnhub/profile': {
          const symbol = validateSymbol(body.symbol)
          if (!symbol) {
            return new Response(
              JSON.stringify({
                error: 'Invalid symbol format. Must be 1-10 alphanumeric characters.',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
              }
            )
          }
          data = await proxyFinnhub('stock/profile2', { symbol }, env)
          break
        }

        case '/api/finnhub/quote': {
          const symbol = validateSymbol(body.symbol)
          if (!symbol) {
            return new Response(
              JSON.stringify({
                error: 'Invalid symbol format. Must be 1-10 alphanumeric characters.',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
              }
            )
          }
          data = await proxyFinnhub('quote', { symbol }, env)
          break
        }

        case '/api/finnhub/search': {
          const query = validateQuery(body.q)
          if (!query) {
            return new Response(
              JSON.stringify({
                error: 'Invalid search query. Must be 1-50 alphanumeric characters.',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
              }
            )
          }
          data = await proxyFinnhub('search', { q: query }, env)
          break
        }

        case '/feedback':
          const feedbackTitle = formatFeedbackTitle(body.type, body.message)
          const feedbackBody = formatFeedbackBody(body.message, body.metadata || {})
          const feedbackLabels = mapFeedbackLabels(body.type)
          data = await createGitHubIssue(
            body.type,
            feedbackTitle,
            feedbackBody,
            feedbackLabels,
            env
          )
          break

        case '/report':
          data = await handleReport(body, env)
          break

        case '/health':
          data = { status: 'ok', timestamp: new Date().toISOString() }
          break

        default:
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(origin),
            },
          })
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(origin),
        },
      })
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(origin),
        },
      })
    }
  },
}
