# Infrastructure Setup Guide

> **Last Updated:** 2024-12-15
> **Status:** Cloudflare Worker deployed, Supabase pending configuration

This guide covers the manual steps required to set up the "Nervous System" of Portfolio Prism: the Cloudflare Proxy and the Supabase Hive.

---

## Quick Status Check

| Component | Status | URL |
|-----------|--------|-----|
| Cloudflare Worker | Deployed | `https://portfolio-prism-proxy.<subdomain>.workers.dev` |
| Supabase (Hive) | Pending | Needs table creation and RLS policies |

---

## Part 1: Cloudflare Worker Setup (The Proxy)

We use Cloudflare Workers to hide our Finnhub API key and handle rate limiting.

### 1.1 Prerequisites
- A Cloudflare account (Free tier is fine)
- Node.js and npm installed

### 1.2 Deployment Steps

1.  **Install Wrangler CLI**:
    > **Note**: Wrangler is a Node.js tool. You do **not** need your Python virtual environment (`venv`) activated for this step.
    
    ```bash
    npm install -g wrangler
    ```

2.  **Login to Cloudflare**:
    ```bash
    wrangler login
    ```
    *This will open a browser window to authorize Wrangler.*

3.  **Navigate to Worker Directory**:
    ```bash
    cd infrastructure/cloudflare
    ```

4.  **Set Secrets (Important!)**:
    Run the command for each secret. Wrangler will **prompt you** to paste the value.
    > **Tip**: Paste the **RAW** value when prompted. Do not wrap it in quotes (`""`) unless the quotes are part of the key itself.
    
    ```bash
    # Your Finnhub API Key
    wrangler secret put FINNHUB_API_KEY
    # (Output: Enter the secret value: <PASTE KEY HERE>)
    
    # Optional: GitHub configuration
    # Token Permissions needed:
    # - Classic Token: 'repo' (for different orgs) or 'public_repo' (if public)
    # - Fine-grained Token: 'Issues' (Read and Write) on the target repository
    wrangler secret put GITHUB_TOKEN
    wrangler secret put GITHUB_REPO
    # Format: "owner/repo" (e.g., "davidhelmus/portfolio-master")
    ```
    
    > **Note**: You can update these secrets at any time by running the commands again.

5.  **Deploy**:
    ```bash
    wrangler deploy
    ```

6.  **Verify**:
    - Note the URL output (e.g., `https://portfolio-prism-proxy.<your-subdomain>.workers.dev`)
    - Test the health endpoint:
      ```bash
      curl https://<your-worker-url>/health
      # Expected: {"status":"ok","timestamp":"2024-..."}
      ```

### 1.3 Available Endpoints

| Endpoint | Method | Purpose | Required Secrets |
|----------|--------|---------|------------------|
| `/health` | GET | Heartbeat check | None |
| `/api/finnhub/profile` | POST | Stock profile lookup | `FINNHUB_API_KEY` |
| `/api/finnhub/quote` | POST | Current stock price | `FINNHUB_API_KEY` |
| `/api/finnhub/search` | POST | Symbol search | `FINNHUB_API_KEY` |
| `/feedback` | POST | Create GitHub issue | `GITHUB_TOKEN`, `GITHUB_REPO` |

### 1.4 CORS Configuration

The worker allows requests from:
- `tauri://localhost` (Production Tauri app)
- `http://localhost:1420` (Vite dev server)
- `http://localhost:8501` (Legacy Streamlit - can be removed)

---

## Part 2: Supabase Setup (The Hive)

We use Supabase for the community asset database (Hive). This enables users to optionally contribute ISIN/ticker mappings to help others.

> **Status:** Account exists, needs table configuration.

### 2.1 Project Creation
1. Go to [database.new](https://database.new) and create a new project.
2. Choose a strong database password (save it securely).
3. Select a region close to your users (e.g., `eu-central-1` for European users).
4. Wait for the project to provision (~2 minutes).

### 2.2 Get Your Keys
Navigate to **Settings > API** in your Supabase dashboard:

| Key | Where to Use | Safe to Expose? |
|-----|--------------|-----------------|
| Project URL | Client app, `.env` | Yes |
| `anon` public key | Client app, `.env` | Yes (RLS protects data) |
| `service_role` key | Server-side only | **NO - NEVER expose** |

### 2.3 Database Schema
Go to the **SQL Editor** in Supabase and run this script:

```sql
-- Create the master universe table
CREATE TABLE master_universe (
    isin TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    name TEXT,
    asset_type TEXT DEFAULT 'Unknown',
    contributor_count INTEGER DEFAULT 1,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    added_by UUID DEFAULT auth.uid()
);

-- Enable Row Level Security (Security Policy)
ALTER TABLE master_universe ENABLE ROW LEVEL SECURITY;

-- Policy 1: Everyone can read (Public download)
CREATE POLICY "Public read" ON master_universe
    FOR SELECT USING (true);

-- Policy 2: Authenticated users can insert/update (Contribution)
CREATE POLICY "Auth write" ON master_universe
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    
CREATE POLICY "Auth update" ON master_universe
    FOR UPDATE USING (auth.role() = 'authenticated');
```

### 2.4 Verify Supabase Setup

Test your configuration:

```bash
# Test read access (should return empty array or data)
curl "https://YOUR_PROJECT_ID.supabase.co/rest/v1/master_universe?select=*&limit=5" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

---

## Part 3: Environment Configuration (Connecting it all)

Now we need to tell the Tauri app where to find these services. Since we are packaging a binary, we can't rely on a local `.env` file for the end user. We have two options:

### Option A: Build-Time Injection (Recommended for MVP)
We hardcode the URLs (but NOT the secrets) into the Python code or a config file before building.

**Files to update:**
1.  **Proxy URL**: Update `src-tauri/python/portfolio_src/data/proxy_client.py`:
    ```python
    DEFAULT_PROXY_URL = "https://your-worker-name.workers.dev"
    ```

2.  **Supabase Config**: Update `src-tauri/python/portfolio_src/data/hive_client.py`:
    ```python
    # Configured defaults
    DEFAULT_SUPABASE_URL = "https://your-project.supabase.co"
    DEFAULT_SUPABASE_KEY = "your-public-anon-key" 
    # It is safe to embed the anon key in the client app
    ```

### Option B: Runtime Environment Variables
The user sets environment variables before launching the app.

- `PRISM_PROXY_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

---

## 4. Final Rebuild

After updating the URLs in the code (Option A), verify and rebuild one last time:

```bash
cd src-tauri/python
pyinstaller --noconfirm --clean prism.spec
cp dist/prism ../binaries/prism-aarch64-apple-darwin
```

---

## 5. Troubleshooting

### Cloudflare Worker Issues

| Problem | Solution |
|---------|----------|
| `wrangler: command not found` | Run `npm install -g wrangler` |
| 401 Unauthorized | Re-run `wrangler login` |
| Secrets not working | Verify with `wrangler secret list` |
| CORS errors in browser | Check origin is in allowedOrigins array |

### Supabase Issues

| Problem | Solution |
|---------|----------|
| Permission denied | Check RLS policies are created |
| 401 Unauthorized | Verify anon key is correct |
| Empty response | Table may be empty (expected initially) |

---

## 6. Security Checklist

Before going to production:

- [ ] Finnhub API key is set via `wrangler secret put`, NOT in code
- [ ] GitHub token has minimal required permissions
- [ ] Supabase RLS policies are enabled
- [ ] `service_role` key is NEVER in client code
- [ ] Worker CORS only allows known origins
