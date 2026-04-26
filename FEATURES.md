# TripDNA — Feature Documentation

## Overview

TripDNA is an offline-first Progressive Web App (PWA) built with plain HTML, vanilla JavaScript, and Tailwind CSS (CDN). It serves as a personal trip companion during travel and a travel memory system across trips. All data lives in `localStorage` on the device — no backend, no accounts, no network required after initial load.

**Live URL:** https://btspm.github.io/trip-track/

**Tech stack:** HTML + vanilla JS + Tailwind CSS CDN. No build step, no framework, no npm. Open `index.html` and it works.

---

## Architecture

### Files

| File | Purpose |
|------|---------|
| `index.html` | App shell — top bar, nav, view containers, modals, overlays |
| `app.js` | All app logic — routing, state, rendering, interactions |
| `trip.js` | Seed trip data (West Texas JSON) — loaded on first visit |
| `manifest.webmanifest` | PWA manifest for "Add to Home Screen" |
| `sw.js` | Service worker — caches assets for full offline use |

### Data Flow

```
Claude planning  -->  trip.json (seed data)
                          |
                          v
                    Import to app --> localStorage
                                         |
                   During trip: all writes go to localStorage
                                         |
                   After trip: Export enriched trip-memory.json
                                         |
                   Next planning session: feed to Claude
```

### State Management

- Single source of truth: `localStorage` key `tripdna.trip.v1`
- On first load, seeds from `window.SEED_TRIP` (trip.js)
- Every mutation calls `saveTrip()` immediately
- State shape follows the TripDNA JSON schema (see trip.js)

### Routing

Hash-based SPA routing:
- `#/` — Dashboard (Home)
- `#/day` — Current day view
- `#/day/N` — Specific day view (e.g., `#/day/3`)
- `#/bookings` — Bookings tab
- `#/more` — Settings, journal, gas, packing, export

---

## Features

### 1. Trip Dashboard (Home)

The main screen showing trip status at a glance.

- **Trip hero card** — current day number, date, location, weather (high/low + condition)
- **Search bar** — tappable bar that opens the search overlay. Always accessible.
- **Alerts banner** — consolidated list of today's pending warnings (e.g., "Arrive by 1:45 PM", "Fill gas in Alpine"). Tap any alert to jump to that activity. Only shows alerts for uncompleted activities.
- **Journey progress** — completion percentage bar, day X/Y, activities done/total, miles driven
- **Live countdown** — auto-updating terracotta badge showing time remaining until the next pending activity. Refreshes every 30 seconds.
- **Today's timeline preview** — previous activity (done), next up (highlighted), and following activity. Tap any to navigate to the day view.
- **Skipped & Missed list** — all skipped activities plus any pending activities from past days. Tap the undo button to reset them to pending or mark done with a corrected timestamp.

### 2. Day View (Timeline)

Full day itinerary with interactive timeline.

- **Day picker** — horizontal scrollable pills to switch between days
- **Weather + sunrise/sunset** — high/low, condition, rain chance, plus sunrise and sunset times for the day (critical for planning "get back before dark" constraints)
- **Activity timeline** — vertical timeline with connected cards
  - **Pending activities** — open circle, tap to check off
  - **Next up** — terracotta-glow highlighted card with "Next Up" badge
  - **Highlight badge** — must-do activities marked with green "Highlight" tag
  - **Completed activities** — green checkmark, strikethrough title, shows "Done at X:XX PM" actual time
  - **Skipped activities** — X icon, dimmed
- **Activity details** — each card shows: time, duration, icon by type, description, distance/difficulty/elevation for hikes, alert warnings
- **Action buttons per activity:**
  - Share (copies details as text or uses native share sheet)
  - Time shift (adjust ±15/30/60 min, with optional cascade to remaining activities)
  - Directions (both Google Maps and Apple Maps)
  - Call (if booking has phone)
  - Booking link (jumps to bookings tab)
- **Day summary card** — appears at bottom once activities are completed. Shows: done count, skipped count, miles driven, average rating, top-rated activity.

### 3. Activity Check-Off Flow

The core interaction loop.

**For pending activities:**
1. Tap the circle to open the check-off modal
2. **Actual time field** — pre-filled with current time, adjustable. If you forgot to check in earlier, change it to when you actually did the activity.
3. **Star rating** (1-5) — tap stars, terracotta glow on selected
4. **Notes field** — free text for thoughts, tips, memories
5. **Mark Done** — saves with selected time, rating, notes. Then prompts photo.
6. **Skip** — marks as skipped with timestamp

**For done/skipped activities:**
1. Tap the checkmark/X circle
2. **Reset to Pending** — clears all progress, returns to pending state
3. **Edit Rating & Notes** (done only) — re-opens the rating modal
4. **Mark Done Instead** (skipped only) — opens rating modal to convert skip to done

**Photo prompt:**
After marking done, a modal asks "Capture the moment?" with an "Open Camera" button that launches the device camera. "Later" dismisses it. Non-intrusive — completely optional.

### 4. Search

Full-text search across all trip content.

- **Access:** tappable search bar on dashboard, or search icon in top-right header
- **Real-time filtering** as you type
- **Category chips** — tap to filter by type: hike, drive, food, lodging, experience, sightseeing, activity, rest, booking, packing
- **Smart category matching** — typing "trek" also matches "hike" type activities. Typing "swim" matches "activity" type. Keyword-to-category mapping covers common synonyms.
- **Results grouped by type** — Activities (with day number and time), Bookings (with confirmation number), Packing items (with check/uncheck)
- **Tappable results** — activities navigate to the day view, bookings navigate to bookings tab, packing items toggle directly

### 5. Bookings Tab

All reservations in one place, chronologically ordered.

- **Status indicators** — Active Today (primary color), Upcoming (sage green), Past (dimmed)
- **Confirmation number** — tap to copy to clipboard
- **Pin code** — tap to copy (for lodging with access codes)
- **Phone** — tap to call
- **Cost** — displayed per booking
- **Notes** — special instructions (check-in times, access codes, water warnings, etc.)
- **Directions** — both Google Maps and Apple Maps buttons
- **Timeline styling** — vertical accent line, dot indicators by status

### 6. Time Management

Flexible schedule adjustment for real-world travel.

- **Time shift** — tap the clock icon on any pending activity to open the shift modal
  - Quick buttons: -60, -30, -15, +15, +30, +60 minutes
  - **Cascade option** (off by default) — check to also shift all remaining activities in the day
  - Individual shift: move one activity, leave everything else at planned time
- **Actual time recording** — when marking done, the time input lets you set the real completion time (defaults to "now", adjustable)
- **Drift visibility** — completed cards show both planned time and actual "Done at" time

### 7. Quick Journal

Capture thoughts anytime, not tied to specific activities.

- **Floating action button (FAB)** — terracotta circle in bottom-right, visible on all views. Tap to open a quick note modal.
- **Journal section in More tab** — input field + chronological list of all notes
- **Each entry stores:** text, timestamp, day number
- **Delete individual entries** — tap X to remove
- **Enter key support** — press Enter in the More tab input to save
- **Exported with trip JSON** — journal entries are part of the trip data, so Claude can read your on-the-ground observations for future trip planning

### 8. Gas Tracker

Log fuel stops across the trip.

- **Add fill-up** — location name, gallons, price per gallon, total cost
- **Auto-calculation** — entering gallons + price auto-fills total
- **Running stats** — total stops, total gallons, total fuel spend
- **Chronological log** — each entry shows location, gallons, price, day number
- **Delete entries** — tap X to remove
- **Exported with trip JSON** — fuel data available for post-trip analysis

### 9. Emergency Info Card

One-tap access to critical information.

- **Vehicle details** — plate number (tap to copy), make/model
- **Emergency contacts:**
  - Big Bend NP Rangers
  - Brewster County Sheriff
  - Big Bend Regional Medical Center (nearest hospital, Alpine TX)
  - Hyundai Roadside Assistance
  - Far Flung Adventures
  - Poison Control
- **All phone numbers are tap-to-call links**
- Located at top of More tab for quick access

### 10. Packing Checklist

Pre-trip packing tracker.

- **Grouped by category** — gear, clothing, essentials, documents, digital, extras
- **Progress bar** — shows X/Y items packed
- **Tap to toggle** — check/uncheck items
- **Persisted to localStorage** — survives page reloads

### 11. Sunrise & Sunset Times

Shown per day in the weather card on the day view.

- Pre-calculated for the trip date range and region (West Texas / Big Bend)
- Critical for planning: "get back to Ten Bits before dark", "Hot Springs headlamp walk", "Star Party arrival"

### 12. Share Activity

Copy or share activity details as formatted text.

- Tap the share icon on any activity card
- **On devices with Web Share API** (iOS Safari, Android Chrome) — opens native share sheet (text to iMessage, WhatsApp, etc.)
- **Fallback** — copies formatted text to clipboard
- **Includes:** title, time, duration, description, distance, confirmation number, address, phone, alerts

### 13. Day Summary

Auto-generated recap at bottom of each day view.

- **Appears once any activities are completed**
- Shows: done count, skipped count, miles driven, average rating
- **Top-rated activity** — highlights the best-rated activity of the day
- Useful for end-of-day review and post-trip memory building

### 14. Running Late Quick Action

One-tap schedule adjustment from the dashboard.

- **Three buttons on dashboard:** +15 min, +30 min, +1 hr
- Shifts ALL remaining pending activities for the current day in one tap
- Only visible when viewing today's date and there are pending activities
- No modal or confirmation — instant shift for when you're on the go
- Uses the same time-shift logic as individual activity shift, but applied to all pending activities at once

### 15. Hydration Reminders

Automatic water intake reminders on hike days.

- **Dashboard:** shows when today has pending hikes — "Hiking today — drink 1 quart per hour on the trail"
- **Day view:** calculates total trail miles and recommends water quantity — "2 hikes today (~6.2 mi). Carry at least 3 quarts of water."
- Only appears when the day has pending (not yet completed) hikes
- Calculation: ~0.5 quarts per mile of trail distance

### 16. Weather Refresh

Live weather updates via Open-Meteo API.

- **Refresh button** on each day's weather card (circular arrow icon)
- Fetches current forecast from Open-Meteo free API (no API key required)
- Coordinates set to Big Bend region (29.25, -103.25)
- Updates: high/low temperature, rain probability, weather condition (WMO code mapping)
- Shows "Updated at X:XX" timestamp after refresh
- **Offline fallback** — shows "No signal — using cached weather" when fetch fails
- Updated data persists to localStorage

### 17. GPS Location Tracking

Automatic location capture on key actions.

- **Captured on:** activity check-off (done/skip), gas fill-up, journal entry
- Uses browser Geolocation API with high accuracy, 5-second timeout
- Permission requested once on first use (HTTPS required — works on GitHub Pages)
- **On activities:** stored as `actualLocation` — shows as tappable coordinates linking to Google Maps
- **On journal entries:** stored as `geo` — shows as a pin emoji (📍) linking to Google Maps
- **On gas entries:** stored as `geo` — same pin link
- All location data exports with trip JSON — creates a GPS breadcrumb trail of the actual trip route
- Graceful failure — if location unavailable, action completes without coordinates

### 18. Activity Detail Modal

Tap any activity card to view full details in an expanded modal.

- **Full description** with all details, alerts, and booking information
- **Status and timing** — planned time, actual completion time, duration, rating, notes
- **Action buttons** — directions (Google/Apple Maps), call, share, check-off/reset
- **Booking details** — confirmation number (tap to copy), pin code, cost, notes
- **Location** — if GPS was captured, shows tappable coordinates
- **Hike details** — distance, difficulty, elevation gain

### 19. Export / Import

JSON-based data portability.

- **Export** — downloads the full trip JSON including all check-offs, ratings, notes, journal entries, gas log, GPS coordinates. Filename: `{tripId}-{date}.json`
- **Import** — upload a trip JSON file to replace current trip data. Validates that the file has a `days` array.
- **Reset** — restores the original seed trip data (with confirmation prompt)

### 20. Swipe Between Days

Touch gesture navigation on the day view.

- **Swipe left** — go to next day
- **Swipe right** — go to previous day
- Requires minimum 80px horizontal swipe with horizontal intent (vertical scroll doesn't trigger)
- Works alongside the day picker pills for tap navigation
- Passive touch listeners for smooth scroll performance

### 21. Expanded Trip Stats

Rich statistics on the dashboard progress card.

- **Base stats:** day X/Y, activities done/total, miles driven
- **Extended stats (appear once activities are completed):** hikes completed, total elevation gained (ft), total driving hours
- **Best-rated activity** — highlighted with star icon and rating
- All calculated from actual check-off data, not planned

### 22. Collapse Completed Activities

Toggle to hide done/skipped items on the day view.

- **Toggle button** appears when any activities are completed or skipped
- Hides all done and skipped activities, showing only pending ones
- Useful mid-day when you only want to see what's ahead
- Toggle persists during session (resets on page reload)
- Button shows "Hide completed" / "Show completed" with eye icon

### 23. Quick Expense Log

Track spending beyond gas across the trip.

- **Categories:** food, park fee, souvenir, gas, tip, other — tap to select
- **Fields:** description, amount, category
- **GPS capture** on each entry
- **Running totals** — total spend, item count, breakdown by category
- **Chronological log** with delete option
- Located in More tab alongside gas tracker
- Exported with trip JSON for post-trip budget analysis

### 24. Dark/Light Mode Toggle

Switch between dark desert mode and bright daylight mode.

- **Toggle button** in top-right header (sun/moon icon)
- **Dark mode** (default) — #131313 background, optimized for nighttime/stargazing
- **Light mode** — #f5f0eb warm sand background, optimized for bright desert sun
- Persists choice in localStorage across sessions
- Updates theme-color meta tag for native mobile browser chrome
- Light mode overrides surface colors, text colors, shadows, and overlay backgrounds

### 25. PWA & Offline Support

Works without internet after first load.

- **Service worker** — caches all app assets (HTML, JS, manifest)
- **Cache strategy** — cache-first for same-origin assets, network-first for CDN resources (Tailwind, fonts)
- **Add to Home Screen** — works on iOS (Safari share menu) and Android (Chrome install prompt)
- **Standalone display** — runs full-screen like a native app when installed
- **All data in localStorage** — no network needed for any functionality

### 26. Drive Time Estimator

Smart departure reminder on the dashboard.

- Calculates when you need to leave based on the next drive activity's planned arrival time minus its duration
- Shows "Leave by X:XX" with the destination and distance
- Turns red/urgent when less than 30 minutes remaining
- Shows "Leave now!" when you're already past the departure window
- Only appears for today's pending drive activities

### 27. Cell Service Warnings

Flags activities in known no-signal areas.

- Auto-detects activities in Big Bend NP, Chisos Basin, Ten Bits Ranch, Santa Elena Canyon, Boquillas, Hot Springs, Ross Maxwell, Lost Mine, Window Trail
- Shows a subtle "No cell service" indicator with signal-off icon on the activity card
- Reminder to download/screenshot booking info before heading into dead zones
- Pattern-matched against activity title, description, and location name

### 28. Today's Essentials Card

Auto-generated gear checklist based on today's activity types.

- Appears on dashboard when today has pending activities
- **Hike days:** Water, hiking shoes, sunscreen, hat, sunglasses
- **Star Party:** Warm jacket, blanket for benches, red flashlight, NO white lights
- **Swimming/Balmorhea:** Swim gear, snorkel, floats, towel
- **Hot Springs:** Towel, headlamp, water shoes
- **Float/canoe:** Sunscreen, water, dry bag
- **Observatory:** Warm layers (high elevation)
- De-duplicated — each item appears once even if multiple activities need it

### 29. Quick Day Recap Share

One-tap shareable summary of the day's activities.

- "Share Day X Recap" button at the bottom of each day view (after activities are completed)
- Generates formatted text: completed activities with ratings, skipped activities, miles driven, average rating, best-rated
- Uses native share sheet on mobile (iMessage, WhatsApp, etc.) or copies to clipboard as fallback

### 30. Bookmark Activities

Personal flag to mark activities you want to revisit.

- Bookmark icon on every activity card (top right)
- Toggle on/off — filled terracotta when bookmarked, muted when not
- Separate from the "Highlight" tag (which comes from the trip plan)
- Bookmarks are your own picks — "I want to come back here" or "research this later"
- Persisted to localStorage and exported with trip JSON

### 31. Navigate to Next

One-tap Google Maps navigation from the dashboard.

- Shows when the next pending activity has an address or location
- Displays the destination address
- Taps directly to Google Maps with the address pre-filled
- Pulls address from booking data or activity location

### 32. Per-Day Expense Total

Spending breakdown on each day view.

- Appears at the bottom of the day view when expenses or gas fill-ups exist for that day
- Shows each line item with description and amount
- Includes both expense log entries and gas fill-ups for that day number
- Running total for the day in the header

### 33. Dashboard Quick-Log Buttons

Log gas and expenses directly from the dashboard.

- **Gas** and **Expense** buttons embedded in the Trip Spending card on the dashboard
- Opens the same modal as the More tab, but accessible without navigating away
- Spending card always visible (even with $0) to encourage logging
- Both buttons trigger GPS capture on save

### 34. Trip Calendar View

Compact visual overview of all trip days on the dashboard.

- **5-column grid** showing all trip days
- Each day shows: date number, day number, progress indicator
- **Current day** highlighted in terracotta gradient
- **Progress indicators:** checkmark (all done), dot (in progress), empty dot (not started)
- **Tap any day** to navigate directly to that day's timeline view
- Shows at a glance which days are complete and where you are in the trip

---

## Design System: Nomad Dusk

Desert-minimal aesthetic optimized for outdoor mobile use.

- **Dark mode default** — critical for nighttime use (stargazing, desert driving)
- **Color palette:** terracotta (#ffb68d -> #df7328), sage green (#bdce89), sand (#e1c299), deep charcoal (#131313)
- **No-line rule** — boundaries defined by tonal shifts, not borders
- **Typography:** Manrope (headlines), Work Sans (body)
- **Large tap targets** — 56px minimum for primary actions (check-off circles, buttons)
- **High contrast** — readable in bright sunlight
- **Material Symbols** — icon set with FILL variant for active states

---

## Data Schema Extensions

Beyond the original trip.json spec, the app adds:

```json
{
  "journal": [
    { "id": "j-123", "text": "...", "createdAt": "ISO", "dayNumber": 3, "geo": { "lat": 29.32, "lng": -103.61 } }
  ],
  "gasLog": [
    { "id": "g-123", "location": "Alpine Chevron", "gallons": 12.5, "pricePerGal": 3.29, "total": 41.12, "createdAt": "ISO", "dayNumber": 2, "geo": { "lat": 30.36, "lng": -103.66 } }
  ]
}
```

Activity status tracking:
```json
{
  "status": "pending | done | skipped",
  "checkedAt": "ISO timestamp (actual completion time, user-adjustable)",
  "rating": 1-5,
  "notes": "free text",
  "actualLocation": { "lat": 29.27, "lng": -103.30 }
}
```

---

## v0.3 Backlog — Post-Trip Learnings (West Texas 2026)

Identified after completing the first real trip. Ordered by priority.

### P0 — Core UX Gaps

- [ ] **Start/End activity tracking** — Replace single "Mark Done" with Start + End buttons. Start begins a timer, End records actual duration. Gives real vs planned duration data. Critical for hikes and long activities.
- [ ] **Add/remove/edit activities** — Plan is currently frozen from JSON import. Need ability to: add a spontaneous activity ("found a great taco stand"), remove one that doesn't apply, edit details on existing ones.
- [ ] **Reschedule skipped activities** — Move a skipped activity from Day 3 to Day 5. "I skipped this but want to do it later" is a common real-world pattern.
- [ ] **Date + time picker on check-off** — Currently only time (same day) is adjustable. If you forgot to check off yesterday, you're stuck. Full date+time picker needed.
- [ ] **Fix stats calculations** — Driven miles, drive time, and elevation are calculated from activity metadata but not matching reality. Need to audit: are all drive activities being counted? Are skipped-but-done activities tracked? Should manually-entered values override calculated ones?

### P1 — Financial Tracking Fixes

- [ ] **Fix gas total cost calculation** — Sum is wrong. Audit the gasStats() reducer against actual exported data.
- [ ] **Edit expenses** — Currently delete-and-recreate only. Add tap-to-edit modal.
- [ ] **Expenses tab with filters** — Dedicated tab or sub-view. Filter by: category, day, date range. Sort by amount. Search. Better than buried in More tab.
- [ ] **Correct booking costs** — Some bookings (e.g., Chisos Lodge) only had prepayment amount, not full bill. Need ability to update booking costs post-trip with actual charges.

### P2 — Location & Maps

- [ ] **Business/place search instead of lat/lng** — Instead of showing raw coordinates, resolve to a business name via Google Places or similar. Type "V6 Coffee" → resolves to the Maps listing. Requires API key.
- [ ] **Edit/override location on check-off** — Show auto-captured GPS with option to adjust — pick from map or type an address.
- [ ] **Route weather for long drives** — On driving days, show weather at waypoints along the route (Junction, Ozona, Marathon) not just destination. Multiple Open-Meteo queries by coordinates.

### P3 — Content Enrichment

- [ ] **Restaurant menu highlights** — Add `menuHighlights` field to food activities: "Diego Burger (Top 50 in TX)", "chile relleno". Claude populates during planning. Show in activity detail modal.
- [ ] **Taste-matched recommendations** — Filter menu items by user preferences (no alcohol, vegetarian, etc.). Requires taste profile in travel preferences.
- [ ] **Show dates alongside day numbers** — "Day 1 · Apr 17" everywhere instead of just "Day 1". More useful mid-trip when thinking in calendar dates.

### P4 — UX Polish

- [ ] **Auto-focus current day** — Day tab defaults to today. Auto-scroll to current/next pending activity, not top of page.
- [ ] **Collapse completed by default mid-trip** — If you're on Day 7, don't show 6 days of completed activities on the dashboard.

---

## v1.0 — From Prototype to Product

### What it takes to make this a real app

The current MVP is a static HTML/JS file with localStorage. To become a proper product:

#### Backend & Data Layer
- [ ] **Database** — PostgreSQL or Supabase (Postgres + auth + realtime). Store trips, activities, expenses, journal, gas log, user preferences.
- [ ] **Authentication** — Email/password or OAuth (Google, Apple). Supabase Auth or Auth.js.
- [ ] **User profiles** — Travel preferences, taste profile, past trip history, accumulated Travel DNA. Persists across devices.
- [ ] **API layer** — REST or tRPC endpoints for CRUD on trips, activities, expenses. Or use Supabase client directly.
- [ ] **Real-time sync** — Changes on phone sync to cloud instantly. Open on laptop and see the same state. Supabase Realtime or WebSockets.

#### Multi-Trip Support
- [ ] **Trip history** — List of all trips, past and upcoming. Tap to open any trip.
- [ ] **Trip templates** — Save a trip structure as a template for re-use or sharing.
- [ ] **Cross-trip analytics** — Total miles driven across all trips, most-visited regions, spending trends, preference evolution.

#### Offline-First Architecture
- [ ] **Offline writes with sync** — IndexedDB as local store, sync queue for when back online. Conflict resolution (last-write-wins or merge).
- [ ] **Service worker v2** — Cache API responses, not just static assets. Background sync for pending writes.

#### Claude Integration
- [ ] **Built-in trip planning** — Chat with Claude inside the app to plan a new trip. Claude reads your Travel DNA, past trip ratings, preferences.
- [ ] **Auto-generate trip JSON** — Claude outputs the trip schema directly, imported automatically. No copy-paste.
- [ ] **Post-trip review with Claude** — Feed completed trip data to Claude for analysis: "What should I do differently next time?"

#### Collaboration
- [ ] **Share trip with travel partner** — Invite by email/link. Both see the same trip, both can check off activities.
- [ ] **Real-time presence** — See what your partner just checked off or noted.

#### Photo & Media
- [ ] **Photo storage** — Upload photos per activity. Store in Supabase Storage or S3.
- [ ] **Photo timeline** — Chronological gallery of trip photos mapped to activities.
- [ ] **Auto-tag photos** — Match camera roll photos to activities by timestamp + GPS proximity.

#### Notifications
- [ ] **Push notifications** — "15 min until next activity", "Don't forget to fill gas in Alpine", "Leave by 2:30 PM for Chisos."
- [ ] **Morning briefing** — Daily notification with today's highlights, weather, alerts, essentials.

#### Maps
- [ ] **Embedded map view** — See all activities plotted on a map. Tap pins to open details.
- [ ] **Offline map tiles** — Download map region for offline use in areas with no signal (Big Bend).
- [ ] **Route visualization** — Show driving route between activities on the map.

### Recommended Tech Stack for v1.0

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + Vite or Next.js | Component architecture, SSR for SEO, ecosystem |
| Styling | Tailwind CSS | Already using it, keep the design system |
| State | Zustand + React Query | Local state + server state separation |
| Backend | Supabase | Postgres + Auth + Realtime + Storage in one. Free tier generous. |
| Offline | IndexedDB + Workbox | Battle-tested offline-first PWA tooling |
| AI | Claude API (Anthropic SDK) | Trip planning, post-trip analysis, menu recommendations |
| Maps | Mapbox GL or Google Maps SDK | Offline tiles, route rendering, place search |
| Hosting | Vercel | Auto-deploy from GitHub, edge functions, free tier |
| Mobile | PWA first, then Capacitor for native wrappers | Ship fast as PWA, wrap for App Store later if needed |

---

## Future Roadmap (Post v1.0)

- **Trip Memory screen** — post-trip review with highlights, lowlights, "would do again / would skip", tips for next time
- **Budget tracker** — planned vs actual spending by category with visualizations
- **Collaborative mode** — share trip state with travel partner via shared URL or QR code
- **Notification reminders** — push notifications for upcoming activities
- **Offline maps integration** — embedded map view with offline tile support
- **Activity reordering** — drag and drop to rearrange day schedule
- **Mileage odometer** — log actual odometer readings at each gas stop for real MPG tracking
- **Trip photo timeline** — link photos from camera roll to activities by timestamp matching
- **Multi-day weather prefetch** — fetch full trip forecast in one API call when online
- **Social features** — share trip recaps publicly, follow other travelers' routes
- **AI concierge** — "What should I do with 2 free hours in Marfa?" answered using your preferences + local knowledge
