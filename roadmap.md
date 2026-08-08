# NeuroReader — Roadmap

> The detailed plan for building and launching NeuroReader. This is how we get from nothing to a live product used by neurodivergent people worldwide.

---

## PHASE 1 — FOUNDATION (Weeks 1-3)

**Goal:** Have a working web app that transforms text using the Variable Fixation Formula.

**Tasks:**

1. Give freebuff the loop prompt to build the web app MVP (index.html + privacy.html)
2. Review the output — test that the formula works correctly
3. Test edge cases: empty input, very long text (10,000+ words), special characters, multiple paragraphs, single words, numbers, URLs
4. Fix any bugs found during testing
5. Register domain: neuroreader.app (~$12/year) — check availability first
6. Create GitHub repository (public, build in public)
7. Deploy web app to Vercel or Netlify (free tier)
8. Point domain to deployed app
9. Recruit 5 neurodivergent testers from r/ADHD, r/dyslexia, r/autism
10. Collect feedback from testers — does the formula help them read?
11. Iterate on formula based on feedback if needed

**Deliverables:**

- Working web app at neuroreader.app
- GitHub repo with source code
- 5 testers have tried it and given feedback

**Success criteria:** Testers say "this helps me read" or "I can read longer with this."

---

## PHASE 2 — LAUNCH (Weeks 4-6)

**Goal:** Public launch of the web app. Get first 100 users.

**Tasks:**

1. Polish UI based on tester feedback
2. Add display ads (banner only, ethical placement, never over text)
3. Write launch posts for Reddit (r/ADHD, r/dyslexia, r/autism, r/neurodiversity)
4. Write launch post for TikTok — show the transformation, tell the story
5. Write launch post for Twitter/X — build in public thread
6. Publish to Product Hunt
7. Submit to Hacker News (Show HN)
8. Reach out to neurodivergent creators for feedback/shoutouts
9. Collect testimonials from users
10. Add testimonials to website
11. Set up GitHub Sponsors or Buy Me a Coffee for optional donations
12. Begin researching government grants for accessibility/neurodivergence

**Deliverables:**

- Web app live with ads
- 100+ users
- Posts on Reddit, TikTok, Twitter, Product Hunt
- Testimonials page

**Success criteria:** 100 users in first 2 weeks. At least 5 people say it helps them.

---

## PHASE 3 — MOBILE + DESKTOP (Weeks 7-12)

**Goal:** Expand to Android and desktop (browser extension + downloadable font).

**Tasks:**

1. Build Android app (React Native or Kotlin)
2. Add Share Sheet integration — share any article from any app to NeuroReader
3. Add paste-from-clipboard
4. Add save transformed texts (local storage)
5. Add display ads to Android app
6. Publish to Google Play Store ($25 one-time fee)
7. Build browser extension (Chrome/Edge/Firefox) — one codebase, all three browsers
8. Extension features: transform entire webpage, transform selected text, transform clipboard
9. Extension popup: paste text → transform → copy (same as web app)
10. Publish to Chrome Web Store (free) and Firefox Add-ons (free)
11. Create downloadable font file (.ttf, .otf, .woff2 formats)
12. Font does static version of formula: bold punctuation + fixed partial bolding
13. Build font install page: instructions for Mac, Windows, Linux
14. Write font EULA: free for personal use, paid license for businesses/creators
15. Test all platforms end-to-end

**Deliverables:**

- Android app on Google Play
- Browser extension on Chrome Web Store + Firefox Add-ons
- Downloadable font with install instructions
- All platforms working, tested, no errors

**Success criteria:** All four platforms (web, Android, extension, font) live and working.

---

## PHASE 4 — MONETIZATION + GROWTH (Months 4-6)

**Goal:** Become sustainable through ads + grants. Grow to 1,000+ users.

**Tasks:**

1. Apply for government grants:
   - US: NIDILRR (National Institute on Disability, Independent Living, and Rehabilitation Research)
   - US: SBIR/STTR grants for accessibility tech
   - EU: Horizon Europe (neurodiversity and accessibility calls)
   - Google for Accessibility grants
   - Microsoft Accessibility grants
2. Optimize ad placement and revenue
3. Reach out to schools and universities for free institutional access
4. Build institutional licensing page
5. Grow community (Discord server or subreddit)
6. Collect and publish impact stories ("I read my first book with NeuroReader")
7. SEO: write blog posts about neurodivergent reading, variable fixation, ADHD reading tips
8. Reach out to occupational therapists, reading specialists, accessibility consultants
9. Apply for nonprofit status if applicable (grants + credibility)
10. Iterate product based on user feedback

**Deliverables:**

- At least 3 grant applications submitted
- Ad revenue covering basic costs
- 1,000+ total users across all platforms
- Community space active
- At least 10 impact stories collected

**Success criteria:** Revenue (ads + grants) > costs. 1,000 users. Sustainable.

---

## PHASE 5 — MATURITY (Months 7-12)

**Goal:** Become the standard reading tool for neurodivergent people. 10,000+ users.

**Tasks:**

1. Build neurotype-specific modes (ADHD mode, dyslexia mode, autism mode) — each tweaks the formula
2. Add line-focus mode (highlight current line, dim the rest)
3. Add reading stats (time read, words read, focus streaks)
4. Add URL import (paste link → NeuroReader fetches and transforms the article)
5. Open source the full codebase (not just the formula)
6. Build API for other developers to use the transformation engine
7. License the API to other apps and services
8. Consider iOS app (only if revenue supports the $99/yr Apple Developer fee)
9. Partner with publishers for accessible editions
10. Present at accessibility conferences
11. Publish research on variable fixation effectiveness

**Deliverables:**

- Neurotype modes live
- Line-focus and reading stats live
- Open source release
- API live
- 10,000+ users

**Success criteria:** 10,000 users. Recognized as a real accessibility tool. Sustainable revenue.

---

## PRINCIPLES FOR EVERY PHASE

- **No premium.** All features free. Always.
- **No data collection.** Privacy by design.
- **Neurodivergent-first.** Built for them, not "everyone."
- **Test with real users.** Never assume it works — ask neurodivergent people.
- **Fix every error.** No broken code ships.
- **Build in public.** Share progress, failures, wins.

---

_Roadmap created: 2026-08-07_
_This is a living document. It will change as we learn._
