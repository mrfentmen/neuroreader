# NEUROREADER — Product Constitution & Roadmap

> A reading tool built for neurodivergent brains, by someone who has one. Free. Always.

---

## 1. CONSTITUTION (The founding vows)

**We vow:**
- This tool will always have a free version. Reading is not a luxury.
- We will never sell user data. We never collect it.
- We will never gate basic reading help behind a paywall.
- We build for neurodivergent brains first (ADHD, dyslexia, autism), not "everyone."
- We will never shame, never use "just try harder," never design for neurotypical comfort.
- Ads may support us, but they will never interfere with reading.
- We are building in public. The community sees the work.

---

## 2. WHAT IT IS

**NeuroReader** transforms how text appears so neurodivergent brains can actually read it.

Paste any text → it re-formats using our Variable Fixation Formula → you read it without losing your place, zoning out, or drowning in visual noise.

**The core insight:** Fixed patterns (like standard fonts or even Bionic Reading's fixed formula) cause ADHD brains to habituate and zone out. Variable stimulation keeps the brain engaged. Our bolding changes every time a word appears — the eye stays alert, the brain stays present.

---

## 3. THE FORMULA (Variable Fixation)

| Word length | Letters bolded | Behavior |
|---|---|---|
| 1 letter | 0 or 1 | Alternates by occurrence (normal → bold → normal...) |
| 2 letters | 1 | Always 1 bold |
| 3 letters | 2 | Always 2 bold |
| 4 letters | 2 or 3 | Varies (50-50, non-deterministic) |
| 5 letters | 2, 3, or 4 | Varies (chance-based) |
| 6+ letters | 3, 4, or 5 | Varies (chance-based) |

**Punctuation:** ALL bold (every period, comma, semicolon, slash, dash, colon, exclamation, question mark)

**Spacing:** Normal (no extra)

**Line focus:** None (v1)

**Color:** Black text, white background (v1)

---

## 4. HOW IT DIFFERS

| Bionic Reading | OpenDyslexic | NeuroReader |
|---|---|---|
| Fixed formula (same word → same bold, always) | Static font swap | Variable formula (same word → different bold each time) |
| One-size-fits-all speed reading | Just a different-looking font | Built for neurodivergent brains specifically |
| Bold first 30-50% of word | Heavy-bottom letterforms | Variable fixation + punctuation anchoring |
| Charges ($) | Free but ugly/ineffective | Free + ethical ads + grants |

---

## 5. PRODUCT FEATURES

### v1 (MVP — Web App)
- Paste text → transformed text appears
- Copy/download transformed text
- Clean, black-and-white, no-clutter UI
- Works on mobile and desktop browsers
- Ad-supported (banner ads, never intrusive)
- Open source the formula (transparency = trust)

### v2 (Android App)
- Paste text or share from any app → NeuroReader transforms it
- Share Sheet integration (share article → NeuroReader opens transformed)
- Save transformed texts
- Basic settings (font size)

### v3 (Desktop — Browser Extension + Downloadable Font)
- Browser extension (Chrome/Edge/Firefox) — transform any webpage, transform selected text
- Browser extension popup: paste → transform → copy
- Downloadable font file (.ttf, .otf, .woff2) — static version of the formula for OS install
- Font install page: "Install NeuroReader on Mac/Windows/Linux"

### v4 (Advanced — Free)
- Neurotype profiles (ADHD mode, dyslexia mode, autism mode) — each tweaks the formula
- Line-focus mode (highlight current line)
- Reading stats (time read, focus streaks)
- Import from URL (paste link → NeuroReader fetches + transforms article)
- NO PREMIUM — all features free, monetized via ads + grants

---

## 6. MONETIZATION

| Revenue stream | When | Notes |
|---|---|---|
| Display ads (web + Android) | v1 launch | Banner only, never over text. Ethical, non-tracking. |
| Government grants | v1-v2 | Accessibility, neurodiversity, disability tech grants (NIDILRR, Horizon Europe, etc.) |
| Font licensing | v3 | Free for personal use, paid license for businesses/creators |
| Optional donations | Always | GitHub Sponsors / Buy Me a Coffee — never paywall features |

**Ad principles:**
- Never collect user data for ad targeting
- Never show ads over text being read
- No pop-ups, no auto-play video, no dark patterns
- If ads ever hurt the reading experience, we remove them

---

## 7. TECH STACK (v1 Web App)

- **Frontend:** React or vanilla JS (lightweight, fast)
- **Hosting:** Vercel/Netlify (free tier)
- **Domain:** readform.app or similar (~$12/yr)
- **Formula implementation:** Pure JS function (text → transformed HTML)
- **No backend needed for v1** (all transformation happens in-browser)
- **Privacy:** Nothing leaves the user's browser. No accounts, no tracking.

---

## 8. ROADMAP

### Phase 1 — Foundation (Weeks 1-3)
- [ ] Finalize name (readform.app? vote on alternatives)
- [ ] Register domain
- [ ] Build the transformation formula in JS
- [ ] Build minimal web UI (paste box → output box → copy button)
- [ ] Test with real neurodivergent readers (r/ADHD, r/dyslexia, r/autism)
- [ ] Iterate formula based on feedback

### Phase 2 — Launch (Weeks 4-6)
- [ ] Polish UI (black/white, clean, mobile-friendly)
- [ ] Add display ads (ethical placement)
- [ ] Launch web app publicly
- [ ] Post on Reddit, TikTok, Twitter (build in public)
- [ ] Collect feedback + iterate

### Phase 3 — Growth (Weeks 7-12)
- [ ] Build Android app (React Native or Kotlin)
- [ ] Share Sheet integration
- [ ] Add URL import (paste link → transform article)
- [ ] Grow community (Discord? subreddit?)
- [ ] Start institutional outreach (schools, accessibility offices)

### Phase 4 — Sustainability (Months 4-6)
- [ ] Launch premium tier (profiles, stats, no ads)
- [ ] Build neurotype-specific modes
- [ ] Line-focus feature
- [ ] Institutional licensing pilot
- [ ] Hire? (only if revenue supports it)

---

## 9. TASKS (Immediate next steps)

| Task | Owner | Deadline |
|---|---|---|
| Decide name + check domain availability | You | This week |
| Build JS formula function | You (or I help spec it) | Week 1 |
| Design minimal UI wireframe | You | Week 1 |
| Build MVP web app | You | Weeks 2-3 |
| Recruit 5 neurodivergent testers | You | Week 2 |
| Test + iterate formula | You + testers | Week 3 |
| Launch | You | Week 4-6 |

---

## 10. METRICS THAT MATTER

- **Free users** (are people using it?)
- **Return rate** (do they come back? = product works)
- **Time spent reading** (are they reading MORE with ReadForm?)
- **Testimonials** (are neurodivergent people saying "this helps"?)
- **Revenue** (only matters after we prove value)

---

## 11. LEGAL SAFETY

- Our formula is **variable/non-deterministic** — Bionic Reading's patent covers a **fixed** formula. Different mechanism.
- Our formula **includes punctuation bolding** — Bionic Reading does not. Additional differentiator.
- We target **neurodivergent users specifically** — Bionic Reading targets "speed reading for everyone." Different market.
- Our name is **ReadForm** (or whatever we choose) — not "Bionic" anything. No trademark issue.
- We build our own code/font from scratch — no copied code. No copyright issue.
- If Bionic Reading contacts us: we have a documented, genuinely different formula. We consult a lawyer if needed.

---

## 12. DESIGN PRINCIPLES

1. **The text is the interface.** Everything else fades away.
2. **Black and white first.** No visual noise. Color comes later (premium).
3. **One screen, one job.** Paste → transform → read. No dashboards.
4. **Mobile-first.** People read on phones. Design for thumbs.
5. **Fast.** Transformation is instant. No loading, no waiting.
6. **Private.** Nothing leaves the browser. Ever.

---

## 13. NAME OPTIONS

| Name | Domain | Status |
|---|---|---|
| **NeuroReader** | neuroreader.app / .com | **CHOSEN** |

**NEVER: sell data, gate basic features, dark patterns, pop-up ads, paywall reading help**

---

## 14. CLOSING COMMITMENT

This exists because neurodivergent people deserve tools that work for their brains — not tools that shame them for not reading like everyone else.

We're not building a "reading trick." We're building a reading *equalizer*.

Free. Ethical ads + grants. Built in public. By us, for us.

---

*Constitution version 2.0 — 2026-08-07*
*Name: NeuroReader*
*Monetization: Ads + grants + optional donations (NO premium)*
*Platforms: Web, Android, Browser Extension, Downloadable Font*
*Founder: [you]*
*Status: Building*
