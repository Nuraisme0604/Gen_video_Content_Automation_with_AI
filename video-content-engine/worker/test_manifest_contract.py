"""Regression tests for the n8n-to-worker render manifest contract."""
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main_server import RenderManifest, _all_scenes_failed_error, app


class TestRenderManifestContract(unittest.TestCase):
    def _manifest(self, scene_count=1):
        return {
            "episode_id": "episode-1",
            "workspace": "/data/pipeline",
            "title": "Contract test",
            "projectId": "project-1",
            "narration_script": "Full narration",
            "thumbnail_text": "Thumbnail",
            "seo_keywords": [],
            "video_provider": "slideshow",
            "scenes": [
                {
                    "scene_id": str(index + 1),
                    "narration_text": f"Scene narration {index + 1}",
                    "image_url": None,
                }
                for index in range(scene_count)
            ],
        }

    def test_accepts_narration_text(self):
        manifest = RenderManifest.model_validate(self._manifest())

        self.assertEqual(manifest.scenes[0].narration_text, "Scene narration 1")
        self.assertEqual(len(manifest.scenes), 1)
        self.assertEqual(manifest.video_provider, "slideshow")

    def test_render_endpoint_accepts_four_scenes(self):
        with patch("main_server.process_video_pipeline") as process_pipeline:
            response = TestClient(app).post("/api/v1/render", json=self._manifest(4))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"status": "accepted", "episode_id": "episode-1", "scenes": 4},
        )
        process_pipeline.assert_called_once()
        queued_manifest = process_pipeline.call_args.args[0]
        self.assertEqual(queued_manifest.video_provider, "slideshow")

    def test_failure_message_names_provider_and_missing_assets(self):
        manifest = RenderManifest.model_validate(self._manifest(2))
        completed_scenes = [
            (0, manifest.scenes[0], {
                "video_path": None,
                "image_path": None,
                "audio_path": "/tmp/voice-1.mp3",
            }, "failed"),
            (1, manifest.scenes[1], {
                "video_path": None,
                "image_path": "/tmp/image-2.jpg",
                "audio_path": None,
            }, "failed"),
        ]

        error = _all_scenes_failed_error(manifest, completed_scenes)

        self.assertIn("video provider 'slideshow'", error)
        self.assertIn("scene 1: missing video, image", error)
        self.assertIn("scene 2: missing video, voiceover", error)


if __name__ == "__main__":
    unittest.main(verbosity=2)
