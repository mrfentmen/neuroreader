"use strict";
/*
 * NeuroReader — real-site diagnostic probe (fixed extension)
 *
 * Loads the unpacked extension into headed Chromium, opens a real page
 * (YouTube video, Reddit thread, Twitch channel, Wikipedia article, arXiv,
 * news, or docs), waits
 * for the site's sidebar / secondary column, and exercises BOTH paths:
 *
 *   PART A — the real user path: click the injected launcher, then classify
 *            every VISIBLE text block as transformed / untransformed-reason.
 *   PART B — if the extension produced zero transforms, apply the formula
 *            directly to the page DOM from the page world (same walker,
 *            same formula source) to isolate whether the problem is
 *            extension mechanics (click / isolated world) or the formula /
 *            DOM walker itself.
 *
 * Classification reasons:
 *   transformed    — wrapped in our <span data-nr="1"> marker
 *   shadow-root    — untransformed text inside a shadow root
 *   skipped-tag    — untransformed text inside script/style/code/inputs
 *   other          — visible plain-DOM text we should have gotten
 *
 * Handles bot walls / sign-in shells by detecting a near-empty page and
 * reloading once, then reporting honestly if it persists.
 *
 * Run with:  node test/probe-youtube.js [url]
 *   default:  a YouTube video page
 *   example:  node test/probe-youtube.js https://www.reddit.com/r/ADHD/
 * (headless: false — a Chromium window opens on your screen)
 */
const { chromium } = require("playwright");
const path = require("path");
const os = require("os");
const fs = require("fs");

const EXT = path.resolve(__dirname, "..", "extensions", "chrome");
const FORMULA_SRC = fs.readFileSync(
  path.join(EXT, "formula.js"),
  "utf8",
);
const DEFAULT_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const URL = process.argv[2] || DEFAULT_URL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Per-site knowledge: how to find the sidebar / secondary column and the
// lazy-loading "comments-like" region. Falls back gracefully for unknown
// sites (whole-page classification only).
const SITE_CONFIG = {
  "www.youtube.com": {
    name: "YouTube",
    sidebar: "#secondary",
    lazyRegion: "#comments",
  },
  "www.reddit.com": {
    name: "Reddit",
    sidebar: "#sidecar-mounted, aside[aria-label='Post info'], aside#right-rail",
    lazyRegion: "shreddit-comment-tree, #comment-tree",
  },
  "www.twitch.tv": {
    name: "Twitch",
    sidebar: null, // Twitch's right rail is dynamic; whole-page is the signal
    lazyRegion: "section[data-test-selector='chat-room-component-layout'], [data-a-target='chat-room-component-layout']",
  },
  "en.wikipedia.org": {
    name: "Wikipedia",
    sidebar: "#mw-panel",
    lazyRegion: null, // static article; no lazy content
  },
  "github.com": {
    name: "GitHub",
    sidebar: "aside, [aria-label*='sidebar' i]",
    lazyRegion: "main",
  },
  "stackoverflow.com": {
    name: "Stack Overflow",
    sidebar: "aside, #sidebar",
    lazyRegion: "main",
  },
  "news.ycombinator.com": {
    name: "Hacker News",
    sidebar: null,
    lazyRegion: null,
  },
  "www.bbc.com": {
    name: "BBC News",
    sidebar: "[data-testid*='rail' i], aside",
    lazyRegion: "main",
  },
  "arxiv.org": {
    name: "arXiv",
    sidebar: null,
    lazyRegion: ".arxiv-result, #articles",
  },
  "news.google.com": {
    name: "Google News",
    sidebar: null,
    lazyRegion: "main",
  },
  "theverge.com": {
    name: "The Verge",
    sidebar: null,
    lazyRegion: "main",
  },
  "substack.com": {
    name: "Substack",
    sidebar: null,
    lazyRegion: "main",
  },
  "www.npr.org": {
    name: "NPR",
    sidebar: null,
    lazyRegion: "main",
  },
  "npr.org": {
    name: "NPR",
    sidebar: null,
    lazyRegion: "main",
  },
  "www.cnn.com": {
    name: "CNN",
    sidebar: null,
    lazyRegion: "main",
  },
  "cnn.com": {
    name: "CNN",
    sidebar: null,
    lazyRegion: "main",
  },
  "pubmed.ncbi.nlm.nih.gov": {
    name: "PubMed",
    sidebar: null,
    lazyRegion: "main",
  },
  "www.khanacademy.org": {
    name: "Khan Academy",
    sidebar: null,
    lazyRegion: "main",
  },
  "vimeo.com": {
    name: "Vimeo",
    sidebar: null,
    lazyRegion: "main",
  },
  "www.dailymotion.com": {
    name: "Dailymotion",
    sidebar: null,
    lazyRegion: "main",
  },
  "apnews.com": {
    name: "AP News",
    sidebar: null,
    lazyRegion: "main",
  },
  "www.theguardian.com": {
    name: "The Guardian",
    sidebar: null,
    lazyRegion: "main",
  },
  "www.wired.com": {
    name: "WIRED",
    sidebar: null,
    lazyRegion: "main",
  },
  "pypi.org": {
    name: "PyPI",
    sidebar: null,
    lazyRegion: "main",
  },
  "www.npmjs.com": {
    name: "npm",
    sidebar: null,
    lazyRegion: "main",
  },
  "developer.chrome.com": {
    name: "Chrome for Developers",
    sidebar: "nav",
    lazyRegion: "main",
  },
  "docs.python.org": {
    name: "Python Docs",
    sidebar: "nav",
    lazyRegion: "main",
  },
  "www.nasa.gov": {
    name: "NASA",
    sidebar: null,
    lazyRegion: "main",
  },
  "www.cbc.ca": {
    name: "CBC",
    sidebar: null,
    lazyRegion: "main",
  },
  "www.scientificamerican.com": {
    name: "Scientific American",
    sidebar: null,
    lazyRegion: "main",
  },
};
function siteConfig() {
  try {
    // globalThis.URL: the module-level `const URL` (the page address) shadows
    // the URL constructor inside this scope, so `new URL(URL)` would fail.
    const host = new globalThis.URL(URL).hostname.replace(/^www\./, "");
    return (
      SITE_CONFIG[host] ||
      SITE_CONFIG["www." + host] ||
      { name: host, sidebar: null, lazyRegion: null }
    );
  } catch (e) {
    return { name: URL, sidebar: null, lazyRegion: null };
  }
}
const SITE = siteConfig();

/** Classify visible text blocks inside scopeSel (or the whole page). */
async function classify(page, scopeSel, label) {
  let r = null;
  try {
    r = await page.evaluate((scope) => {
      const root = scope ? document.querySelector(scope) : document.body;
      if (!root) return null;

      const blocks = [];
      (function walk(r2, inShadow) {
        const els = r2.querySelectorAll("*");
        for (const el of els) {
          let hasDirectText = false;
          for (const child of el.childNodes) {
            if (
              child.nodeType === Node.TEXT_NODE &&
              child.nodeValue.trim().length >= 2
            ) {
              hasDirectText = true;
              break;
            }
          }
          if (!hasDirectText) continue;
          const rect = el.getBoundingClientRect();
          const visible =
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight &&
            rect.left < window.innerWidth &&
            rect.right > 0;
          if (!visible) continue;
          blocks.push({
            el,
            inShadow,
            text: Array.from(el.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.nodeValue)
              .join(" ")
              .trim(),
            tag: el.tagName.toLowerCase(),
          });
          if (el.shadowRoot) walk(el.shadowRoot, true);
        }
      })(root, false);

      const counts = {
        transformed: 0,
        redFixation: 0,
        "shadow-root": 0,
        "skipped-tag": 0,
        other: 0,
      };
      const examples = { "shadow-root": [], "skipped-tag": [], other: [], redFixation: [] };
      for (const b of blocks) {
        if (b.el.closest("#nr-launcher, [data-nr='ui']")) continue;
        // Our marker is the ONLY reliable "transformed" signal — YouTube
        // itself uses real <b> tags (Subscribe, badges), so don't match those.
        const marker =
          b.el.closest('[data-nr="1"]') ||
          b.el.querySelector('[data-nr="1"]');
        if (marker) {
          counts.transformed++;
          const red = Array.from(marker.querySelectorAll("b")).some((letter) => {
            const color = getComputedStyle(letter).color.replace(/\s/g, "");
            return color !== getComputedStyle(marker).color.replace(/\s/g, "") && color !== "rgb(0,0,0)";
          });
          if (red) {
            counts.redFixation++;
            if (examples.redFixation.length < 5) {
              examples.redFixation.push("<" + b.tag + "> " + b.text.slice(0, 75));
            }
          }
          continue;
        }
        const reason = b.inShadow
          ? "shadow-root"
          : b.el.closest(
              "script,style,noscript,textarea,input,select,option,code,pre",
            )
            ? "skipped-tag"
            : "other";
        counts[reason]++;
        if (examples[reason].length < 8) {
          examples[reason].push("<" + b.tag + "> " + b.text.slice(0, 75));
        }
      }
      return { counts, examples, total: blocks.length };
    }, scopeSel || null);
  } catch (e) {
    console.log("  [" + label + "] evaluate failed: " + e.message.slice(0, 120));
    return;
  }

  if (!r) {
    console.log("  [" + label + "] scope not found on page");
    return;
  }
  console.log("  [" + label + "] " + r.total + " visible text blocks");
  console.log("    transformed: " + r.counts.transformed);
  console.log("    red fixation text: " + r.counts.redFixation);
  if (r.examples.redFixation.length > 0) {
    for (const ex of r.examples.redFixation) console.log("       RED — " + ex);
  }
  for (const reason of ["shadow-root", "skipped-tag", "other"]) {
    if (r.counts[reason] > 0) {
      console.log("    UNTRANSFORMED — " + reason + ": " + r.counts[reason]);
      for (const ex of r.examples[reason]) console.log("       " + ex);
    }
  }
}

/** Count our marker spans in plain DOM + all open shadow roots. */
async function countMarked(page) {
  return page
    .evaluate(() => {
      function count(root) {
        let n = root.querySelectorAll('[data-nr="1"]').length;
        const els = root.querySelectorAll("*");
        for (const el of els) if (el.shadowRoot) n += count(el.shadowRoot);
        return n;
      }
      return count(document);
    })
    .catch(() => -1);
}

/** Does the page look like a real YouTube page or a bot wall / shell? */
async function pageHealth(page) {
  return page
    .evaluate(() => {
      function countText(root, excludeScript) {
        let n = 0;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) {
          const t = w.currentNode;
          if (t.nodeValue.trim().length < 5) continue;
          if (excludeScript && t.parentElement && t.parentElement.closest("script,style")) continue;
          n++;
        }
        return n;
      }
      const h1 = document.querySelector("h1");
      return {
        h1: h1 ? h1.textContent.trim().slice(0, 70) : "(none)",
        plainText: countText(document, true),
        shadowText: (() => {
          let n = 0;
          function walk(root) {
            for (const el of root.querySelectorAll("*")) {
              if (el.shadowRoot) n += countText(el.shadowRoot, true);
            }
          }
          walk(document);
          return n;
        })(),
      };
    })
    .catch(() => ({ h1: "(err)", plainText: -1, shadowText: -1 }));
}

/**
 * PART B: apply the formula directly to YouTube's DOM from the page world —
 * same formula source, same walker logic as content.js — bypassing the
 * extension's click / isolated-world mechanics entirely.
 */
async function replicateInPageWorld(page) {
  console.log("\n--- PART B: applying formula directly in the page world ---");
  const res = await page.evaluate((src) => {
    (0, eval)(src); // define window.NeuroReader in the MAIN world

    const SKIP = "script,style,noscript,textarea,input,select,option,code,pre,[data-nr]";
    function isTransformable(node) {
      const t = node.nodeValue;
      if (!t || !t.trim() || t.length < 2) return false;
      const parent = node.parentElement;
      if (!parent) return false;
      if (parent.closest(SKIP)) return false;
      return true;
    }
    function transformSubtree(root, visited) {
      if (!root || visited.has(root)) return 0;
      visited.add(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
          isTransformable(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT,
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      let changed = 0;
      for (const node of nodes) {
        let html;
        try {
          html = window.NeuroReader.transform(node.nodeValue);
        } catch (err) {
          return { error: String(err).slice(0, 200), changed };
        }
        if (html === node.nodeValue) continue;
        const span = document.createElement("span");
        span.setAttribute("data-nr", "1");
        span.innerHTML = html;
        node.parentNode.replaceChild(span, node);
        changed++;
      }
      if (root.querySelectorAll) {
        const els = root.querySelectorAll("*");
        for (const el of els) {
          if (el.shadowRoot) {
            const sub = transformSubtree(el.shadowRoot, visited);
            if (sub && sub.error) return sub;
            changed += sub;
          }
        }
      }
      return { changed, error: null };
    }

    const out = transformSubtree(document.body, new Set());
    return { changed: out.changed, error: out.error };
  }, FORMULA_SRC);

  if (res.error) {
    console.log("  !!! formula threw on YouTube's DOM:", res.error);
    return;
  }
  console.log("  text nodes transformed by page-world walker:", res.changed);
  const marked = await countMarked(page);
  console.log("  [data-nr='1'] spans now in DOM:", marked);
  await sleep(400);
  await classify(page, null, "page world after replication");
}

async function main() {
  console.log(
    "NeuroReader — real-site diagnostic probe (fixed extension): " +
      SITE.name +
      "\n",
  );
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nr-yt-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--no-first-run",
      "--disable-blink-features=AutomationControlled",
    ],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) =>
    console.log("  [pageerror]", e.message.slice(0, 160)),
  );
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
      console.log("  [console.error]", m.text().slice(0, 140));
  });

  console.log("Opening " + URL);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  try {
    const accept = page.locator("button", { hasText: /Accept all|I agree|Reject all/i }).first();
    if (await accept.isVisible({ timeout: 2500 })) {
      await accept.click();
      await sleep(1200);
    }
  } catch (e) {}
  await page.keyboard.press("Escape").catch(() => {});

  // Wait for real content; reload once if it looks like a bot wall.
  let health = await pageHealth(page);
  console.log("Title: " + health.h1 + " | plain text nodes: " + health.plainText + " | shadow: " + health.shadowText);
  if (health.plainText < 10 && health.h1 === "(none)") {
    console.log("  Looks like a bot wall / shell — reloading once…");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await sleep(3000);
    health = await pageHealth(page);
    console.log("  After reload — Title: " + health.h1 + " | plain: " + health.plainText + " | shadow: " + health.shadowText);
  }
  if (health.plainText < 10) {
    console.log(
      "  !!! " +
        SITE.name +
        " served a near-empty page (bot wall / sign-in / JS gate).\n      Results below are NOT meaningful — the deterministic hardpage fixture is the reliable evidence for the fixes.",
    );
  }

  // Wait for the site's sidebar / secondary column to render (if known).
  let sidebar = false;
  if (SITE.sidebar) {
    try {
      await page.waitForFunction(
        (sel) => {
          const sec = document.querySelector(sel);
          if (!sec) return false;
          const w = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
          let c = 0;
          while (w.nextNode()) {
            if (w.currentNode.nodeValue.trim().length >= 10 && ++c >= 3)
              return true;
          }
          return false;
        },
        SITE.sidebar,
        { timeout: 25000 },
      );
      sidebar = true;
      console.log("  Sidebar rendered (" + SITE.sidebar + ").");
    } catch (e) {
      console.log("  WARN: sidebar (" + SITE.sidebar + ") never rendered.");
    }
  } else {
    console.log("  (no known sidebar selector for " + SITE.name + " — whole-page only)");
  }
  await sleep(1500);

  // ---- PART A: the real user path — click the launcher ----
  const launcher = await page.locator("#nr-launcher").count().catch(() => 0);
  console.log("\nLauncher button injected: " + (launcher ? "yes" : "NO"));
  let spansAfterRealClick = 0;
  if (launcher) {
    // Is anything covering the launcher's center point?
    const covered = await page
      .evaluate(() => {
        const b = document.getElementById("nr-launcher");
        if (!b) return "no-launcher";
        const r = b.getBoundingClientRect();
        const at = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        return at && at.id === "nr-launcher"
          ? "not-covered"
          : at ? "covered-by <" + at.tagName + "> " + String(at.className || at.id || "").slice(0, 30) : "at-null";
      })
      .catch(() => "check-failed");

    console.log("  launcher center: " + covered);

    const wasActive = await page.evaluate(() =>
      document.getElementById("nr-launcher")?.getAttribute("aria-pressed") === "true",
    ).catch(() => false);
    console.log("  transform state before click: " + (wasActive ? "active" : "inactive"));
    console.log("  (real click only when inactive)");
    if (wasActive) {
      spansAfterRealClick = await countMarked(page);
    } else {
      await page.click("#nr-launcher", { force: true, timeout: 10000 }).catch((e) => {
        console.log("  click failed: " + e.message.slice(0, 100));
      });
      await sleep(2500); // apply() + sticky debounce window
      const label = await page.evaluate(
        () => document.getElementById("nr-launcher")?.textContent || "",
      ).catch(() => "");
      spansAfterRealClick = await countMarked(page);
      console.log(
        '  launcher label: "' + label + '" | [data-nr] spans: ' + spansAfterRealClick,
      );
    }
    // If the real click didn't land, retry programmatically (handler fires
    // regardless of overlays) to separate click-landing from transform.
    if (spansAfterRealClick === 0) {
      console.log("  (programmatic .click() fallback — bypasses overlays)");
      await page.evaluate(() =>
        document.getElementById("nr-launcher").click(),
      ).catch(() => {});
      await sleep(2000);
      const label2 = await page.evaluate(
        () => document.getElementById("nr-launcher")?.textContent || "",
      ).catch(() => "");
      spansAfterRealClick = await countMarked(page);
      console.log(
        '  launcher label: "' + label2 + '" | [data-nr] spans: ' + spansAfterRealClick,
      );
    }
  }

  console.log("\n--- After Transform (top of page) ---");
  await classify(page, null, "viewport");
  if (sidebar) {
    console.log("\n--- Sidebar (#secondary) only ---");
    await classify(page, "#secondary", "sidebar");
  }

  console.log(
    "\n--- Scrolling to " +
      (SITE.lazyRegion ? "lazy region (" + SITE.lazyRegion + ")" : "page end (no known lazy region)") +
      " (dynamic content + sticky) ---",
  );
  await page
    .evaluate((sel) => {
      const c = sel ? document.querySelector(sel) : null;
      (c || document.body).scrollIntoView({ behavior: "instant", block: "start" });
      // For sites with no known lazy region, scroll a few screens so lazy
      // content elsewhere still gets a chance to render.
      if (!c) {
        let y = 0;
        while (y < document.body.scrollHeight) {
          window.scrollTo(0, (y += window.innerHeight * 0.9));
        }
      }
    }, SITE.lazyRegion)
    .catch(() => {});
  await sleep(3500);
  await classify(page, null, "scrolled view");

  // ---- PART B: if the extension produced nothing, replicate in page world ----
  if (spansAfterRealClick === 0 && health.plainText >= 10) {
    await replicateInPageWorld(page);
  } else if (spansAfterRealClick === 0) {
    console.log(
      "\n(Skipping PART B — page was a shell, replication would be meaningless.)",
    );
  }

  await context.close();
  console.log("\nProbe finished.");
  process.exit(0);
}

main().catch((e) => {
  console.error("PROBE FAILED:", e.message);
  process.exit(1);
});
