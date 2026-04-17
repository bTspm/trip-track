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

### 14. Export / Import

JSON-based data portability.

- **Export** — downloads the full trip JSON including all check-offs, ratings, notes, journal entries, gas log. Filename: `{tripId}-{date}.json`
- **Import** — upload a trip JSON file to replace current trip data. Validates that the file has a `days` array.
- **Reset** — restores the original seed trip data (with confirmation prompt)

### 15. PWA & Offline Support

Works without internet after first load.

- **Service worker** — caches all app assets (HTML, JS, manifest)
- **Cache strategy** — cache-first for same-origin assets, network-first for CDN resources (Tailwind, fonts)
- **Add to Home Screen** — works on iOS (Safari share menu) and Android (Chrome install prompt)
- **Standalone display** — runs full-screen like a native app when installed
- **All data in localStorage** — no network needed for any functionality

---

## Design System: Nomad Dusk

Desert-minimal aesthetic optimized for outdoor mobile use.

- **Dark mode default** — critical for nighttime use (stargazing, desert driving)
- **Color palette:** terracotta (#ffb68d → #df7328), sage green (#bdce89), sand (#e1c299), deep charcoal (#131313)
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
    { "id": "j-123", "text": "...", "createdAt": "ISO", "dayNumber": 3 }
  ],
  "gasLog": [
    { "id": "g-123", "location": "Alpine Chevron", "gallons": 12.5, "pricePerGal": 3.29, "total": 41.12, "createdAt": "ISO", "dayNumber": 2 }
  ]
}
```

Activity status tracking:
```json
{
  "status": "pending | done | skipped",
  "checkedAt": "ISO timestamp (actual completion time, user-adjustable)",
  "rating": 1-5,
  "notes": "free text"
}
```

---

## Future Roadmap (Post-MVP)

- **Trip Memory screen** — post-trip review with highlights, lowlights, "would do again / would skip", tips for next time
- **Budget tracker** — planned vs actual spending by category
- **Multi-trip support** — trip history, import/export multiple trips
- **Photo gallery** — store photo references per activity
- **Weather API integration** — live weather instead of static data
- **Collaborative mode** — share trip state with travel partner
- **Claude integration UI** — direct export format optimized for Claude's planning prompt
- **Notification reminders** — "15 min until next activity" push notifications
- **Offline maps integration** — embedded map view with offline tile support
- **Activity reordering** — drag and drop to rearrange day schedule
