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
 * Search for existing GitHub issues by error hash
 */
async function findExistingIssue(errorHash, env) {
    if (!errorHash) return null;

    const query = `repo:${env.GITHUB_REPO} is:issue is:open "${errorHash}"`;
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `token ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'PortfolioPrism-Worker',
        },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.total_count > 0 ? data.items[0] : null;
}

/**
 * Add a comment to an existing issue
 */
async function addIssueComment(issueNumber, message, env) {
    const url = `https://api.github.com/repos/${env.GITHUB_REPO}/issues/${issueNumber}/comments`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `token ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'PortfolioPrism-Worker',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            body: `## Additional Occurrence\n\n${message}\n\n*Auto-updated by Portfolio Prism Sentinel*`,
        }),
    });

    return response.ok;
}

function formatFeedbackTitle(type, message) {
    const typeLabels = {
        'functional': 'BUG',
        'feature': 'FEATURE',
        'ui_ux': 'UI/UX',
        'critical': 'CRITICAL'
    };
    const label = typeLabels[type] || type.toUpperCase();
    const truncated = message.length > 50 ? message.substring(0, 47) + '...' : message;
    return `[${label}] ${truncated}`;
}

function mapFeedbackLabels(type) {
    const labelMap = {
        'functional': ['bug', 'user-feedback'],
        'feature': ['enhancement', 'user-feedback'],
        'ui_ux': ['ui/ux', 'user-feedback'],
        'critical': ['bug', 'critical', 'user-feedback']
    };
    return labelMap[type] || [type, 'user-feedback'];
}

function formatFeedbackBody(message, metadata) {
    const view = metadata.view || 'unknown';
    const version = metadata.version || 'dev';
    const platform = metadata.platform || 'unknown';
    const environment = metadata.environment || 'unknown';
    const timestamp = metadata.timestamp || new Date().toISOString();

    let body = `## Description\n\n${message}\n\n`;
    body += `## Context\n\n`;
    body += `| Field | Value |\n`;
    body += `|-------|-------|\n`;
    body += `| View | ${view} |\n`;
    body += `| Version | ${version} |\n`;
    body += `| Platform | ${platform} |\n`;
    body += `| Environment | ${environment} |\n`;
    body += `| Timestamp | ${timestamp} |\n`;

    if (metadata.lastSync) {
        body += `| Last Sync | ${metadata.lastSync} |\n`;
    }

    body += `\n---\n*Submitted via Portfolio Prism Feedback*`;
    return body;
}

/**
 * Create GitHub issue for feedback or auto-report
 */
async function createGitHubIssue(type, title, message, labels, env, errorHash = null) {
    const body = errorHash 
        ? `${message}\n\n<!-- error_hash: ${errorHash} -->`
        : message;

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
                title: title || `[${type.toUpperCase()}] User Feedback`,
                body: body,
                labels: labels || [type, 'user-feedback'],
            }),
        }
    );

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${err}`);
    }

    const issue = await response.json();
    return { issue_url: issue.html_url };
}

async function handleReport(body, env) {
    const { type, title, message, labels, error_hash } = body;

    const existingIssue = await findExistingIssue(error_hash, env);

    if (existingIssue) {
        await addIssueComment(existingIssue.number, message, env);
        return { issue_url: existingIssue.html_url, status: 'updated' };
    } else {
        const result = await createGitHubIssue(type, title, message, labels, env, error_hash);
        return { ...result, status: 'created' };
    }
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
                    const feedbackTitle = formatFeedbackTitle(body.type, body.message);
                    const feedbackBody = formatFeedbackBody(body.message, body.metadata || {});
                    const feedbackLabels = mapFeedbackLabels(body.type);
                    data = await createGitHubIssue(
                        body.type, 
                        feedbackTitle, 
                        feedbackBody,
                        feedbackLabels,
                        env
                    );
                    break;

                case '/report':
                    data = await handleReport(body, env);
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
