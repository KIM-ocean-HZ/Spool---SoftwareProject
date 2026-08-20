#!/usr/bin/env python3
"""Assembles the promo video from the rendered posters.

Built from the poster PNGs on purpose: the video and the stills can never
disagree about a number, because they are the same pixels. Each scene gets a
slow push (alternating in/out) and the scenes crossfade. Silent — social
platforms autoplay muted anyway, and a soundtrack is one more thing to license.
"""
import subprocess, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, '..', 'out')

CUTS = {
    'vertical': dict(w=1080, h=1440, scenes=[
        'hero-zh', 'paste-zh', 'freetier-zh', 'cost-zh', 'failures-zh', 'outro-zh']),
    'wide':     dict(w=1920, h=1080, scenes=[
        'hero-en', 'paste-en', 'freetier-en', 'tcc-en', 'failures-en', 'outro-en']),
}

HOLD, XFADE, FPS = 4.0, 0.7, 30


def build(name, spec):
    w, h, scenes = spec['w'], spec['h'], spec['scenes']
    frames = int(HOLD * FPS)

    cmd = ['ffmpeg', '-y']
    for s in scenes:
        # Exactly ONE frame per input. zoompan emits `d` frames per frame it is
        # handed, so feeding it a 4-second clip yields d*100 frames, not d.
        cmd += ['-loop', '1', '-framerate', '1', '-t', '1',
                '-i', os.path.join(OUT, f'{s}.png')]

    parts = []
    for i in range(len(scenes)):
        # alternate the push direction so consecutive scenes do not feel identical
        z = (f"'min(1.001+0.00075*on,1.09)'" if i % 2 == 0
             else f"'max(1.09-0.00075*on,1.001)'")
        parts.append(
            # feed zoompan a modest oversample: enough headroom for a 1.09 push
            # without asking it to render every frame at poster resolution
            f"[{i}:v]scale={int(w*1.3)}:{int(h*1.3)}:force_original_aspect_ratio=increase,"
            f"crop={int(w*1.3)}:{int(h*1.3)},"
            f"zoompan=z={z}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={frames}:s={w}x{h}:fps={FPS},setsar=1[v{i}]")

    prev, offset = 'v0', HOLD - XFADE
    for i in range(1, len(scenes)):
        tag = f'x{i}'
        parts.append(f"[{prev}][v{i}]xfade=transition=fade:duration={XFADE}:"
                     f"offset={offset:.3f}[{tag}]")
        prev, offset = tag, offset + HOLD - XFADE

    dest = os.path.join(HERE, f'spool-{name}.mp4')
    cmd += ['-filter_complex', ';'.join(parts), '-map', f'[{prev}]',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-threads', '0',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dest]

    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-2500:], file=sys.stderr)
        raise SystemExit(f'ffmpeg failed on {name}')
    dur = len(scenes) * HOLD - (len(scenes) - 1) * XFADE
    print(f'  {os.path.relpath(dest, HERE)}  {w}x{h}  ~{dur:.1f}s  '
          f'{os.path.getsize(dest)/1e6:.1f} MB')


for n, s in CUTS.items():
    build(n, s)
