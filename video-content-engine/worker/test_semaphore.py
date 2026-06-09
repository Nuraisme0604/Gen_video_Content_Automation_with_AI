"""J.3 verify: 5 scenes run in parallel → semaphore caps Veo3 concurrent calls at max 3."""
import os
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import MagicMock, patch

# Stub requests/urllib3 (not installed on host Python 3.14.5)
_mock_requests = MagicMock()
_mock_requests.Session.return_value = MagicMock()
sys.modules.setdefault("requests", _mock_requests)
sys.modules.setdefault("requests.adapters", MagicMock())
sys.modules.setdefault("urllib3", MagicMock())
sys.modules.setdefault("urllib3.util", MagicMock())
sys.modules.setdefault("urllib3.util.retry", MagicMock())

sys.path.insert(0, str(Path(__file__).parent))

import asset_downloader
from asset_downloader import _generate_video_from_prompt


class TestVeo3Semaphore(unittest.TestCase):

    @patch.dict(os.environ, {"VIDEO_PROVIDER": "veo3", "GOOGLE_API_KEY": "fake-key"})
    def test_max_3_concurrent_veo_calls(self):
        """5 scenes in parallel → semaphore caps max concurrent Veo3 calls at ≤ 3."""
        lock = threading.Lock()
        state = {"current": 0, "max_concurrent": 0}

        def mock_veo3(prompt, dest_path, **kwargs):
            with lock:
                state["current"] += 1
                if state["current"] > state["max_concurrent"]:
                    state["max_concurrent"] = state["current"]
            time.sleep(0.05)  # simulate API latency so threads overlap
            with lock:
                state["current"] -= 1
            return True

        with tempfile.TemporaryDirectory() as tmp:
            imgs = []
            for i in range(5):
                img = os.path.join(tmp, f"scene_{i}_image.jpg")
                Path(img).write_bytes(b"FAKEJPEG")
                imgs.append(img)

            def run_scene(i):
                dest = os.path.join(tmp, f"scene_{i}_video.mp4")
                return _generate_video_from_prompt(f"prompt {i}", dest, image_path=imgs[i])

            with patch.object(asset_downloader, "_veo3_semaphore", threading.Semaphore(3)), \
                 patch("veo3_generator.generate_video_veo3", side_effect=mock_veo3):
                with ThreadPoolExecutor(max_workers=5) as ex:
                    results = list(ex.map(run_scene, range(5)))

        self.assertEqual(len(results), 5)
        for ok, fallback in results:
            self.assertTrue(ok, "All scenes should succeed via Veo3")
            self.assertFalse(fallback, "No Ken Burns fallback when Veo3 succeeds")
        self.assertLessEqual(
            state["max_concurrent"], 3,
            f"Semaphore violated: {state['max_concurrent']} concurrent Veo3 calls (limit 3)",
        )
        self.assertGreater(state["max_concurrent"], 0, "At least 1 Veo3 call should have run")
        print(f"\n  Max concurrent Veo3 calls: {state['max_concurrent']} / 3 limit (5 workers)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
