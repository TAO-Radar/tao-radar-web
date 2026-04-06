import { useMemo, useState } from "react";
import { web3Accounts, web3Enable, web3FromAddress } from "@polkadot/extension-dapp";

import "./App.css";

const RAO_TO_TAO = 1e-9;
const DEFAULT_NETWORK = "finney";
const TAO_STATS_ACCOUNT_URL = "https://api.taostats.io/api/account/latest/v1";

type TaoStatsAccount = {
  address?: { ss58?: string };
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

type WalletAccount = {
  address: string;
  meta?: {
    name?: string;
    source?: string;
  };
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

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

function shortAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

function stringToHex(value: string): string {
  return `0x${Array.from(new TextEncoder().encode(value))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
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

async function fetchAccount(address: string, network: string, authHeader: string): Promise<TaoStatsAccount> {
  const url =
    `${TAO_STATS_ACCOUNT_URL}?address=${encodeURIComponent(address)}` +
    `&network=${encodeURIComponent(network)}&page=1&limit=50`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = (await response.json()) as { data?: TaoStatsAccount[] };
  if (!json || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error("No account data");
  }
  return json.data[0];
}

function App() {
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [selectedAccountAddress, setSelectedAccountAddress] = useState("");
  const [walletAuthedAddress, setWalletAuthedAddress] = useState<string | null>(null);
  const [walletAuthError, setWalletAuthError] = useState<string | null>(null);
  const [walletAuthLoading, setWalletAuthLoading] = useState(false);
  const [walletConnectLoading, setWalletConnectLoading] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [network, setNetwork] = useState(DEFAULT_NETWORK);
  const [addressesText, setAddressesText] = useState(
    "5FqdCPXAM6u9N8fdqRA2RWyQsJeBG63UoQEga4vVAKAAyA4v",
  );
  const [rows, setRows] = useState<AddressRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addresses = useMemo(() => parseAddresses(addressesText), [addressesText]);
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.address === selectedAccountAddress),
    [accounts, selectedAccountAddress],
  );
  const isWalletAuthed = walletAuthedAddress !== null && walletAuthedAddress === selectedAccountAddress;

  const onConnectWallet = async () => {
    setWalletAuthError(null);
    setWalletConnectLoading(true);
    try {
      const extensions = await web3Enable("TAO Radar PNL Web");
      if (extensions.length === 0) {
        setWalletAuthError("No Polkadot wallet extension authorized.");
        return;
      }
      const loadedAccounts = (await web3Accounts()) as WalletAccount[];
      setAccounts(loadedAccounts);
      if (loadedAccounts.length > 0 && !selectedAccountAddress) {
        setSelectedAccountAddress(loadedAccounts[0].address);
      }
    } catch (e) {
      setWalletAuthError(e instanceof Error ? e.message : "Failed to connect wallet.");
    } finally {
      setWalletConnectLoading(false);
    }
  };

  const onAuthenticateWallet = async () => {
    setWalletAuthError(null);
    if (!selectedAccount) {
      setWalletAuthError("Select a connected Polkadot account first.");
      return;
    }

    setWalletAuthLoading(true);
    try {
      const challenge = `TAO Radar auth | address=${selectedAccount.address} | ts=${Date.now()}`;
      const injector = await web3FromAddress(selectedAccount.address);
      const signRaw = injector?.signer?.signRaw;
      if (!signRaw) {
        setWalletAuthError("Selected wallet does not support signRaw.");
        return;
      }
      await signRaw({
        address: selectedAccount.address,
        data: stringToHex(challenge),
        type: "bytes",
      });
      setWalletAuthedAddress(selectedAccount.address);
    } catch (e) {
      setWalletAuthedAddress(null);
      setWalletAuthError(e instanceof Error ? e.message : "Wallet signature rejected.");
    } finally {
      setWalletAuthLoading(false);
    }
  };

  const onLookup = async () => {
    setError(null);
    setRows([]);

    if (!apiKey.trim()) {
      setError("Please provide TaoStats Authorization API key.");
      return;
    }
    if (addresses.length === 0) {
      setError("Please provide at least one address.");
      return;
    }
    if (!isWalletAuthed) {
      setError("Please connect and authenticate a Polkadot account.");
      return;
    }

    setLoading(true);
    try {
      const nextRows = await Promise.all(
        addresses.map(async (address): Promise<AddressRow> => {
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

            // TaoStats values are in RAO, so multiply by 10^-9 to display TAO.
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

      setRows(nextRows);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-2 text-2xl font-semibold text-emerald-400">TAO PNL 24h Web Widget</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Built on the Polkadot React template. Enter your TaoStats Authorization header and list of
          SS58 addresses.
        </p>

        <div className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-2">
          <div className="md:col-span-2 flex flex-wrap items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <button
              type="button"
              onClick={() => void onConnectWallet()}
              disabled={walletConnectLoading}
              className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {walletConnectLoading ? "Connecting..." : "Connect Polkadot Wallet"}
            </button>
            <select
              value={selectedAccountAddress}
              onChange={(e) => {
                setSelectedAccountAddress(e.target.value);
                setWalletAuthedAddress(null);
              }}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">Select connected account</option>
              {accounts.map((acc) => (
                <option key={acc.address} value={acc.address}>
                  {acc.meta?.name
                    ? `${acc.meta.name} (${acc.meta.source ?? "wallet"}) - ${shortAddress(acc.address)}`
                    : shortAddress(acc.address)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void onAuthenticateWallet()}
              disabled={!selectedAccount || walletAuthLoading}
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {walletAuthLoading ? "Authenticating..." : "Authenticate Wallet"}
            </button>
            <span className={`text-xs ${isWalletAuthed ? "text-emerald-400" : "text-zinc-400"}`}>
              {isWalletAuthed ? `Authenticated: ${shortAddress(walletAuthedAddress ?? "")}` : "Not authenticated"}
            </span>
          </div>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-zinc-300">Authorization Header (API key)</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="tao-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxx"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-emerald-500"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-zinc-300">Network</span>
            <input
              type="text"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              placeholder="finney"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-emerald-500"
            />
          </label>

          <label className="md:col-span-2 flex flex-col gap-2 text-sm">
            <span className="text-zinc-300">Addresses (comma, space, or newline separated)</span>
            <textarea
              value={addressesText}
              onChange={(e) => setAddressesText(e.target.value)}
              rows={5}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs outline-none focus:border-emerald-500"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => void onLookup()}
              disabled={loading}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Loading..." : "Fetch PNL"}
            </button>
          </div>
        </div>

        {walletAuthError && (
          <p className="mt-4 rounded-md border border-red-800 bg-red-950 p-3 text-sm text-red-300">{walletAuthError}</p>
        )}
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
    </div>
  );
}

export default App;
