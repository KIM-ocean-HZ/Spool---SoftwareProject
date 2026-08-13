#!/usr/bin/env python3
"""Compare two visual snapshots with explicit pixel and channel thresholds."""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops


def ratio(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed) or parsed < 0 or parsed > 1:
        raise argparse.ArgumentTypeError("must be a finite number from 0 through 1")
    return parsed


def channel(value: str) -> int:
    parsed = int(value)
    if parsed < 0 or parsed > 255:
        raise argparse.ArgumentTypeError("must be an integer from 0 through 255")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare visual snapshots and emit a highlighted diff image."
    )
    parser.add_argument("--baseline", required=True, type=Path)
    parser.add_argument("--current", required=True, type=Path)
    parser.add_argument("--diff", required=True, type=Path)
    parser.add_argument("--label", required=True)
    parser.add_argument("--pixel-delta", type=channel, default=8)
    parser.add_argument("--max-changed-ratio", type=ratio, default=0.001)
    parser.add_argument("--max-channel-diff", type=channel, default=32)
    return parser.parse_args()


def rgba_canvas(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.paste(image.convert("RGBA"), (0, 0))
    return canvas


def save_highlighted_diff(
    current: Image.Image, mask: Image.Image, destination: Path
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    muted = current.convert("RGBA").convert("L").convert("RGBA")
    muted.putalpha(155)
    highlight = Image.new("RGBA", current.size, (255, 0, 110, 230))
    visual = Image.composite(highlight, muted, mask)
    visual.save(destination, format="PNG", optimize=True)


def main() -> int:
    args = parse_args()

    if not args.baseline.is_file():
        print(f"FAIL {args.label}: missing baseline {args.baseline}", file=sys.stderr)
        return 2
    if not args.current.is_file():
        print(f"FAIL {args.label}: missing current {args.current}", file=sys.stderr)
        return 2

    try:
        with Image.open(args.baseline) as baseline_source:
            baseline_source.load()
            baseline_size = baseline_source.size
            baseline = baseline_source.convert("RGBA")
        with Image.open(args.current) as current_source:
            current_source.load()
            current_size = current_source.size
            current = current_source.convert("RGBA")
    except (OSError, ValueError) as error:
        print(f"FAIL {args.label}: could not read PNG input: {error}", file=sys.stderr)
        return 2

    canvas_size = (
        max(baseline_size[0], current_size[0]),
        max(baseline_size[1], current_size[1]),
    )
    baseline_canvas = rgba_canvas(baseline, canvas_size)
    current_canvas = rgba_canvas(current, canvas_size)
    difference = ImageChops.difference(baseline_canvas, current_canvas)

    channels = difference.split()
    max_channel_difference = max(extrema[1] for extrema in difference.getextrema())
    mask = channels[0].point(
        lambda value: 255 if value > args.pixel_delta else 0, mode="L"
    )
    for difference_channel in channels[1:]:
        channel_mask = difference_channel.point(
            lambda value: 255 if value > args.pixel_delta else 0, mode="L"
        )
        mask = ImageChops.lighter(mask, channel_mask)

    histogram = mask.histogram()
    changed_pixels = sum(histogram[1:])
    total_pixels = canvas_size[0] * canvas_size[1]
    changed_ratio = changed_pixels / total_pixels if total_pixels else 1.0
    dimensions_match = baseline_size == current_size
    passed = (
        dimensions_match
        and changed_ratio <= args.max_changed_ratio
        and max_channel_difference <= args.max_channel_diff
    )

    if changed_pixels or not dimensions_match:
        save_highlighted_diff(current_canvas, mask, args.diff)
    else:
        args.diff.unlink(missing_ok=True)

    status = "PASS" if passed else "FAIL"
    print(
        f"{status} {args.label}: "
        f"size={baseline_size}->{current_size}; "
        f"changed={changed_pixels}/{total_pixels} "
        f"ratio={changed_ratio:.6f} (limit<={args.max_changed_ratio:.6f}, "
        f"pixel_delta>{args.pixel_delta}); "
        f"max_channel_diff={max_channel_difference} "
        f"(limit<={args.max_channel_diff})"
    )
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
