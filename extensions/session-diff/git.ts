import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Snapshot = { root: string; head: string; directory: string; files: Record<string, string> };
type FileState = { content: Buffer; mode: string };

async function git(cwd: string, args: string[], allowed = [0]): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		execFile("git", ["--no-optional-locks", ...args], { cwd, encoding: "buffer", maxBuffer: 64 * 1024 * 1024, timeout: 30_000 }, (error, stdout, stderr) => {
			if (error && !allowed.includes(Number(error.code))) reject(new Error(stderr.toString().trim() || error.message));
			else resolve(stdout);
		});
	});
}

export async function repository(cwd: string): Promise<string> {
	return (await git(cwd, ["rev-parse", "--show-toplevel"])).toString().trimEnd();
}

async function head(root: string): Promise<string> {
	return (await git(root, ["rev-parse", "--verify", "HEAD"], [0, 128])).toString().trim();
}

async function workingFile(root: string, path: string): Promise<FileState> {
	try {
		const file = join(root, path);
		const stat = await lstat(file);
		if (stat.isSymbolicLink()) return { content: Buffer.from(await readlink(file)), mode: "120000" };
		if (!stat.isFile()) throw new Error(`Submodules/directories are not supported: ${JSON.stringify(path)}`);
		return { content: await readFile(file), mode: stat.mode & 0o111 ? "100755" : "100644" };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { content: Buffer.alloc(0), mode: "000000" };
		throw error;
	}
}

async function committedFile(root: string, revision: string, path: string): Promise<FileState> {
	if (!revision) return { content: Buffer.alloc(0), mode: "000000" };
	const tree = await git(root, ["--literal-pathspecs", "ls-tree", "-z", revision, "--", path]);
	if (!tree.length) return { content: Buffer.alloc(0), mode: "000000" };
	const [mode, type, object] = tree.toString().split("\t")[0].split(" ");
	if (type !== "blob") throw new Error(`Submodules are not supported: ${JSON.stringify(path)}`);
	return { mode, content: await git(root, ["cat-file", "blob", object]) };
}

export async function snapshot(root: string, cache: string): Promise<Snapshot> {
	await mkdir(cache, { recursive: true, mode: 0o700 });
	const directory = await mkdtemp(join(cache, "baseline-"));
	try {
		const revision = await head(root);
		const paths = (await git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])).toString().split("\0").filter(Boolean);
		const files: Record<string, string> = Object.create(null);
		for (const path of new Set(paths)) {
			// Submodules have no file contents to snapshot; /diff reports them explicitly.
			if ((await lstat(join(root, path)).catch((error) => {
				if (error.code === "ENOENT") return undefined;
				throw error;
			}))?.isDirectory()) continue;
			const state = await workingFile(root, path);
			files[path] = state.mode;
			await writeFile(join(directory, key(path)), state.content, { mode: 0o600 });
		}
		const result = { root, head: revision, directory, files };
		await writeFile(join(directory, "manifest.json"), JSON.stringify(result), { mode: 0o600 });
		return result;
	} catch (error) {
		await rm(directory, { recursive: true, force: true });
		throw error;
	}
}

function key(path: string): string {
	return createHash("sha256").update(path).digest("hex");
}

function same(a: FileState, b: FileState): boolean {
	return a.mode === b.mode && a.content.equals(b.content);
}

export async function sessionDiff(baseline: Snapshot): Promise<string> {
	const { root } = baseline;
	const status = (await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"])).toString();
	const paths = status.split("\0").filter(Boolean).map((entry) => entry.slice(3));
	const revision = await head(root);
	const scratch = await mkdtemp(join(tmpdir(), "pi-session-diff-"));
	const parts: string[] = [];
	try {
		for (const path of paths) {
			try {
				let before: FileState = {
					mode: Object.hasOwn(baseline.files, path) ? baseline.files[path] : "000000",
					content: Object.hasOwn(baseline.files, path) ? await readFile(join(baseline.directory, key(path))) : Buffer.alloc(0),
				};
				const after = await workingFile(root, path);
				if (revision !== baseline.head) {
					const original = await committedFile(root, baseline.head, path);
					const committed = await committedFile(root, revision, path);
					if (!same(original, committed)) {
						if (same(before, original) || same(before, committed)) before = committed;
						else {
							if (before.content.includes(0) || original.content.includes(0) || committed.content.includes(0)) {
								throw new Error("Cannot separate committed and pre-existing binary changes.");
							}
							await writeFile(join(scratch, "before"), before.content);
							await writeFile(join(scratch, "original"), original.content);
							await writeFile(join(scratch, "committed"), committed.content);
							try {
								before.content = await git(root, ["merge-file", "-p", join(scratch, "before"), join(scratch, "original"), join(scratch, "committed")]);
							} catch {
								throw new Error("Cannot separate overlapping commits from pre-existing edits.");
							}
							if (before.mode === original.mode) before.mode = committed.mode;
						}
					}
				}
				if (same(before, after)) continue;
				await writeFile(join(scratch, "before"), before.content);
				await writeFile(join(scratch, "after"), after.content);
				const patch = (await git(root, ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "--color=never", "--", join(scratch, "before"), join(scratch, "after")], [0, 1])).toString();
				const label = JSON.stringify(path);
				const lines = patch.split("\n");
				const hunk = lines.findIndex((line) => line.startsWith("@@"));
				parts.push([
					`diff --git ${label} ${label}`,
					...(before.mode !== after.mode ? [`old mode ${before.mode}`, `new mode ${after.mode}`] : []),
					...(hunk >= 0 ? [`--- ${before.mode === "000000" ? "/dev/null" : label}`, `+++ ${after.mode === "000000" ? "/dev/null" : label}`, ...lines.slice(hunk)] : patch.includes("Binary files") ? ["Binary files differ"] : []),
				].join("\n"));
			} catch (error) {
				parts.push(`diff --git ${JSON.stringify(path)}\nUnable to show diff: ${(error as Error).message}\n`);
			}
		}
		return parts.join("\n") || "No uncommitted changes made since the session baseline.";
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}
