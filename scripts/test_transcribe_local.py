import json
from pathlib import Path
import runpy
import tempfile
import unittest

transcript = runpy.run_path(
    str(Path(__file__).with_name("transcribe-local.py")), run_name="transcript_tests"
)


class TranscriptTests(unittest.TestCase):
    def test_blank_zero_length_decoder_cues_preserve_real_speech(self):
        result = {
            "text": "こんにちは",
            "segments": [
                {"start": 0.0, "end": 2.0, "text": "こんにちは"},
                {"start": 2.0, "end": 2.0, "text": "", "words": []},
            ],
        }
        self.assertEqual(
            [segment["text"] for segment in transcript["segments_from"](result)],
            ["こんにちは"],
        )

    def test_nonempty_cues_require_finite_positive_time_ranges(self):
        for start, end in [
            (0, float("nan")),
            (0, float("inf")),
            (-1, 2),
            (2, 2),
            (3, 2),
            (False, 2),
        ]:
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                transcript["segments_from"](
                    {
                        "text": "speech",
                        "segments": [{"start": start, "end": end, "text": "speech"}],
                    }
                )

    def test_missing_timed_speech_is_not_reported_as_silence(self):
        with self.assertRaises(ValueError):
            transcript["segments_from"]({"text": "spoken words", "segments": []})
        self.assertEqual(transcript["segments_from"]({"text": "", "segments": []}), [])

    def test_vtt_time_rollover_and_literal_text(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "speech.vtt"
            transcript["save_vtt"](
                path, [{"start": 59.9999, "end": 61, "text": "A&B <日本語> --> 次"}]
            )
            content = path.read_text()
            self.assertIn("00:01:00.000 --> 00:01:01.000", content)
            self.assertIn("A&amp;B &lt;日本語&gt; → 次", content)

    def test_json_never_publishes_nonfinite_confidence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "speech.json"
            with self.assertRaises(ValueError):
                transcript["save_json"](path, {"confidence": float("nan")})
            self.assertFalse(path.exists())
            transcript["save_json"](path, {"confidence": 0.5})
            self.assertEqual(json.loads(path.read_text()), {"confidence": 0.5})


if __name__ == "__main__":
    unittest.main()
