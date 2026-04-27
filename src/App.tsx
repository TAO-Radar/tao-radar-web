import { useEffect, useState } from "react";

import "./App.css";
import { PortfolioSettingsPage } from "./PortfolioSettingsPage";

type AppPage = "home" | "portfolio-settings";
const SCRIPTABLE_WEB_MAIN_URL =
  "https://widgets.taoradar.space/main/web-main/web-main.js";
const TAO_STATS_KEY_VALIDATE_URL = "https://management-api.taostats.io/api/v1/key/validate";
const STORED_AUTH_SETTINGS_KEY = "taoradar.authSettings";

type AuthState = "idle" | "validating" | "authorized" | "invalid";

function applyLoaderParams(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((out, [token, value]) => out.split(token).join(value), template);
}

function hasUnresolvedPlaceholders(content: string): boolean {
  return /\$\{[A-Z0-9_]+\}/.test(content);
}

function triggerFileDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/javascript;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function getPageFromHash(hash: string): AppPage {
  return hash === "#/portfolio-settings" ? "portfolio-settings" : "home";
}

function goToPage(page: AppPage): void {
  window.location.hash = page === "portfolio-settings" ? "/portfolio-settings" : "/";
}

type HomePageProps = {
  apiKey: string;
  apiProvider: string;
  shouldPersistApiKey: boolean;
  authState: AuthState;
  onAuthorizeSubmit: (
    nextApiKey: string,
    nextApiProvider: string,
    persistApiKey: boolean,
  ) => Promise<void>;
};

function HomePage({
  apiKey,
  apiProvider,
  shouldPersistApiKey,
  authState,
  onAuthorizeSubmit,
}: HomePageProps) {
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [modalApiKey, setModalApiKey] = useState(apiKey);
  const [modalApiProvider, setModalApiProvider] = useState(apiProvider || "TaoStats");
  const [modalPersistApiKey, setModalPersistApiKey] = useState(shouldPersistApiKey);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAltSetupOpen, setIsAltSetupOpen] = useState(false);

  const authButtonLabel =
    authState === "validating"
      ? "Authorizing..."
      : authState === "authorized"
        ? `Authorized (${apiProvider || "TaoStats"})`
        : "Authorize";
  const canDownloadLoader = authState === "authorized" && !!apiKey.trim();

  const onDownloadLoader = async () => {
    setDownloadError(null);
    setDownloadStatus(null);

    if (!apiKey.trim()) {
      setDownloadError("API key is required to download the Scriptable loader.");
      return;
    }

    try {
      setDownloadStatus("Preparing loader...");
      const response = await fetch(SCRIPTABLE_WEB_MAIN_URL, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Failed to fetch loader template (HTTP ${response.status})`);
      }

      const template = await response.text();
      const customized = applyLoaderParams(template, {
        "${API_KEY}": apiKey.trim(),
        "${API_PROVIDER}": apiProvider.trim() || "TaoStats",
      });
      if (hasUnresolvedPlaceholders(customized)) {
        throw new Error("Template still contains unresolved placeholders.");
      }
      const outputName = "taoradar-web-main.js";
      triggerFileDownload(outputName, customized);
      setDownloadStatus(`Downloaded ${outputName}`);
    } catch (e) {
      setDownloadStatus(null);
      setDownloadError(e instanceof Error ? e.message : "Failed to download loader.");
    }
  };

  const onOpenApiModal = () => {
    setModalApiKey(apiKey);
    setModalApiProvider(apiProvider || "TaoStats");
    setModalPersistApiKey(shouldPersistApiKey);
    setAuthError(null);
    setIsApiModalOpen(true);
  };

  const onSaveApiSettings = async () => {
    setAuthError(null);
    try {
      await onAuthorizeSubmit(modalApiKey, modalApiProvider || "TaoStats", modalPersistApiKey);
      setIsApiModalOpen(false);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Authorization failed");
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src="https://avatars.githubusercontent.com/u/231471174?s=200&v=4"
            alt="TAO Radar logo"
            className="h-10 w-10 rounded-md border border-zinc-700 object-cover"
          />
          <h1 className="text-3xl font-semibold text-emerald-400">TAO Radar Web</h1>
        </div>
        <button
          type="button"
          onClick={onOpenApiModal}
          className="rounded-md border border-cyan-700 px-3 py-2 text-sm font-semibold text-cyan-300 hover:border-cyan-500 disabled:opacity-60"
          disabled={authState === "validating"}
        >
          {authButtonLabel}
        </button>
      </div>
      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-semibold text-zinc-200">Quick flow</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-400">
          <li>Authorize your API key</li>
          <li>Download TAO Radar Bootstrap script</li>
          <li>Open Portfolio or Metagraph and get payload</li>
          <li>Paste payload into Scriptable widget parameter</li>
        </ol>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-medium text-zinc-100">Portfolio</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Set addresses, check balance changes, and copy the parameter for the portfolio widget.
          </p>
          <button
            type="button"
            onClick={() => goToPage("portfolio-settings")}
            className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Open Portfolio Settings
          </button>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-medium text-zinc-100">Metagraph</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Configure and generate the parameter for the metagraph widget in a future update.
          </p>
          <button
            type="button"
            disabled
            className="mt-4 cursor-not-allowed rounded-md bg-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 opacity-70"
          >
            Metagraph (Coming Soon)
          </button>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 md:col-span-2">
          <h2 className="text-lg font-medium text-zinc-100">2. Download Scriptable Loader</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Use Authorize to set API values, then download TAO Radar Bootstrap{" "}
            <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-200">web-main.js</code> with placeholders
            injected.
          </p>
          <div className="mt-4 grid gap-3">
            <button
              type="button"
              onClick={() => void onDownloadLoader()}
              disabled={!canDownloadLoader}
              className="rounded-md border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-300 hover:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download web-main.js
            </button>
            {!canDownloadLoader && (
              <p className="text-xs text-zinc-500">Authorize first to enable loader download.</p>
            )}
            {downloadStatus && <p className="text-xs text-cyan-300">{downloadStatus}</p>}
            {downloadError && <p className="text-xs text-red-300">{downloadError}</p>}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-zinc-100">Alternative Direct Setup</h2>
            <button
              type="button"
              onClick={() => setIsAltSetupOpen((prev) => !prev)}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500"
            >
              {isAltSetupOpen ? "Hide" : "Show"}
            </button>
          </div>
          {isAltSetupOpen && (
            <>
              <p className="mt-2 text-sm text-zinc-400">
                You can also get the loader directly from widgets.taoradar.space and configure it manually.
              </p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-300">
                <li>Open the hosted loader file page.</li>
                <li>
                  Copy raw file content into a new Scriptable script named{" "}
                  <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-200">web-main</code>.
                </li>
                <li>
                  Replace{" "}
                  <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-200">${"{API_KEY}"}</code> with your API
                  key and <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-200">${"{API_PROVIDER}"}</code>{" "}
                  with <code className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-200">TaoStats</code>.
                </li>
                <li>Save and run the script once in app mode, then use it as widget script.</li>
              </ol>
              <a
                href="https://widgets.taoradar.space/main/web-main/web-main.js"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-sm font-medium text-cyan-300 hover:text-cyan-200"
              >
                Open web-main.js on widgets.taoradar.space
              </a>
            </>
          )}
        </div>
      </div>

      {isApiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-lg border border-zinc-700 bg-zinc-900 p-4">
            <h2 className="text-lg font-semibold text-zinc-100">API Settings</h2>
            <p className="mt-1 text-xs text-zinc-400">Set API key/provider once for download and fetch flows.</p>

            <div className="mt-4 grid gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-zinc-400">API_KEY</span>
                <input
                  type="password"
                  value={modalApiKey}
                  onChange={(e) => setModalApiKey(e.target.value)}
                  placeholder="tao-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxx"
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-zinc-400">Provider</span>
                <select
                  value={modalApiProvider}
                  onChange={(e) => setModalApiProvider(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-cyan-500"
                >
                  <option value="TaoStats">TaoStats</option>
                  <option value="TaoRadar" disabled>
                    TaoRadar (coming soon)
                  </option>
                </select>
              </label>
            </div>

            <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-300">
              {modalApiProvider === "TaoStats" ? (
                <p>
                  Get your API key at{" "}
                  <a
                    href="https://taostats.io/pro/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-300 hover:text-cyan-200"
                  >
                    taostats.io/pro/api-keys
                  </a>
                  , then paste it into API_KEY.
                </p>
              ) : (
                <p>TaoRadar provider instructions will be available in a future release.</p>
              )}
            </div>
            <label className="mt-3 flex items-start gap-2 rounded-md border border-amber-700/50 bg-amber-950/20 p-3 text-xs text-amber-100">
              <input
                type="checkbox"
                checked={modalPersistApiKey}
                onChange={(e) => setModalPersistApiKey(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Store API key in browser storage (insecure). Any script running in this browser context can
                potentially read it through XSS or malicious extension attacks.
              </span>
            </label>
            <p className="mt-2 text-xs text-zinc-400">
              Learn more:{" "}
              <a
                href="https://auth0.com/blog/secure-browser-storage-the-facts/"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 hover:text-cyan-200"
              >
                Browser storage security risks and attack vectors
              </a>
              .
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsApiModalOpen(false)}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onSaveApiSettings()}
                className="rounded-md bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-600"
              >
                {authState === "validating" ? "Authorizing..." : "Save"}
              </button>
            </div>
            {authError && <p className="mt-2 text-xs text-red-300">{authError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [page, setPage] = useState<AppPage>(() => getPageFromHash(window.location.hash));
  const [apiKey, setApiKey] = useState("");
  const [apiProvider, setApiProvider] = useState("TaoStats");
  const [shouldPersistApiKey, setShouldPersistApiKey] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("idle");

  const onAuthorizeSubmit = async (
    nextApiKey: string,
    nextApiProvider: string,
    persistApiKey: boolean,
  ) => {
    const trimmedKey = nextApiKey.trim();
    const trimmedProvider = nextApiProvider.trim() || "TaoStats";
    setApiKey(trimmedKey);
    setApiProvider(trimmedProvider);
    setShouldPersistApiKey(persistApiKey);

    if (!trimmedKey) {
      setAuthState("invalid");
      throw new Error("API key is required.");
    }

    setAuthState("validating");
    const response = await fetch(
      `${TAO_STATS_KEY_VALIDATE_URL}?apiKeyId=${encodeURIComponent(trimmedKey)}`,
      { method: "GET" },
    );
    if (!response.ok) {
      setAuthState("invalid");
      throw new Error(`Authorization failed (HTTP ${response.status}).`);
    }
    if (persistApiKey) {
      localStorage.setItem(
        STORED_AUTH_SETTINGS_KEY,
        JSON.stringify({
          apiKey: trimmedKey,
          apiProvider: trimmedProvider,
          shouldPersistApiKey: true,
        }),
      );
    } else {
      localStorage.removeItem(STORED_AUTH_SETTINGS_KEY);
    }
    setAuthState("authorized");
  };

  useEffect(() => {
    const onHashChange = () => {
      setPage(getPageFromHash(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORED_AUTH_SETTINGS_KEY);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as {
        apiKey?: string;
        apiProvider?: string;
        shouldPersistApiKey?: boolean;
      };
      const restoredKey = parsed.apiKey?.trim() ?? "";
      if (!restoredKey) {
        localStorage.removeItem(STORED_AUTH_SETTINGS_KEY);
        return;
      }
      setApiKey(restoredKey);
      setApiProvider(parsed.apiProvider?.trim() || "TaoStats");
      setShouldPersistApiKey(Boolean(parsed.shouldPersistApiKey));
      setAuthState("authorized");
    } catch {
      localStorage.removeItem(STORED_AUTH_SETTINGS_KEY);
    }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {page === "portfolio-settings" ? (
        <PortfolioSettingsPage
          onBackHome={() => goToPage("home")}
          apiKey={apiKey}
          apiProvider={apiProvider}
          shouldPersistApiKey={shouldPersistApiKey}
          authState={authState}
          onAuthorizeSubmit={onAuthorizeSubmit}
        />
      ) : (
        <HomePage
          apiKey={apiKey}
          apiProvider={apiProvider}
          shouldPersistApiKey={shouldPersistApiKey}
          authState={authState}
          onAuthorizeSubmit={onAuthorizeSubmit}
        />
      )}
    </div>
  );
}

export default App;
