# Infrastructure Setup Guide

This guide covers the manual steps required to set up the "Nervous System" of Portfolio Prism: the Cloudflare Proxy and the Supabase Hive.

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
    cd tauri-app/infrastructure/cloudflare
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
    - Test the health endpoint: `curl https://<your-worker-url>/health`

---

## Part 2: Supabase Setup (The Hive)

We use Supabase for the community asset database (Hive).

### 2.1 Project Creation
1. Go to [database.new](https://database.new) and create a new project.
2. Note your **Project URL** and **anon public key** from the settings.

### 2.2 Database Schema
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

---

## Part 3: Environment Configuration (Connecting it all)

Now we need to tell the Tauri app where to find these services. Since we are packaging a binary, we can't rely on a local `.env` file for the end user. We have two options:

### Option A: Build-Time Injection (Recommended for MVP)
We hardcode the URLs (but NOT the secrets) into the Python code or a config file before building.

**Files to update:**
1.  **Proxy URL**: Update `tauri-app/src-tauri/python/portfolio_src/data/proxy_client.py`:
    ```python
    DEFAULT_PROXY_URL = "https://your-worker-name.workers.dev"
    ```

2.  **Supabase Config**: Update `tauri-app/src-tauri/python/portfolio_src/data/hive_client.py`:
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
cd tauri-app/src-tauri/python
pyinstaller --noconfirm --clean prism.spec
cp dist/prism ../binaries/prism-aarch64-apple-darwin
```
