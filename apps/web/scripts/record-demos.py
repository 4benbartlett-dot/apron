"""Film a phone-sized scroll down /guide, so you can WATCH the demos arrive.

    pip install playwright pillow && playwright install chromium
    pnpm -C apps/web dev            # or any server on :3100
    python3 apps/web/scripts/record-demos.py /tmp

Why this exists. The guide's demos are `infinite` loops gated on an
IntersectionObserver (see components/PlayWhenSeen.tsx), and that combination is
miserable to verify through an automation pane: a backgrounded tab has
requestAnimationFrame suspended, and BOTH observer delivery and the CSS
animation clock ride on it. Everything reads as broken while being perfectly
fine in a real browser — measured 0 rAF ticks in 500ms in that state.

Playwright's Chromium is not backgrounded, so rAF simply runs and the whole
thing behaves. Nothing here touches a class or pokes an animation: the scroll is
the only input, and the printout below shows the demos releasing because of it
(5 held at load, 0 by the bottom). If you are ever unsure whether a motion
change is real, record it rather than reasoning about computed styles.
"""
import io, sys, time
from PIL import Image
from playwright.sync_api import sync_playwright

OUT, URL, FPS = sys.argv[1], "http://localhost:3100/guide", 10

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 375, "height": 812},
                        device_scale_factor=1, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle")
    time.sleep(1.0)
    print("held at load:", page.evaluate("document.querySelectorAll('.anim-hold').length"))

    frames, notes = [], []
    total = page.evaluate("document.documentElement.scrollHeight")

    def shoot():
        frames.append(Image.open(io.BytesIO(page.screenshot())).convert("RGB"))

    # Ease down the page, pausing at each Play so its demo can perform.
    y = 0
    stops = 0
    while y < total - 812 and len(frames) < 460:
        y += 95
        page.evaluate(f"window.scrollTo({{top:{y}, behavior:'instant'}})")
        shoot()
        time.sleep(1 / FPS)
        # Every ~900px, hold still for 3s — long enough to watch a stamp land.
        if y // 900 > stops:
            stops = y // 900
            held = page.evaluate("document.querySelectorAll('.anim-hold').length")
            notes.append((y, held))
            for _ in range(int(FPS * 3.0)):
                shoot()
                time.sleep(1 / FPS)

    print("held after scroll:", page.evaluate("document.querySelectorAll('.anim-hold').length"))
    ctx.close(); b.close()

for y, held in notes:
    print(f"  paused at y={y:<6} still held: {held}")

w, h = frames[0].size
sc = 300 / w
frames = [f.resize((int(w * sc), int(h * sc)), Image.LANCZOS) for f in frames]
path = f"{OUT}/guide-scroll-mobile.gif"
frames[0].save(path, save_all=True, append_images=frames[1:],
               duration=int(1000 / FPS), loop=0, optimize=True)
print(f"\n{path}  {len(frames)} frames  {frames[0].size[0]}x{frames[0].size[1]}")
