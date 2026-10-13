import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { repository, sessionDiff, snapshot } from "./git.ts";

async function fixture(t, initial = { "file.txt": "one\ntwo\nthree\n" }, commit = true) {
	const directory = await mkdtemp(join(tmpdir(), "pi-diff-test-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	git("init", "-q");
	git("config", "user.name", "Diff Test");
	git("config", "user.email", "diff@example.invalid");
	for (const [path, content] of Object.entries(initial)) await writeFile(join(directory, path), content);
	if (commit) { git("add", "."); git("commit", "-qm", "baseline"); }
	return { directory, git, capture: () => snapshot(directory, join(directory, ".git", "diff-cache")) };
}

test("excludes pre-existing tracked/untracked/staged edits, includes only session delta", async (t) => {
	const f = await fixture(t);
	await writeFile(join(f.directory, "file.txt"), "earlier\ntwo\nthree\n");
	await writeFile(join(f.directory, "prior.txt"), "before\n");
	f.git("add", "file.txt");
	const baseline = await f.capture();
	assert.match(await sessionDiff(baseline), /^No uncommitted/);
	await writeFile(join(f.directory, "file.txt"), "earlier\nsession\nthree\n");
	await writeFile(join(f.directory, "new file.txt"), "new\n");
	f.git("add", "new file.txt");
	const index = await readFile(join(f.directory, ".git", "index"));
	const diff = await sessionDiff(baseline);
	assert.match(diff, /-two\n\+session/);
	assert.doesNotMatch(diff, /-one|\+earlier|prior.txt/);
	assert.match(diff, /new file.txt/);
	assert.deepEqual(await readFile(join(f.directory, ".git", "index")), index);
	assert.equal(await repository(f.directory), f.directory);
	const restored = JSON.parse(await readFile(join(baseline.directory, "manifest.json"), "utf8"));
	assert.equal(await sessionDiff(restored), diff);
});

test("new, deleted, renamed, ignored, binary, symlink and executable files", async (t) => {
	const f = await fixture(t, { "old.txt": "original\n", "binary": Buffer.from([0, 1, 2]), ".gitignore": "ignored*\n" });
	await symlink("old.txt", join(f.directory, "link"));
	f.git("add", "link"); f.git("commit", "-qm", "link");
	const baseline = await f.capture();
	await rm(join(f.directory, "old.txt"));
	await writeFile(join(f.directory, "renamed.txt"), "original\n");
	await writeFile(join(f.directory, "ignored-secret"), "do not show");
	await writeFile(join(f.directory, "binary"), Buffer.from([0, 3, 2]));
	await rm(join(f.directory, "link"));
	await symlink("renamed.txt", join(f.directory, "link"));
	await chmod(join(f.directory, "binary"), 0o755);
	await writeFile(join(f.directory, "empty"), "");
	const diff = await sessionDiff(baseline);
	assert.match(diff, /old.txt/);
	assert.match(diff, /renamed.txt/);
	assert.match(diff, /Binary files differ/);
	assert.match(diff, /new mode 100755/);
	assert.match(diff, /\+renamed.txt/);
	assert.match(diff, /"empty"/);
	assert.doesNotMatch(diff, /ignored-secret|do not show/);
});

test("unborn repositories and unusual filenames", async (t) => {
	const f = await fixture(t, {}, false);
	const baseline = await f.capture();
	for (const path of ["__proto__", "line\nbreak.txt", ":(glob)*.txt"]) await writeFile(join(f.directory, path), "added\n");
	const diff = await sessionDiff(baseline);
	assert.match(diff, /__proto__/);
	assert.match(diff, /line\\nbreak.txt/);
	assert.match(diff, /glob/);
	f.git("add", "."); f.git("commit", "-qm", "first");
	assert.match(await sessionDiff(baseline), /^No uncommitted/);
	await writeFile(join(f.directory, "__proto__"), "added\nresidual\n");
	assert.match(await sessionDiff(baseline), /\+residual/);
});

test("fully committed changes disappear and partial commits show only residual changes", async (t) => {
	const f = await fixture(t);
	const baseline = await f.capture();
	await writeFile(join(f.directory, "file.txt"), "committed\ntwo\nthree\n");
	f.git("add", "."); f.git("commit", "-qm", "session change");
	assert.match(await sessionDiff(baseline), /^No uncommitted/);
	await writeFile(join(f.directory, "file.txt"), "committed\nremaining\nthree\n");
	const diff = await sessionDiff(baseline);
	assert.match(diff, /-two\n\+remaining/);
	assert.doesNotMatch(diff, /\+committed|-one/);
});

test("pre-existing edits remain excluded after a non-overlapping commit", async (t) => {
	const lines = Array.from({ length: 20 }, (_, i) => `${i}\n`);
	const f = await fixture(t, { "file.txt": lines.join("") });
	const earlier = [...lines]; earlier[0] = "earlier\n";
	await writeFile(join(f.directory, "file.txt"), earlier.join(""));
	const baseline = await f.capture();
	const committed = [...lines]; committed[19] = "committed\n";
	await writeFile(join(f.directory, "file.txt"), committed.join(""));
	f.git("add", "."); f.git("commit", "-qm", "non-overlapping");
	committed[0] = "earlier\n"; committed[10] = "session\n";
	await writeFile(join(f.directory, "file.txt"), committed.join(""));
	const diff = await sessionDiff(baseline);
	assert.match(diff, /\+session/);
	assert.doesNotMatch(diff, /\+earlier|\+committed/);
});

test("overlapping baseline edits and commits are reported instead of a misleading diff", async (t) => {
	const f = await fixture(t);
	await writeFile(join(f.directory, "file.txt"), "pre-existing\ntwo\nthree\n");
	const baseline = await f.capture();
	await writeFile(join(f.directory, "file.txt"), "committed\ntwo\nthree\n");
	f.git("add", "."); f.git("commit", "-qm", "overlap");
	await writeFile(join(f.directory, "file.txt"), "committed\nremaining\nthree\n");
	assert.match(await sessionDiff(baseline), /Cannot separate overlapping commits/);
});
