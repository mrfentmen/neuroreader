"use strict";
/*
 * NeuroReader — "hard page" e2e (SPA / YouTube-style failure modes)
 *
 * Loads the extension into Playwright's bundled Chromium and drives the
 * test/fixtures/hardpage.html fixture, which reproduces exactly why parts
 * of YouTube didn't transform:
 *
 *   1. sidebar items injected AFTER the user clicks Transform  (sticky fix)
 *   2. the whole sidebar recycled/replaced (virtualized list)  (sticky fix)
 *   3. a text node rewritten in place                            (characterData)
 *   4. text inside an open shadow root                           (shadow fix)
 *
 * Run with:  npx playwright install chromium   (one time)
 *            node test/hardpage.e2e.js
 *            (serves the repo on http://127.0.0.1:8111)
 */
const { chromium } = require("playwright");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { startFixtureServer } = require("./fixture-server.js");

const EXT = path.resolve(__dirname, "..", "extensions", "chrome");
const URL = "http://127.0.0.1:8111/test/fixtures/hardpage.html";

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log("  \u2713 " + name);
  } else {
    failed++;
    console.log("  \u2717 " + name + (detail ? " — " + detail : ""));
  }
}

async function getExtensionId(page) {
  await page.goto("chrome://extensions/");
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    function walk(root) {
      let ids = [];
      for (const el of root.querySelectorAll("extensions-item")) ids.push(el.id);
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) ids = ids.concat(walk(el.shadowRoot));
      }
      return ids;
    }
    const ids = walk(document);
    return ids.find((i) => i && i.length === 32) || null;
  });
}

async function main() {
  console.log("NeuroReader hard-page e2e (SPA failure modes)\n");
  const fixtureServer = await startFixtureServer(8111);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nr-hard-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });

  const probe = await context.newPage();
  const extId = await getExtensionId(probe);
  ok("extension loaded (id=" + (extId || "?") + ")", !!extId);
  await probe.close();

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForSelector("#nr-launcher", { timeout: 10000 });

  // Auto-transform is ON by default: the page is already transformed on
  // load — BEFORE the sidebar items exist, like on YouTube. No click needed.
  await page.waitForFunction(
    () => document.querySelector("#main-title").querySelector('b, [data-nr="1"]') !== null,
    { timeout: 10000 },
  );
  ok("main title auto-transformed on load (no click)", true);

  const bolded = (sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      return el.querySelector('b, [data-nr="1"]') !== null;
    }, sel);

  // 1. Late-rendered sidebar items must be caught by the sticky watcher.
  await page.waitForFunction(
    () => document.querySelectorAll("#sidebar .sidebar-item").length === 3,
    { timeout: 8000 },
  );
  await page.waitForFunction(
    () => {
      const items = document.querySelectorAll("#sidebar .sidebar-item");
      return (
        items.length === 3 &&
        Array.from(items).every((el) => el.querySelector('b, [data-nr="1"]') !== null)
      );
    },
    { timeout: 8000 },
  );
  ok("late-rendered sidebar items transformed (sticky)", true);

  // 2. Recycled sidebar content must be re-transformed.
  await page.waitForFunction(
    () => document.querySelectorAll("#sidebar .sidebar-item").length === 2,
    { timeout: 8000 },
  );
  await page.waitForFunction(
    () => {
      const items = document.querySelectorAll("#sidebar .sidebar-item");
      return (
        items.length === 2 &&
        Array.from(items).every((el) => el.querySelector('b, [data-nr="1"]') !== null)
      );
    },
    { timeout: 8000 },
  );
  ok("recycled sidebar content re-transformed", true);

  // 3. In-place text rewrite (characterData) must be transformed.
  await page.waitForFunction(
    () => document.getElementById("inplace").textContent.includes("rewritten in place"),
    { timeout: 8000 },
  );
  await page.waitForFunction(
    () =>
      document
        .getElementById("inplace")
        .querySelector('b, [data-nr="1"]') !== null,
    { timeout: 8000 },
  );
  ok("in-place rewritten text transformed (characterData)", true);

  // 4. Text inside the open shadow root must be transformed.
  await page.waitForFunction(
    () => {
      const sr = document.getElementById("shadow-host").shadowRoot;
      return sr && sr.querySelector('b, [data-nr="1"]') !== null;
    },
    { timeout: 8000 },
  );
  ok("shadow-root text transformed (shadow walker)", true);

  // 5. Late content APPENDED INSIDE an open shadow root after transform
  //    (chat feed) must be caught by the per-shadow-root observer.
  await page.waitForFunction(
    () => {
      const sr = document.getElementById("shadow-live").shadowRoot;
      if (!sr) return false;
      const chat = sr.getElementById("chat");
      return chat && chat.querySelectorAll("p").length === 3;
    },
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => {
      const sr = document.getElementById("shadow-live").shadowRoot;
      return sr && sr.querySelectorAll('[data-nr="1"]').length === 3;
    },
    { timeout: 15000 },
  );
  ok("late content inside shadow root transformed (per-shadow-root observer)", true);

  // 6. A shadow root attached to a NEW element AFTER transform (SPA upgrade)
  //    must be discovered, watched, and transformed. Note: the element does
  //    not exist until the fixture inserts it — predicates must be null-safe
  //    (Playwright aborts waitForFunction if the predicate throws).
  await page.waitForFunction(
    () => {
      const el = document.getElementById("shadow-late-host");
      return el !== null && el.shadowRoot !== null;
    },
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => {
      const el = document.getElementById("shadow-late-host");
      const sr = el && el.shadowRoot;
      return sr !== null && sr.querySelector('[data-nr="1"]') !== null;
    },
    { timeout: 15000 },
  );
  ok("shadow root attached after transform discovered + transformed", true);

  // 6b. A shadow root attached to a PRE-EXISTING element fires no light-DOM
  //     mutation — the watcher must discover it via the periodic discovery
  //     poll (this Chromium build has no shadowrootattached event).
  await page.waitForFunction(
    () => {
      const el = document.getElementById("shadow-upgrade-host");
      return el !== null && el.shadowRoot !== null;
    },
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => {
      const el = document.getElementById("shadow-upgrade-host");
      const sr = el && el.shadowRoot;
      return sr !== null && sr.querySelector('[data-nr="1"]') !== null;
    },
    { timeout: 15000 },
  );
  ok("pre-existing-host shadow root discovered (discovery poll)", true);

  // 7. ADAPTIVE bolding: text that is ALREADY bold (headings, <strong>,
  //    inline font-weight) must get the color formula instead of bold-on-
  //    bold, while normal-weight text keeps the plain bold formula.
  const adaptive = await page.evaluate(() => {
    const mode = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const span = el.querySelector('[data-nr="1"]');
      if (!span) return null;
      return span.getAttribute("data-nr-mode");
    };
    const colorVar = (id) => {
      const el = document.getElementById(id);
      const span = el && el.querySelector('[data-nr="1"]');
      return span ? span.style.getPropertyValue("--nr-color") : null;
    };
    const bWeight = (id) => {
      const el = document.getElementById(id);
      const b = el && el.querySelector('[data-nr="1"] b');
      return b ? window.getComputedStyle(b).fontWeight : null;
    };
    const parentWeight = (id) => {
      const el = document.getElementById(id);
      return el ? window.getComputedStyle(el).fontWeight : null;
    };
    const lum = (c) => {
      const m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      if (!m) return null;
      return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
    };
    const shadeOf = (id) => {
      const el = document.getElementById(id);
      const span = el && el.querySelector('[data-nr="1"]');
      const b = span && span.querySelector("b");
      return b ? window.getComputedStyle(b).color : null;
    };
    return {
      strongMode: mode("bold-strong"),
      strongColor: colorVar("bold-strong"),
      inlineMode: mode("bold-inline"),
      inlineColor: colorVar("bold-inline"),
      rgbaMode: mode("bold-rgba"),
      rgbaColor: colorVar("bold-rgba"),
      h1Mode: mode("main-title"),
      normalMode: mode("normal-weight"),
      bWeightStrong: bWeight("bold-strong"),
      parentWeightStrong: parentWeight("bold-strong"),
      bWeightNormal: bWeight("normal-weight"),
      parentWeightNormal: parentWeight("normal-weight"),
      // Pure-black text (strong): cannot get darker — shade must differ and
      // stay in the readable band (a visible dark gray, not unchanged black).
      shadeStrong: lum(shadeOf("bold-strong")),
      parentStrong: lum(getComputedStyle(document.getElementById("bold-strong")).color),
      // Mid-tone text (lum 0.34): MUST shift darker — pins the direction.
      shadeMid: lum(shadeOf("bold-mid")),
      parentMid: lum(getComputedStyle(document.getElementById("bold-mid")).color),
      // rgba() color must still produce a visible shade (alpha ignored).
      shadeRgba: lum(shadeOf("bold-rgba")),
    };
  });
  ok(
    "already-bold text (strong) gets color mode: " + adaptive.strongMode,
    adaptive.strongMode === "color" && !!adaptive.strongColor,
  );
  ok(
    "already-bold text (inline 700) gets color mode: " + adaptive.inlineMode,
    adaptive.inlineMode === "color" && !!adaptive.inlineColor,
  );
  ok(
    "already-bold rgba() text gets color mode + shade: " + adaptive.rgbaMode,
    adaptive.rgbaMode === "color" && !!adaptive.rgbaColor && adaptive.shadeRgba > 0.05 && adaptive.shadeRgba < 0.95,
  );
  ok(
    "heading (h1) gets color mode: " + adaptive.h1Mode,
    adaptive.h1Mode === "color",
  );
  ok(
    "normal-weight text keeps plain bold mode: " + adaptive.normalMode,
    adaptive.normalMode === null || adaptive.normalMode === "bold",
  );
  ok(
    "color mode adds no extra weight (b=" + adaptive.bWeightStrong + " vs parent=" + adaptive.parentWeightStrong + ")",
    adaptive.bWeightStrong === adaptive.parentWeightStrong,
  );
  ok(
    "black text gets a visible shade (shade=" + adaptive.shadeStrong.toFixed(2) + " vs parent=" + adaptive.parentStrong.toFixed(2) + ")",
    Math.abs(adaptive.shadeStrong - adaptive.parentStrong) > 0.05 &&
      adaptive.shadeStrong > 0.05 &&
      adaptive.shadeStrong < 0.95,
  );
  ok(
    "mid-tone bold text remains visibly shaded",
    adaptive.shadeMid > 0.05 && adaptive.shadeMid < 0.95,
  );
  ok(
    "normal mode still bolds (b=" + adaptive.bWeightNormal + " vs parent=" + adaptive.parentWeightNormal + ")",
    parseInt(adaptive.bWeightNormal, 10) > parseInt(adaptive.parentWeightNormal, 10),
  );

  // 8. Title-like bold text uses the clearly visible red fixation shade.
  const titleShade = await page.evaluate(() => {
    const span = document.querySelector("#title-color [data-nr=\"1\"]");
    const b = span && span.querySelector("b");
    return {
      mode: span && span.getAttribute("data-nr-mode"),
      variable: span && span.style.getPropertyValue("--nr-color"),
      color: b && getComputedStyle(b).color,
    };
  });
  ok(
    "title-like bold text uses red fixation color",
    titleShade.mode === "color" &&
      /rgb\(220,\s*38,\s*38\)/.test(titleShade.variable) &&
      /rgb\(220,\s*38,\s*38\)/.test(titleShade.color),
    JSON.stringify(titleShade),
  );

  // 8b. Homepage/search card titles are often normal-weight custom elements,
  // so title affordances must still use the red fixation color.
  const cardTitles = await page.evaluate(() =>
    Array.from(document.querySelectorAll(
      "#youtube-home-cards [data-nr=\"1\"], #youtube-search-cards [data-nr=\"1\"]",
    )).map((span) => {
      const b = span.querySelector("b");
      return {
        text: span.textContent,
        mode: span.getAttribute("data-nr-mode"),
        variable: span.style.getPropertyValue("--nr-color"),
        color: b && getComputedStyle(b).color,
      };
    }),
  );
  ok(
    "homepage/search card titles all use red fixation color",
    cardTitles.length === 4 && cardTitles.every((card) =>
      card.mode === "color" &&
      /rgb\(220,\s*38,\s*38\)/.test(card.variable) &&
      /rgb\(220,\s*38,\s*38\)/.test(card.color),
    ),
    JSON.stringify(cardTitles),
  );

  // 8c. Reddit-like feeds must color already-bold navigation, post titles,
  // comments, and links even though they have no YouTube-specific selector.
  const redditBold = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#reddit-like [data-nr=\"1\"]")).map((span) => {
      const b = span.querySelector("b");
      return {
        text: span.textContent,
        mode: span.getAttribute("data-nr-mode"),
        variable: span.style.getPropertyValue("--nr-color"),
        color: b && getComputedStyle(b).color,
      };
    }),
  );
  ok(
    "Reddit-like bold navigation/posts/comments use red fixation color",
    redditBold.length >= 8 && redditBold.every((item) =>
      item.mode === "color" &&
      /rgb\(220,\s*38,\s*38\)/.test(item.variable) &&
      /rgb\(220,\s*38,\s*38\)/.test(item.color),
    ),
    JSON.stringify(redditBold),
  );
  await page.waitForFunction(
    () => document.querySelector("#reddit-late-comments [data-nr=\"1\"]") !== null,
    { timeout: 10000 },
  );
  const lateReddit = await page.evaluate(() => {
    const span = document.querySelector("#reddit-late-comments [data-nr=\"1\"]");
    const b = span && span.querySelector("b");
    return {
      mode: span && span.getAttribute("data-nr-mode"),
      variable: span && span.style.getPropertyValue("--nr-color"),
      color: b && getComputedStyle(b).color,
    };
  });
  ok(
    "late Reddit-style comment uses red fixation color",
    lateReddit.mode === "color" &&
      /rgb\(220,\s*38,\s*38\)/.test(lateReddit.variable) &&
      /rgb\(220,\s*38,\s*38\)/.test(lateReddit.color),
    JSON.stringify(lateReddit),
  );

  // 8c. Cross-site representatives: GitHub issue links, article/news and
  // documentation headings, plus Twitch stream/chat text on a dark surface.
  const crossSite = await page.evaluate(() => {
    const selectors = [
      "#multi-site-like .Link--primary [data-nr=\"1\"]",
      "#multi-site-like article h1 [data-nr=\"1\"]",
      "#multi-site-like article h2 [data-nr=\"1\"]",
      "#multi-site-like [data-a-target=\"stream-title\"] [data-nr=\"1\"]",
      "#multi-site-like [data-a-target=\"chat-message-username\"] [data-nr=\"1\"]",
      "#multi-site-like [data-a-target=\"chat-line-message\"] strong [data-nr=\"1\"]",
    ];
    return selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))).map((span) => {
      const b = span.querySelector("b");
      return {
        text: span.textContent,
        mode: span.getAttribute("data-nr-mode"),
        variable: span.style.getPropertyValue("--nr-color"),
        color: b && getComputedStyle(b).color,
      };
    });
  });
  ok(
    "GitHub/news/docs/Twitch content uses red fixation color",
    crossSite.length >= 5 && crossSite.every((item) =>
      item.mode === "color" &&
      /rgb\(220,\s*38,\s*38\)/.test(item.variable) &&
      /rgb\(220,\s*38,\s*38\)/.test(item.color),
    ),
    JSON.stringify(crossSite),
  );
  await page.waitForFunction(
    () => document.querySelector("#twitch-late-chat [data-nr=\"1\"]") !== null,
    { timeout: 10000 },
  );
  const lateTwitch = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("#twitch-late-chat [data-nr=\"1\"]"));
    return spans.map((span) => {
      const b = span.querySelector("b");
      return {
        text: span.textContent,
        mode: span.getAttribute("data-nr-mode"),
        variable: span.style.getPropertyValue("--nr-color"),
        color: b && getComputedStyle(b).color,
      };
    });
  });
  ok(
    "late Twitch chat content uses red fixation color",
    lateTwitch.length >= 2 && lateTwitch.every((item) =>
      item.mode === "color" &&
      /rgb\(220,\s*38,\s*38\)/.test(item.variable) &&
      /rgb\(220,\s*38,\s*38\)/.test(item.color),
    ),
    JSON.stringify(lateTwitch),
  );

  // 8d. GitLab, docs/articles, Google/package results, and public chat/help
  // hooks are normal-weight site UI that should still get visible red points.
  const moreSites = await page.evaluate(() => {
    const selectors = [
      "#multi-site-like .issuable-title [data-nr=\"1\"]",
      "#multi-site-like .arxiv-result > .title [data-nr=\"1\"]",
      "#multi-site-like main h1 [data-nr=\"1\"]",
      "#multi-site-like main h2 [data-nr=\"1\"]",
      "#multi-site-like #search h3 [data-nr=\"1\"]",
      "#multi-site-like #google-news-like a[aria-label*=' - '][href*='/read/'] [data-nr=\"1\"]",
      "#multi-site-like .package-list-item [data-nr=\"1\"]",
      "#multi-site-like [data-testid=\"message-content\"] strong [data-nr=\"1\"]",
      "#multi-site-like [data-testid=\"channel-name\"] [data-nr=\"1\"]",
    ];
    return selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))).map((span) => {
      const b = span.querySelector("b");
      return { mode: span.getAttribute("data-nr-mode"), variable: span.style.getPropertyValue("--nr-color"), color: b && getComputedStyle(b).color };
    });
  });
  ok(
    "GitLab/docs/search/package/chat UI uses red fixation color",
    moreSites.length >= 9 && moreSites.every((item) => item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)),
    JSON.stringify(moreSites),
  );
  const arxivAuthor = await page.evaluate(() => {
    const span = document.querySelector("#multi-site-like .arxiv-result .authors [data-nr=\"1\"]");
    return span ? span.getAttribute("data-nr-mode") : null;
  });
  ok("arXiv author metadata is not title-colored", arxivAuthor !== "color", arxivAuthor || "not transformed");
  const googleNewsMetadata = await page.evaluate(() => {
    const nodes = [
      document.querySelector("#google-news-like a[aria-label='Example News source'] [data-nr=\"1\"]"),
      document.querySelector("#google-news-like time [data-nr=\"1\"]"),
    ].filter(Boolean);
    return nodes.map((span) => span.getAttribute("data-nr-mode"));
  });
  const googleNewsTime = await page.evaluate(() => {
    const span = document.querySelector("#google-news-like time [data-nr=\"1\"]");
    return span ? span.style.getPropertyValue("--nr-color").replace(/\\s/g, "") : "";
  });
  ok("Google News source stays out of title color while time keeps metadata color", googleNewsMetadata[0] !== "color" && googleNewsMetadata[1] === "color" && googleNewsTime === "rgb(220,38,38)", JSON.stringify({ modes: googleNewsMetadata, timeShade: googleNewsTime }));

  const nprControls = await page.evaluate(() => Array.from(document.querySelectorAll("#npr-like [data-nr=\"1\"]")).map((span) => {
    const b = span.querySelector("b");
    return { mode: span.getAttribute("data-nr-mode"), variable: span.style.getPropertyValue("--nr-color"), color: b && getComputedStyle(b).color };
  }));
  ok("NPR audio/navigation controls use red fixation color", nprControls.length === 6 && nprControls.every((item) => item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)), JSON.stringify(nprControls));

  const publisherCards = await page.evaluate(() => Array.from(document.querySelectorAll("#publisher-like [data-nr=\"1\"]")).map((span) => {
    const b = span.querySelector("b");
    return { mode: span.getAttribute("data-nr-mode"), variable: span.style.getPropertyValue("--nr-color"), color: b && getComputedStyle(b).color };
  }));
  ok("publisher/research card hooks use red fixation color", publisherCards.length === 7 && publisherCards.every((item) => item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)), JSON.stringify(publisherCards));

  // 8d. Creator metadata, ad labels, and top navigation are also title-like
  // YouTube UI text and must use the same red fixation color.
  const supportingTitles = await page.evaluate(() =>
    Array.from(document.querySelectorAll(
      "#youtube-video-meta [data-nr=\"1\"], #youtube-ad-meta [data-nr=\"1\"], #youtube-topbar [data-nr=\"1\"]",
    )).map((span) => {
      const b = span.querySelector("b");
      return {
        mode: span.getAttribute("data-nr-mode"),
        variable: span.style.getPropertyValue("--nr-color"),
        color: b && getComputedStyle(b).color,
      };
    }),
  );
  ok(
    "creator names, ad labels, and top navigation use red fixation color",
    supportingTitles.length === 13 && supportingTitles.every((item) =>
      item.mode === "color" &&
      /rgb\(220,\s*38,\s*38\)/.test(item.variable) &&
      /rgb\(220,\s*38,\s*38\)/.test(item.color),
    ),
    JSON.stringify(supportingTitles),
  );

  // 8d. Nested and late-arriving ad headlines use red fixation color.
  await page.waitForFunction(
    () => document.querySelector("#dynamic-ad-host [data-nr=\"1\"]") !== null,
    { timeout: 8000 },
  );
  const adColors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#youtube-ad-meta [data-nr=\"1\"], #dynamic-ad-host [data-nr=\"1\"]")).map((span) => {
      const b = span.querySelector("b");
      return {
        text: span.textContent,
        mode: span.getAttribute("data-nr-mode"),
        variable: span.style.getPropertyValue("--nr-color"),
        color: b && getComputedStyle(b).color,
      };
    }),
  );
  ok(
    "nested and dynamic ad headlines use red fixation color",
    adColors.length === 3 && adColors.every((item) =>
      item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color),
    ),
    JSON.stringify(adColors),
  );

  // 8e. Friendly ad documents are separate frames. The parent frame sends
  // only an ad-context boolean; the child transforms its own DOM locally.
  await page.waitForFunction(
    () => {
      const frame = document.getElementById("friendly-ad-frame");
      return frame && frame.contentDocument && frame.contentDocument.querySelector('[data-nr="1"]') !== null;
    },
    { timeout: 10000 },
  );
  const friendlyAd = await page.evaluate(() => {
    const frame = document.getElementById("friendly-ad-frame");
    const span = frame.contentDocument.querySelector('[data-nr="1"]');
    const b = span && span.querySelector("b");
    return {
      mode: span && span.getAttribute("data-nr-mode"),
      variable: span && span.style.getPropertyValue("--nr-color"),
      color: b && frame.contentWindow.getComputedStyle(b).color,
    };
  });
  ok(
    "friendly about:blank ad frame transforms with red fixation color",
    friendlyAd.mode === "color" &&
      /rgb\(220,\s*38,\s*38\)/.test(friendlyAd.variable) &&
      /rgb\(220,\s*38,\s*38\)/.test(friendlyAd.color),
    JSON.stringify(friendlyAd),
  );

  // 8f. View counts and upload metadata under each video use red too.
  const viewMeta = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#youtube-video-meta [data-nr=\"1\"]"))
      .filter((span) => /views|ago/.test(span.textContent))
      .map((span) => {
        const b = span.querySelector("b");
        return {
          text: span.textContent,
          mode: span.getAttribute("data-nr-mode"),
          variable: span.style.getPropertyValue("--nr-color"),
          color: b && getComputedStyle(b).color,
        };
      }),
  );
  ok(
    "view counts and upload metadata use red fixation color",
    viewMeta.length === 5 && viewMeta.every((item) =>
      item.mode === "color" &&
      /rgb\(220,\s*38,\s*38\)/.test(item.variable) &&
      /rgb\(220,\s*38,\s*38\)/.test(item.color),
    ),
    JSON.stringify(viewMeta),
  );

  // 8e. The topic/filter chip bar must color every visible category label.
  const chipColors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#youtube-chip-bar [data-nr=\"1\"]")).map((span) => {
      const b = span.querySelector("b");
      return {
        text: span.textContent,
        mode: span.getAttribute("data-nr-mode"),
        variable: span.style.getPropertyValue("--nr-color"),
        color: b && getComputedStyle(b).color,
      };
    }),
  );
  ok(
    "all YouTube topic/filter chips use red fixation color",
    chipColors.length === 21 && chipColors.every((chip) =>
      chip.mode === "color" &&
      /rgb\(220,\s*38,\s*38\)/.test(chip.variable) &&
      /rgb\(220,\s*38,\s*38\)/.test(chip.color),
    ),
    JSON.stringify(chipColors),
  );

  // 9. Compound words over 15 letters are segmented into meaningful parts.
  const compound = await page.evaluate(() => {
    const canonical = document.querySelector("#compound [data-nr=\"1\"]");
    const fallback = document.querySelector("#compound-fallback [data-nr=\"1\"]");
    const cased = document.querySelector("#compound-case [data-nr=\"1\"]");
    return {
      canonicalParts: canonical
        ? Array.from(canonical.querySelectorAll('[data-nr-compound-part=\"1\"]')).map((el) => el.textContent)
        : [],
      canonicalText: document.getElementById("compound").textContent,
      fallbackParts: fallback
        ? Array.from(fallback.querySelectorAll('[data-nr-compound-part=\"1\"]')).map((el) => el.textContent)
        : [],
      fallbackText: document.getElementById("compound-fallback").textContent,
      casedParts: cased
        ? Array.from(cased.querySelectorAll('[data-nr-compound-part=\"1\"]')).map((el) => el.textContent)
        : [],
      casedText: document.getElementById("compound-case").textContent,
    };
  });
  const expectedCompoundParts = ["pneu", "mono", "ultra", "micro", "scopic", "silico", "vol", "cano", "coniosis"];
  ok(
    "canonical compound word uses the required root breakdown",
    JSON.stringify(compound.canonicalParts) === JSON.stringify(expectedCompoundParts),
    JSON.stringify(compound.canonicalParts),
  );
  ok(
    "compound segmentation preserves canonical text exactly",
    compound.canonicalText === "pneumonoultramicroscopicsilicovolcanoconiosis",
  );
  ok(
    "unknown long word uses syllable fallback and preserves punctuation",
    compound.fallbackParts.length > 1 && compound.fallbackText === "antidisestablishmentarianism!",
    JSON.stringify(compound.fallbackParts),
  );
  ok(
    "mixed-case canonical word preserves case and trailing punctuation",
    JSON.stringify(compound.casedParts) === JSON.stringify(["Pneu", "mono", "ultra", "micro", "scopic", "silico", "vol", "cano", "coniosis", "..."]) &&
      compound.casedText === "Pneumonoultramicroscopicsilicovolcanoconiosis...",
    JSON.stringify(compound.casedParts) + " / " + compound.casedText,
  );

  // 9. Undo must remove everything, including all shadow + late content.
  await page.click("#nr-launcher");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length === 0,
    { timeout: 10000 },
  );
  const shadowStillTransformed = await page.evaluate(() => {
    const ids = ["shadow-host", "shadow-live", "shadow-late-host", "shadow-upgrade-host"];
    return ids.some((id) => {
      const el = document.getElementById(id);
      const sr = el && el.shadowRoot;
      return sr ? sr.querySelector('[data-nr="1"]') !== null : false;
    });
  });
  await page.waitForFunction(
    () => {
      const frame = document.getElementById("friendly-ad-frame");
      return !(frame && frame.contentDocument && frame.contentDocument.querySelector('[data-nr="1"]'));
    },
    { timeout: 5000 },
  );
  const friendlyFrameStillTransformed = await page.evaluate(() => {
    const frame = document.getElementById("friendly-ad-frame");
    return !!(frame && frame.contentDocument && frame.contentDocument.querySelector('[data-nr="1"]'));
  });
  ok("undo clears the friendly ad frame too", !friendlyFrameStillTransformed);
  ok("undo clears all spans incl. every shadow root", !shadowStillTransformed);

  ok("no page errors", errors.length === 0, errors.join("; "));

  await context.close();
  await fixtureServer.close();
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
