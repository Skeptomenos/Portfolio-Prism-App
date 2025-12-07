import { listen } from "@tauri-apps/api/event";

type PythonReadyPayload = {
  port: number;
  status: string;
};

async function init() {
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.textContent = "Waiting for Python brain...";

  console.log("Listening for python-ready event...");
  await listen<PythonReadyPayload>("python-ready", (event) => {
    console.log("Python brain ready:", event.payload);
    if (statusEl) statusEl.textContent = `Connected! Redirecting to port ${event.payload.port}...`;

    // Poll for readiness
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:${event.payload.port}/_stcore/health`);
        if (response.ok) {
          clearInterval(checkInterval);
          if (statusEl) statusEl.textContent = `Target Acquired! Redirecting to port ${event.payload.port}...`;
          window.location.replace(`http://localhost:${event.payload.port}`);
        }
      } catch (e) {
        console.log("Waiting for Streamlit to be ready...");
      }
    }, 500);

    // Give up after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (statusEl) statusEl.textContent = "Error: Streamlit brain timed out.";
    }, 30000);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  init();
});
