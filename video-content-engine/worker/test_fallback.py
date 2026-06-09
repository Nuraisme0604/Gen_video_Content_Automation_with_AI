"""I.5 verify: force Veo3 fail → Ken Burns fallback produces video (True, fallback_used=True)."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# ── Stub out `requests` and urllib3 so asset_downloader imports cleanly on host ──
_mock_session = MagicMock()
_mock_requests = MagicMock()
_mock_requests.Session.return_value = _mock_session
sys.modules.setdefault("requests", _mock_requests)
sys.modules.setdefault("requests.adapters", MagicMock())
sys.modules.setdefault("urllib3", MagicMock())
sys.modules.setdefault("urllib3.util", MagicMock())
sys.modules.setdefault("urllib3.util.retry", MagicMock())

sys.path.insert(0, str(Path(__file__).parent))

import asset_downloader  # noqa: E402
from asset_downloader import _generate_video_from_prompt
from veo3_generator import Veo3PermanentError, Veo3TransientError


def _ffmpeg_ok(dest_path):
    """Return a subprocess.run side_effect that writes dest_path and returns rc=0."""
    def _run(cmd, **kwargs):
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        Path(dest_path).write_bytes(b"fake_ken_burns_video")
        r = MagicMock()
        r.returncode = 0
        return r
    return _run


class TestVeo3FallbackKenBurns(unittest.TestCase):

    def _img(self, tmpdir):
        p = os.path.join(tmpdir, "scene_1_image.jpg")
        Path(p).write_bytes(b"FAKEJPEG")
        return p

    @patch.dict(os.environ, {"VIDEO_PROVIDER": "veo3", "GOOGLE_API_KEY": "fake-key"})
    def test_permanent_fail_falls_back_ken_burns(self):
        """Veo3 PermanentError → no retry → Ken Burns runs → (True, True)."""
        with tempfile.TemporaryDirectory() as tmp:
            img = self._img(tmp)
            dest = os.path.join(tmp, "out.mp4")
            with patch("veo3_generator.generate_video_veo3",
                       side_effect=Veo3PermanentError("403 permission denied")):
                with patch("subprocess.run", side_effect=_ffmpeg_ok(dest)):
                    ok, fallback_used = _generate_video_from_prompt("bad prompt", dest, image_path=img)

            self.assertTrue(ok, "Ken Burns should succeed")
            self.assertTrue(fallback_used, "fallback_used must be True")
            self.assertTrue(Path(dest).exists())

    @patch.dict(os.environ, {"VIDEO_PROVIDER": "veo3", "GOOGLE_API_KEY": "fake-key"})
    def test_return_false_falls_back_ken_burns(self):
        """Veo3 returns False (no key / SDK error) → Ken Burns runs → (True, True)."""
        with tempfile.TemporaryDirectory() as tmp:
            img = self._img(tmp)
            dest = os.path.join(tmp, "out.mp4")
            with patch("veo3_generator.generate_video_veo3", return_value=False):
                with patch("subprocess.run", side_effect=_ffmpeg_ok(dest)):
                    ok, fallback_used = _generate_video_from_prompt("bad prompt", dest, image_path=img)

        self.assertTrue(ok)
        self.assertTrue(fallback_used)

    @patch.dict(os.environ, {"VIDEO_PROVIDER": "veo3", "GOOGLE_API_KEY": "fake-key"})
    def test_veo3_success_no_fallback(self):
        """Veo3 succeeds → returns (True, False), Ken Burns NOT called."""
        with tempfile.TemporaryDirectory() as tmp:
            img = self._img(tmp)
            dest = os.path.join(tmp, "out.mp4")
            Path(dest).write_bytes(b"veo3_video")

            with patch("veo3_generator.generate_video_veo3", return_value=True):
                with patch("subprocess.run") as mock_sub:
                    ok, fallback_used = _generate_video_from_prompt("good prompt", dest, image_path=img)

        self.assertTrue(ok)
        self.assertFalse(fallback_used, "fallback_used must be False when Veo3 succeeds")
        mock_sub.assert_not_called()

    @patch.dict(os.environ, {"VIDEO_PROVIDER": "veo3", "GOOGLE_API_KEY": "fake-key"})
    def test_transient_retry_then_falls_back(self):
        """Veo3 TransientError on both attempts → Ken Burns runs → (True, True)."""
        with tempfile.TemporaryDirectory() as tmp:
            img = self._img(tmp)
            dest = os.path.join(tmp, "out.mp4")
            with patch("veo3_generator.generate_video_veo3",
                       side_effect=Veo3TransientError("503 service unavailable")):
                with patch("subprocess.run", side_effect=_ffmpeg_ok(dest)):
                    ok, fallback_used = _generate_video_from_prompt("bad prompt", dest, image_path=img)

        self.assertTrue(ok)
        self.assertTrue(fallback_used)


if __name__ == "__main__":
    unittest.main(verbosity=2)
