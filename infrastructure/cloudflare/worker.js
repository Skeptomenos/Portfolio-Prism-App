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
};

// In-memory rate limit store (use KV in production)
const rateLimitStore = new Map();

/**
 * Check rate limit for an IP
 */
function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT.windowMs;

    // Get or create entry
    let entry = rateLimitStore.get(ip);
    if (!entry || entry.windowStart < windowStart) {
        entry = { windowStart: now, count: 0 };
    }

    entry.count++;
    rateLimitStore.set(ip, entry);

    return entry.count <= RATE_LIMIT.maxRequests;
}

/**
 * CORS headers for responses
 */
function corsHeaders(origin) {
    const allowedOrigins = [
        'tauri://localhost',
        'http://localhost:1420',
        'http://localhost:8501',
        'https://localhost'
    ];

    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

    return {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

/**
 * Handle CORS preflight
 */
function handleOptions(request) {
    const origin = request.headers.get('Origin') || '';
    return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
    });
}

/**
 * Proxy request to Finnhub API
 */
async function proxyFinnhub(endpoint, params, env) {
    const url = new URL(`https://finnhub.io/api/v1/${endpoint}`);

    // Add API key from secrets
    params.token = env.FINNHUB_API_KEY;

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());
    return response.json();
}

/**
 * Create GitHub issue for feedback
 */
async function createGitHubIssue(type, message, metadata, env) {
    const response = await fetch(
        `https://api.github.com/repos/${env.GITHUB_REPO}/issues`,
        {
            method: 'POST',
            headers: {
                'Authorization': `token ${env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'PortfolioPrism-Worker',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: `[${type.toUpperCase()}] User Feedback`,
                body: `## Feedback\n\n${message}\n\n## Metadata\n\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\``,
                labels: [type, 'user-feedback'],
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
    }

    const issue = await response.json();
    return { issue_url: issue.html_url };
}

/**
 * Main request handler
 */
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return handleOptions(request);
        }

        // Check rate limit
        if (!checkRateLimit(ip)) {
            return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders(origin),
                },
            });
        }

        try {
            let data;
            const body = request.method === 'POST' ? await request.json() : {};

            // Route handlers
            switch (url.pathname) {
                case '/api/finnhub/profile':
                    data = await proxyFinnhub('stock/profile2', { symbol: body.symbol }, env);
                    break;

                case '/api/finnhub/quote':
                    data = await proxyFinnhub('quote', { symbol: body.symbol }, env);
                    break;

                case '/api/finnhub/search':
                    data = await proxyFinnhub('search', { q: body.q }, env);
                    break;

                case '/feedback':
                    data = await createGitHubIssue(body.type, body.message, body.metadata || {}, env);
                    break;

                case '/health':
                    data = { status: 'ok', timestamp: new Date().toISOString() };
                    break;

                default:
                    return new Response(JSON.stringify({ error: 'Not found' }), {
                        status: 404,
                        headers: {
                            'Content-Type': 'application/json',
                            ...corsHeaders(origin),
                        },
                    });
            }

            return new Response(JSON.stringify(data), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders(origin),
                },
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders(origin),
                },
            });
        }
    },
};
