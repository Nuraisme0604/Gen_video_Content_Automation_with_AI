"""Mock test for veo3_generator.py — verifies code paths without real API/SDK."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent))

import veo3_generator  # safe: no google imports at module level


def _build_sdk_mocks(video_bytes=b"fake_video_bytes"):
    """Return (sys.modules patch dict, mock_client) for patching SDK."""
    mock_types = MagicMock()
    mock_genai = MagicMock()
    mock_genai.types = mock_types

    mock_client = MagicMock()
    mock_operation = MagicMock()
    mock_operation.done = True
    mock_operation.response.generated_videos = [MagicMock()]
    mock_genai.Client.return_value = mock_client
    mock_client.models.generate_videos.return_value = mock_operation
    mock_client.files.download.return_value = video_bytes

    mock_google = MagicMock()
    mock_google.genai = mock_genai

    modules = {
        "google": mock_google,
        "google.genai": mock_genai,
        "google.genai.types": mock_types,
    }
    return modules, mock_client


class TestVeo3GeneratorMock(unittest.TestCase):

    def test_no_api_key_returns_false(self):
        """Empty/missing GOOGLE_API_KEY → returns False immediately, no SDK call."""
        with patch.dict(os.environ, {"GOOGLE_API_KEY": ""}):
            result = veo3_generator.generate_video_veo3("any prompt", "/tmp/never_written.mp4")
        self.assertFalse(result)
        self.assertFalse(os.path.exists("/tmp/never_written.mp4"))

    @patch.dict(os.environ, {"GOOGLE_API_KEY": "fake-key-test"})
    def test_happy_path_text_only(self):
        """SDK available, operation.done=True → returns True + file written with expected bytes."""
        modules, mock_client = _build_sdk_mocks()
        with tempfile.TemporaryDirectory() as tmpdir:
            dest = os.path.join(tmpdir, "subdir", "clip.mp4")
            with patch.dict(sys.modules, modules):
                result = veo3_generator.generate_video_veo3("cinematic scene prompt", dest)

            self.assertTrue(result)
            self.assertTrue(os.path.exists(dest))
            self.assertEqual(Path(dest).read_bytes(), b"fake_video_bytes")

        modules["google.genai"].Client.assert_called_once_with(api_key="fake-key-test")
        # no image kwarg in text-only mode
        call_kwargs = mock_client.models.generate_videos.call_args.kwargs
        self.assertNotIn("image", call_kwargs)

    @patch.dict(os.environ, {"GOOGLE_API_KEY": "fake-key-test"})
    def test_image_to_video_passes_image_kwarg(self):
        """image_path provided + exists → generate_videos called with image= kwarg."""
        modules, mock_client = _build_sdk_mocks()
        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = os.path.join(tmpdir, "scene.jpg")
            Path(img_path).write_bytes(b"FAKEJPEG")
            dest = os.path.join(tmpdir, "clip.mp4")
            with patch.dict(sys.modules, modules):
                result = veo3_generator.generate_video_veo3(
                    "scene with character", dest, image_path=img_path
                )

            self.assertTrue(result)

        call_kwargs = mock_client.models.generate_videos.call_args.kwargs
        self.assertIn("image", call_kwargs, "image kwarg not passed — image-to-video mode broken")


if __name__ == "__main__":
    unittest.main(verbosity=2)
