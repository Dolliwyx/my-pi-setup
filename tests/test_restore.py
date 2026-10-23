import contextlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    "restore", Path(__file__).resolve().parents[1] / "scripts/restore.py"
)
restore = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(restore)


class RestoreTests(unittest.TestCase):
    def run_restore(self, home, apply=False):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            restore.restore(home, apply)
        return output.getvalue()

    def test_preview_does_not_write(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            output = self.run_restore(home)
            self.assertIn("WOULD RESTORE .pi/agent/settings.json", output)
            self.assertEqual(list(home.iterdir()), [])

    def test_restore_preserves_credentials_backs_up_and_is_repeatable(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            agent = home / ".pi/agent"
            agent.mkdir(parents=True)
            (agent / "auth.json").write_text("existing credentials")
            (agent / "settings.json").write_text("old settings")
            (agent / "skills").mkdir()
            (agent / "skills/domain-modeling").write_text("old skill entry")
            output = self.run_restore(home, True)
            backup = Path(output.split("Existing files backed up to ")[1].split(";")[0])
            try:
                self.assertEqual((backup / ".pi/agent/settings.json").read_text(), "old settings")
                self.assertEqual((backup / ".pi/agent/skills/domain-modeling").read_text(), "old skill entry")
                self.assertEqual((agent / "auth.json").read_text(), "existing credentials")
                self.assertNotIn("deviceId", json.loads((agent / "settings.json").read_text()))
                self.assertEqual(
                    (home / "AGENTS.md").read_bytes(),
                    (restore.REPO / "home/AGENTS.md").read_bytes(),
                )
                self.assertEqual(len(list((home / ".agents/skills").glob("*/SKILL.md"))), 42)
                link = agent / "skills/domain-modeling"
                self.assertTrue(link.is_symlink())
                self.assertEqual(link.resolve(), home / ".agents/skills/domain-modeling")
                self.assertIn("0 file/link changes", self.run_restore(home, True))
            finally:
                shutil.rmtree(backup)

    def test_symlink_parent_is_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory) / "home"
            outside = Path(directory) / "outside"
            home.mkdir()
            outside.mkdir()
            (home / ".pi").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "not a plain directory"):
                self.run_restore(home, True)
            self.assertEqual(list(outside.iterdir()), [])
            self.assertEqual(list(home.iterdir()), [home / ".pi"])

    def test_snapshot_has_portable_credentials_and_pinned_packages(self):
        settings = json.loads((restore.REPO / "agent/settings.json").read_text())
        self.assertNotIn("deviceId", settings)
        for source in settings["packages"]:
            self.assertIn("@", source.rsplit("/", 1)[-1])
        servers = json.loads((restore.REPO / "agent/mcp.json").read_text())["mcpServers"]
        self.assertEqual(servers["shortcut"]["headers"]["Authorization"], "Bearer ${SHORTCUT_TOKEN}")
        self.assertEqual(servers["TeamBrain"]["headers"]["Authorization"], "Bearer ${TEAM_BRAIN_TOKEN}")
        self.assertNotIn("--executable-path", servers["playwright"]["args"])


if __name__ == "__main__":
    unittest.main()
