import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";

const API_URL = "https://api.moonshot.ai/v1/users/me/balance";

interface BalanceResponse {
  code?: number;
  data?: {
    available_balance?: number;
    voucher_balance?: number;
    cash_balance?: number;
  };
  error?: { message?: string };
}

async function fetchBalance(apiKey: string): Promise<BalanceResponse> {
  const res = await fetch(API_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  return (await res.json()) as BalanceResponse;
}

function formatBalance(data: BalanceResponse["data"]): string {
  if (!data) return "No balance data";
  const available = data.available_balance ?? 0;
  const voucher = data.voucher_balance ?? 0;
  const cash = data.cash_balance ?? 0;
  const parts: string[] = [];
  parts.push(`Available: $${available.toFixed(2)}`);
  if (voucher > 0) parts.push(`Voucher: $${voucher.toFixed(2)}`);
  if (cash > 0) parts.push(`Cash: $${cash.toFixed(2)}`);
  return parts.join(" | ");
}

async function getMoonshotApiKey(
  modelRegistry: ExtensionAPI["modelRegistry"],
): Promise<string | undefined> {
  // Prefer authStorage (checks auth.json, runtime overrides, env fallback, etc.)
  if (modelRegistry.authStorage) {
    return await modelRegistry.authStorage.getApiKey("moonshotai");
  }
  // Fallback for restricted-auth mode
  return await modelRegistry.getApiKeyForProvider("moonshotai");
}

async function refreshBalance(ui: ExtensionAPI["ui"], apiKey: string) {
  try {
    const json = await fetchBalance(apiKey);
    if (json.data) {
      const text = formatBalance(json.data);
      ui.setStatus("moonshot-balance", `🌙 ${text}`);
    } else if (json.error) {
      ui.setStatus("moonshot-balance", `🌙 Error: ${json.error.message ?? "Unknown"}`);
    } else {
      ui.setStatus("moonshot-balance", "🌙 No balance data");
    }
  } catch (err) {
    ui.setStatus("moonshot-balance", `🌙 Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function isMoonshotModel(model: { provider: string } | undefined): boolean {
  return model?.provider === "moonshotai";
}

const DEBOUNCE_MS = 30_000;

export default function (pi: ExtensionAPI) {
  let lastFetchTime = 0;

  async function updateStatus(ctx: { ui: ExtensionAPI["ui"]; modelRegistry: ExtensionAPI["modelRegistry"]; model: Model<any> | undefined }) {
    if (!isMoonshotModel(ctx.model)) {
      ctx.ui.setStatus("moonshot-balance", undefined);
      return;
    }
    const apiKey = await getMoonshotApiKey(ctx.modelRegistry);
    if (!apiKey) {
      ctx.ui.setStatus("moonshot-balance", "🌙 No Moonshot key (use /login or auth.json)");
      return;
    }
    await refreshBalance(ctx.ui, apiKey);
    lastFetchTime = Date.now();
  }

  pi.on("session_start", async (_event, ctx) => {
    await updateStatus(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    await updateStatus(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!isMoonshotModel(ctx.model)) return;
    if (Date.now() - lastFetchTime < DEBOUNCE_MS) return;
    await updateStatus(ctx);
  });

  pi.registerCommand("balance", {
    description: "Show Moonshot account balance",
    handler: async (_args, ctx) => {
      const apiKey = await getMoonshotApiKey(ctx.modelRegistry);
      if (!apiKey) {
        ctx.ui.notify("No Moonshot API key configured. Use /login or add to ~/.pi/agent/auth.json", "error");
        return;
      }
      try {
        const json = await fetchBalance(apiKey);
        if (json.data) {
          const text = formatBalance(json.data);
          ctx.ui.notify(`🌙 Moonshot: ${text}`, "info");
          ctx.ui.setStatus("moonshot-balance", `🌙 ${text}`);
        } else if (json.error) {
          ctx.ui.notify(`Moonshot error: ${json.error.message ?? "Unknown"}`, "error");
        } else {
          ctx.ui.notify("No balance data from Moonshot", "warning");
        }
      } catch (err) {
        ctx.ui.notify(
          `Failed to fetch Moonshot balance: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      }
    },
  });
}
