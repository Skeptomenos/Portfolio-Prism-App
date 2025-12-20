/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_PROXY_URL: string;
  readonly VITE_APP_VERSION: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
