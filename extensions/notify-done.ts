import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);
const BELL = "\u0007";
const POWERSHELL_TIMEOUT_MS = 1500;

type FocusState = "active" | "inactive" | "unknown";

interface WindowsFocusSnapshot {
	foregroundPid?: number;
	foregroundName?: string | null;
	ancestorPids?: number[];
	ancestorNames?: string[];
}

const WINDOWS_FOCUS_SCRIPT = String.raw`
param([int]$CurrentPid)
$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class User32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out int processId);
}
"@

$foregroundWindow = [User32]::GetForegroundWindow()
$foregroundPid = 0
[void][User32]::GetWindowThreadProcessId($foregroundWindow, [ref]$foregroundPid)

$foregroundName = $null
try {
    if ($foregroundPid -gt 0) {
        $foregroundName = (Get-Process -Id $foregroundPid -ErrorAction Stop).ProcessName
    }
} catch {}

$ancestorPids = @()
$ancestorNames = @()
$pidToCheck = $CurrentPid
$seen = @{}

for ($i = 0; $i -lt 64 -and $pidToCheck -gt 0 -and -not $seen.ContainsKey([string]$pidToCheck); $i++) {
    $seen[[string]$pidToCheck] = $true

    try {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $pidToCheck" -ErrorAction Stop
    } catch {
        break
    }

    if ($null -eq $process) { break }

    $ancestorPids += [int]$process.ProcessId
    if ($process.Name) { $ancestorNames += [string]$process.Name }
    $pidToCheck = [int]$process.ParentProcessId
}

[PSCustomObject]@{
    foregroundPid = $foregroundPid
    foregroundName = $foregroundName
    ancestorPids = $ancestorPids
    ancestorNames = $ancestorNames
} | ConvertTo-Json -Compress
`;

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		const state = await getWindowsTerminalFocusState();
		if (state === "inactive" || state === "unknown") {
			process.stderr.write(BELL);
		}
	});
}

async function getWindowsTerminalFocusState(): Promise<FocusState> {
	const snapshot = await getWindowsFocusSnapshot();
	if (!snapshot) return "unknown";
	return inferFocusState(snapshot);
}

async function getWindowsFocusSnapshot(): Promise<WindowsFocusSnapshot | undefined> {
	for (const command of ["powershell.exe", "powershell"] as const) {
		try {
			const result = await execFileAsync(command, [
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-Command",
				WINDOWS_FOCUS_SCRIPT,
				String(process.pid),
			], {
				timeout: POWERSHELL_TIMEOUT_MS,
				windowsHide: true,
				maxBuffer: 16 * 1024,
			});

			const stdout = result.stdout.trim();
			if (!stdout) return undefined;
			return JSON.parse(stdout) as WindowsFocusSnapshot;
		} catch (error) {
			if (!isMissingCommandError(error)) return undefined;
		}
	}

	return undefined;
}

function inferFocusState(snapshot: WindowsFocusSnapshot): FocusState {
	const foregroundPid = Number(snapshot.foregroundPid ?? 0);
	const foregroundName = normalizeProcessName(snapshot.foregroundName);
	const ancestorPids = snapshot.ancestorPids ?? [];

	if (foregroundPid > 0 && ancestorPids.includes(foregroundPid)) {
		return "active";
	}

	if (!foregroundName) return "unknown";
	if (isCurrentTerminalForeground(foregroundName)) return "active";
	if (isKnownTerminalProcess(foregroundName)) return "active";

	return "inactive";
}

function isCurrentTerminalForeground(processName: string): boolean {
	const termProgram = (process.env.TERM_PROGRAM ?? "").toLowerCase();

	if (process.env.WT_SESSION && (processName === "windowsterminal" || processName === "wt")) {
		return true;
	}

	if (termProgram.includes("wezterm") && processName.includes("wezterm")) return true;
	if (termProgram.includes("ghostty") && processName.includes("ghostty")) return true;
	if (termProgram.includes("vscode") && (processName === "code" || processName === "cursor")) return true;
	if (process.env.ConEmuANSI && processName.includes("conemu")) return true;

	return false;
}

function isKnownTerminalProcess(processName: string): boolean {
	return new Set([
		"alacritty",
		"code",
		"conemu",
		"conemu64",
		"conhost",
		"cursor",
		"ghostty",
		"mintty",
		"opencodeconsole",
		"openconsole",
		"wezterm",
		"wezterm-gui",
		"windowsterminal",
		"wt",
	]).has(processName);
}

function normalizeProcessName(processName: string | null | undefined): string {
	return (processName ?? "").toLowerCase().replace(/\.exe$/, "");
}

function isMissingCommandError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}
