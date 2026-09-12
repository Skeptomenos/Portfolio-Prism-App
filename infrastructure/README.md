# V1 infrastructure reference

**Classification: Useful V1 reference.** Reconciled: 2026-09-07. This directory belongs to the retained V1 application. Use the [V2 runtime documentation](../v2/README.md) for current setup and the [documentation map](../docs/index.md) for the archive.

The [Cloudflare worker](cloudflare/worker.js) provides the old external API proxy, rate limiting, CORS and feedback issue endpoint. Its [Wrangler configuration](cloudflare/wrangler.toml) stays beside it. Deployment activity, credentials and runtime correctness were not checked during the documentation cleanup. Configuration text is not proof of a live deployment.

V1 still refers to the proxy in [Python proxy client](../src-tauri/python/portfolio_src/data/proxy_client.py), [Python configuration](../src-tauri/python/portfolio_src/config.py), [Vite configuration](../vite.config.ts), and [production Tauri configuration](../src-tauri/tauri.prod.conf.json). V2 has no reference to this worker in the inspected source.

Read this directory only when investigating those V1 dependencies or evaluating an explicit reuse proposal. Verify deployment ownership and consumers before moving or retiring executable files. The documentation cleanup did not change or deploy this code.
