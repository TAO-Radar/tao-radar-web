import { useMemo, useState } from "react";
import { decodeAddress } from "@polkadot/util-crypto";

const RAO_TO_TAO = 1e-9;
const DEFAULT_NETWORK = "finney";
const TAO_STATS_ACCOUNT_URL = "https://api.taostats.io/api/account/latest/v1";
const TAO_STATS_KEY_VALIDATE_URL = "https://management-api.taostats.io/api/v1/key/validate";
const MAX_429_RETRIES = 3;

type TaoStatsAccount = {
  balance_total?: string;
  balance_total_24hr_ago?: string;
};

type AddressRow = {
  address: string;
  totalTao: number | null;
  total24hAgoTao: number | null;
  pnl24hTao: number | null;
  error?: string;
};

type ApiKeyValidation = {
  rateLimit: number;
};

function parseAddresses(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n, ]+/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  );
}

function isValidSs58Address(address: string): boolean {
  try {
    decodeAddress(address);
    return true;
  } catch {
    return false;
  }
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

function shortAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

function formatTao(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "-";
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatSignedTao(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "-";
  const n = v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v > 0 ? `+${n}` : n;
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchWith429Retry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await fetch(input, init);
    if (response.status !== 429 || attempt >= MAX_429_RETRIES) {
      return response;
    }

    attempt += 1;
    const retryAfter = Number(response.headers.get("retry-after"));
    const retryDelayMs = Number.isFinite(retryAfter)
      ? Math.max(1000, retryAfter * 1000)
      : 1000 * 2 ** attempt;

    await wait(retryDelayMs);
  }
}

async function fetchAccount(
  address: string,
  network: string,
  authHeader: string,
): Promise<TaoStatsAccount> {
  const url =
    `${TAO_STATS_ACCOUNT_URL}?address=${encodeURIComponent(address)}` +
    `&network=${encodeURIComponent(network)}&page=1&limit=50`;

  const response = await fetchWith429Retry(
    url,
    {
      method: "GET",
      headers: {
        Authorization: authHeader,
        accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = (await response.json()) as { data?: TaoStatsAccount[] };
  if (!json || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error("No account data");
  }
  return json.data[0];
}

async function fetchApiKeyValidation(
  apiKey: string,
): Promise<ApiKeyValidation> {
  const url = `${TAO_STATS_KEY_VALIDATE_URL}?apiKeyId=${encodeURIComponent(apiKey)}`;
  const response = await fetchWith429Retry(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Key validation failed (HTTP ${response.status})`);
  }
  return (await response.json()) as ApiKeyValidation;
}

type PortfolioSettingsPageProps = {
  onBackHome: () => void;
  apiKey: string;
  apiProvider: string;
  authState: "idle" | "validating" | "authorized" | "invalid";
  onAuthorizeSubmit: (nextApiKey: string, nextApiProvider: string) => Promise<void>;
};

export function PortfolioSettingsPage({
  onBackHome,
  apiKey,
  apiProvider,
  authState,
  onAuthorizeSubmit,
}: PortfolioSettingsPageProps) {
  const [network, setNetwork] = useState(DEFAULT_NETWORK);
  const [addressesText, setAddressesText] = useState(
    "5FqdCPXAM6u9N8fdqRA2RWyQsJeBG63UoQEga4vVAKAAyA4v",
  );
  const [rows, setRows] = useState<AddressRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [modalApiKey, setModalApiKey] = useState(apiKey);
  const [modalApiProvider, setModalApiProvider] = useState(apiProvider || "TaoStats");
  const [authError, setAuthError] = useState<string | null>(null);

  const addresses = useMemo(() => parseAddresses(addressesText), [addressesText]);
  const invalidAddresses = useMemo(
    () => addresses.filter((address) => !isValidSs58Address(address)),
    [addresses],
  );

  const validateInputsForPayload = (): boolean => {
    setShowValidation(true);
    if (!network.trim()) {
      setError("Network is required.");
      return false;
    }
    if (addresses.length === 0) {
      setError("Please provide at least one address.");
      return false;
    }
    if (invalidAddresses.length > 0) {
      const preview = invalidAddresses.slice(0, 3).join(", ");
      const suffix = invalidAddresses.length > 3 ? ` (+${invalidAddresses.length - 3} more)` : "";
      setError(`Invalid SS58 address(es): ${preview}${suffix}`);
      return false;
    }
    return true;
  };

  const validateInputsForFetch = (): boolean => {
    if (!apiKey.trim()) {
      setError("API key is required for fetch requests.");
      return false;
    }
    return validateInputsForPayload();
  };

  const onLookup = async () => {
    setError(null);
    setRows([]);

    if (!validateInputsForFetch()) {
      return;
    }

    setLoading(true);
    try {
      let effectiveRateLimit = 5;
      try {
        const validation = await fetchApiKeyValidation(apiKey.trim());
        if (Number.isFinite(validation.rateLimit) && validation.rateLimit > 0) {
          effectiveRateLimit = validation.rateLimit;
        }
      } catch {
        // Optional optimization only; we still rely on 429 retry handling.
      }

      const concurrency = Math.max(1, Math.min(effectiveRateLimit, 5));
      const nextRows = await Promise.all(
        (() => {
          const chunks: string[][] = [];
          for (let i = 0; i < addresses.length; i += concurrency) {
            chunks.push(addresses.slice(i, i + concurrency));
          }

          return chunks;
        })().map(async (chunk) => {
          const chunkRows = await Promise.all(
            chunk.map(async (address): Promise<AddressRow> => {
              try {
                const account = await fetchAccount(address, network, apiKey.trim());
                const balanceTotal = toNumber(account.balance_total);
                const balanceTotal24hAgo = toNumber(account.balance_total_24hr_ago);

                if (!Number.isFinite(balanceTotal) || !Number.isFinite(balanceTotal24hAgo)) {
                  return {
                    address,
                    totalTao: null,
                    total24hAgoTao: null,
                    pnl24hTao: null,
                    error: "Invalid balance values in response",
                  };
                }

                const totalTao = balanceTotal * RAO_TO_TAO;
                const total24hAgoTao = balanceTotal24hAgo * RAO_TO_TAO;
                const pnl24hTao = (balanceTotal - balanceTotal24hAgo) * RAO_TO_TAO;

                return { address, totalTao, total24hAgoTao, pnl24hTao };
              } catch (e) {
                return {
                  address,
                  totalTao: null,
                  total24hAgoTao: null,
                  pnl24hTao: null,
                  error: e instanceof Error ? e.message : "Unknown error",
                };
              }
            }),
          );
          return chunkRows;
        }),
      );

      setRows(nextRows.flat());
    } finally {
      setLoading(false);
    }
  };

  const onCopyParams = async () => {
    setError(null);
    if (!validateInputsForPayload()) {
      return;
    }

    const payload = {
      name: "tao-pnl24h",
      branch: "main",
      repo: "https://gitlab.com/tao-radar/scriptable-widgets",
      path: "scriptable/widgets/bittensor/network",
      params: {
        network: network.trim(),
        addresses,
        apiProvider: apiProvider || "TaoStats",
      },
    };

    try {
      const encoded = encodeBase64Utf8(JSON.stringify(payload));
      await navigator.clipboard.writeText(encoded);
      setCopyStatus("Copied input params as base64 JSON.");
    } catch (e) {
      setCopyStatus(`Copy failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  const onOpenApiModal = () => {
    setModalApiKey(apiKey);
    setModalApiProvider(apiProvider || "TaoStats");
    setAuthError(null);
    setIsApiModalOpen(true);
  };

  const onSaveApiSettings = async () => {
    setAuthError(null);
    try {
      await onAuthorizeSubmit(modalApiKey, modalApiProvider || "TaoStats");
      setIsApiModalOpen(false);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Authorization failed");
    }
  };

  const authButtonLabel =
    authState === "validating"
      ? "Authorizing..."
      : authState === "authorized"
        ? `Authorized (${apiProvider || "TaoStats"})`
        : "Authorize";

  const networkInvalid = showValidation && !network.trim();
  const addressesInvalid = showValidation && (addresses.length === 0 || invalidAddresses.length > 0);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBackHome}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-500"
            >
              Back to Home
            </button>
          </div>
          <button
            type="button"
            onClick={onOpenApiModal}
            className="rounded-md border border-cyan-700 px-3 py-1.5 text-sm font-semibold text-cyan-300 hover:border-cyan-500 disabled:opacity-60"
            disabled={authState === "validating"}
          >
            {authButtonLabel}
          </button>
        </div>
      </div>

      <div>
        <h1 className="mb-2 text-2xl font-semibold text-emerald-400">TAO PNL 24h Web Widget</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Add addresses, optionally test balances with Fetch, then copy payload for Scriptable widgetParameter.
        </p>

        <div className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-zinc-300">Network</span>
            <input
              type="text"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              placeholder="finney"
              required
              className={`rounded-md border bg-zinc-950 px-3 py-2 outline-none ${
                networkInvalid ? "border-red-500 focus:border-red-500" : "border-zinc-700 focus:border-emerald-500"
              }`}
            />
          </label>

          <label className="md:col-span-2 flex flex-col gap-2 text-sm">
            <span className="text-zinc-300">Addresses (comma, space, or newline separated)</span>
            <textarea
              value={addressesText}
              onChange={(e) => setAddressesText(e.target.value)}
              rows={5}
              required
              placeholder="5F...A4v, 5G...9kP"
              className={`rounded-md border bg-zinc-950 px-3 py-2 font-mono text-xs outline-none ${
                addressesInvalid ? "border-red-500 focus:border-red-500" : "border-zinc-700 focus:border-emerald-500"
              }`}
            />
          </label>

          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void onLookup()}
              disabled={loading}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Loading..." : "Fetch PNL"}
            </button>
            <button
              type="button"
              onClick={() => void onCopyParams()}
              className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-400"
            >
              Copy Payload (Base64)
            </button>
            {copyStatus && <span className="text-xs text-zinc-400">{copyStatus}</span>}
          </div>
        </div>

        {error && <p className="mt-4 rounded-md border border-red-800 bg-red-950 p-3 text-sm text-red-300">{error}</p>}

        <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-300">
              <tr>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3 text-right">Total (TAO)</th>
                <th className="px-4 py-3 text-right">24h Ago (TAO)</th>
                <th className="px-4 py-3 text-right">24h PNL (TAO)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr className="border-t border-zinc-800">
                  <td className="px-4 py-4 text-zinc-500" colSpan={4}>
                    Enter API key and addresses, then click Fetch PNL.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr className="border-t border-zinc-800" key={row.address}>
                    <td className="px-4 py-3 text-cyan-400">{shortAddress(row.address)}</td>
                    <td className="px-4 py-3 text-right text-amber-300">{formatTao(row.totalTao)}</td>
                    <td className="px-4 py-3 text-right text-zinc-200">{formatTao(row.total24hAgoTao)}</td>
                    <td
                      className={`px-4 py-3 text-right ${
                        row.pnl24hTao !== null && row.pnl24hTao < 0 ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {formatSignedTao(row.pnl24hTao)}
                      {row.error ? ` (${row.error})` : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Formula: `total_tao = balance_total * 10^-9`, `total_24h_ago_tao = balance_total_24hr_ago * 10^-9`,
          `pnl_24h_tao = (balance_total - balance_total_24hr_ago) * 10^-9`.
        </p>
      </div>

      {isApiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-lg border border-zinc-700 bg-zinc-900 p-4">
            <h2 className="text-lg font-semibold text-zinc-100">API Settings</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Update API key/provider here without leaving the Portfolio page.
            </p>

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
