"""Private, resumable Whisper batch; run with Tombo's existing Python environment."""

import argparse
from html import escape
import json
import math
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from importlib.metadata import version

MODEL_REPO = "mlx-community/whisper-large-v3-turbo"
MODEL_REVISION = "a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb"


def save_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    )
    temporary.replace(path)


def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02}.{milliseconds:03}"


def save_vtt(path, segments):
    cues = [
        "WEBVTT",
        "",
        "NOTE Machine-generated local Whisper transcript; not human-reviewed.",
        "",
    ]
    for segment in segments:
        cues.extend(
            [
                f"{timestamp(segment['start'])} --> {timestamp(segment['end'])}",
                escape(segment["text"].replace("-->", "→"), quote=False),
                "",
            ]
        )
    temporary = path.with_suffix(".vtt.tmp")
    temporary.write_text("\n".join(cues) + "\n")
    temporary.replace(path)


def nullable_measurements(record, fields, prefix, warnings):
    normalized = record
    for field in fields:
        value = record.get(field)
        if value is None or math.isfinite(value):
            continue
        if normalized is record:
            normalized = record.copy()
        normalized[field] = None
        warnings.append(f"{prefix}{field}: unavailable non-finite model measurement")
    return normalized


def segments_from(result):
    segments = []
    for raw in result["segments"]:
        text = raw["text"].strip()
        if not text:
            continue
        start, end = raw["start"], raw["end"]
        if (
            not all(
                isinstance(n, (int, float))
                and not isinstance(n, bool)
                and math.isfinite(n)
                for n in (start, end)
            )
            or start < 0
            or end <= start
        ):
            raise ValueError("Whisper returned invalid segment timestamps")
        segment = {
            key: raw[key]
            for key in (
                "start",
                "end",
                "avg_logprob",
                "no_speech_prob",
                "compression_ratio",
            )
            if key in raw
        }
        warnings = []
        segment = nullable_measurements(
            segment,
            ("avg_logprob", "no_speech_prob", "compression_ratio"),
            "",
            warnings,
        )
        segment["text"] = text
        segment["words"] = [
            nullable_measurements(
                word, ("start", "end", "probability"), f"words[{index}].", warnings
            )
            for index, word in enumerate(raw.get("words", []))
        ]
        if warnings:
            segment["qualityWarnings"] = warnings
        segments.append(segment)
    if result.get("text", "").strip() and not segments:
        raise ValueError("Whisper returned text without usable timed segments")
    return segments


def download_audio(video_id, directory, audio_format):
    command = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--ignore-config",
        "--no-plugin-dirs",
        "--no-playlist",
        "--no-write-playlist-metafiles",
        "--no-cookies",
        "--proxy",
        "",
        "--no-cache-dir",
        "--no-js-runtimes",
        "--js-runtimes",
        "node",
        "--retries",
        "0",
        "--fragment-retries",
        "0",
        "--extractor-retries",
        "0",
        "--file-access-retries",
        "0",
        "--socket-timeout",
        "15",
        "--abort-on-unavailable-fragments",
        "--no-progress",
        "--match-filters",
        "!is_live & live_status!=is_upcoming",
        "--format",
        audio_format,
        "--write-info-json",
        "--output",
        str(directory / "audio.%(ext)s"),
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    process = subprocess.run(command, capture_output=True, text=True, timeout=180)
    if process.returncode:
        diagnostic = re.sub(r"https?://\S+", "[URL]", process.stderr.strip())[-1200:]
        raise RuntimeError(diagnostic or "YouTube audio download failed")
    info_path = directory / "audio.info.json"
    info = json.loads(info_path.read_text())
    if (
        info.get("id") != video_id
        or info.get("_type", "video") != "video"
        or "entries" in info
        or info.get("is_live")
        or info.get("live_status") in ("is_live", "is_upcoming", "post_live")
    ):
        raise ValueError("Download was not the requested finite video")
    files = [p for p in directory.iterdir() if p != info_path]
    if (
        len(files) != 1
        or not files[0].is_file()
        or files[0].is_symlink()
        or files[0].suffix in (".part", ".ytdl", ".json")
        or files[0].stat().st_size == 0
    ):
        raise ValueError("Downloaded audio is incomplete")
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type",
            "-of",
            "json",
            str(files[0]),
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=True,
    )
    media = json.loads(probe.stdout)
    duration = float(media["format"]["duration"])
    if (
        not math.isfinite(duration)
        or duration <= 0
        or not any(s.get("codec_type") == "audio" for s in media.get("streams", []))
    ):
        raise ValueError("Downloaded media has no finite audio")
    return files[0], duration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        required=True,
        help="Current private published curation export",
    )
    parser.add_argument("--output", type=Path, default=Path(".local/transcripts"))
    parser.add_argument(
        "--only", help="Smoke-run one ID from the manifest; omit for the entire catalog"
    )
    parser.add_argument(
        "--audio-format",
        default="bestaudio",
        help="Explicit yt-dlp audio format selector; no automatic format retries",
    )
    args = parser.parse_args()
    rows = json.loads(args.manifest.read_text())
    if (
        not isinstance(rows, list)
        or not rows
        or any(
            not isinstance(row, dict)
            or row.get("status") != "published"
            or not re.fullmatch(r"[A-Za-z0-9_-]{11}", row.get("youtubeId", ""))
            for row in rows
        )
    ):
        parser.error("Manifest must contain only actual published video decisions")
    ids = [row["youtubeId"] for row in rows]
    if len(set(ids)) != len(ids):
        parser.error("Manifest contains duplicate video IDs")
    if args.only:
        if args.only not in ids:
            parser.error("Requested smoke ID is not published in this manifest")
        ids = [args.only]
    os.umask(0o077)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    from huggingface_hub import snapshot_download

    model = snapshot_download(
        repo_id=MODEL_REPO,
        revision=MODEL_REVISION,
        allow_patterns=["config.json", "weights.safetensors"],
        local_files_only=True,
        token=False,
    )
    if not all(
        (Path(model) / name).is_file()
        for name in ("config.json", "weights.safetensors")
    ):
        raise RuntimeError("Tombo's pinned local model is not fully cached")
    args.output.mkdir(parents=True, exist_ok=True)
    audio_root = args.output / ".audio"
    audio_root.mkdir(exist_ok=True)
    report = {
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "model": MODEL_REPO,
        "modelRevision": MODEL_REVISION,
        "machineGenerated": True,
        "total": len(ids),
        "results": {video_id: {"status": "pending"} for video_id in ids},
    }

    def report_progress():
        statuses = [entry["status"] for entry in report["results"].values()]
        report["counts"] = {
            status: statuses.count(status) for status in sorted(set(statuses))
        }
        save_json(args.output / "batch.json", report)

    def interrupted(*_):
        raise KeyboardInterrupt()

    signal.signal(signal.SIGTERM, interrupted)
    report_progress()
    print(f"Local Whisper batch: {len(ids)} videos; cached {MODEL_REPO}", flush=True)
    for index, video_id in enumerate(ids, 1):
        target = args.output / f"{video_id}.json"
        vtt = args.output / f"{video_id}.vtt"
        try:
            if target.exists():
                saved = json.loads(target.read_text())
                if (
                    saved.get("youtubeId") != video_id
                    or saved.get("modelRevision") != MODEL_REVISION
                    or not saved.get("machineGenerated")
                ):
                    raise ValueError(
                        "Existing transcript provenance does not match this batch"
                    )
                if not vtt.exists():
                    save_vtt(vtt, saved["segments"])
                status = "completed" if saved["segments"] else "no_speech_detected"
            else:
                report["results"][video_id] = {"status": "downloading"}
                report_progress()
                with tempfile.TemporaryDirectory(
                    prefix=video_id + "-", dir=audio_root
                ) as temporary:
                    audio, duration = download_audio(
                        video_id, Path(temporary), args.audio_format
                    )
                    report["results"][video_id] = {"status": "transcribing"}
                    report_progress()
                    import mlx_whisper

                    result = mlx_whisper.transcribe(
                        str(audio),
                        path_or_hf_repo=model,
                        language="ja",
                        task="transcribe",
                        temperature=0.0,
                        condition_on_previous_text=False,
                        word_timestamps=True,
                        verbose=None,
                    )
                    segments = segments_from(result)
                    saved = {
                        "youtubeId": video_id,
                        "sourceUrl": f"https://www.youtube.com/watch?v={video_id}",
                        "machineGenerated": True,
                        "humanReviewed": False,
                        "engine": "mlx-whisper",
                        "engineVersion": version("mlx-whisper"),
                        "model": MODEL_REPO,
                        "modelRevision": MODEL_REVISION,
                        "requestedLanguage": "ja",
                        "createdAt": datetime.now(timezone.utc).isoformat(),
                        "audioDurationSeconds": duration,
                        "segments": segments,
                    }
                    save_vtt(vtt, segments)
                    save_json(target, saved)
                    status = "completed" if segments else "no_speech_detected"
            report["results"][video_id] = {"status": status}
        except KeyboardInterrupt:
            report["results"][video_id] = {"status": "interrupted"}
            report_progress()
            raise
        except Exception as error:
            message = str(error)[-1200:]
            report["results"][video_id] = {"status": "failed", "error": message}
            if "not a bot" in message.lower():
                report["stopReason"] = (
                    "YouTube requires authenticated audio access; no cookie extraction, retry or bypass was attempted"
                )
                report_progress()
                print(report["stopReason"], flush=True)
                return 2
        report_progress()
        print(
            f"[{index}/{len(ids)}] {video_id}: {report['results'][video_id]['status']}",
            flush=True,
        )
    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    report_progress()
    print(json.dumps(report["counts"]), flush=True)
    return 1 if report["counts"].get("failed") else 0


if __name__ == "__main__":
    raise SystemExit(main())
