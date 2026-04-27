# TripDNA v1.0 — Implementation Plan

## Executive Summary

Transform TripDNA from a static HTML/JS prototype into a persistent, profile-aware trip companion. The app keeps its offline-first PWA architecture but adds cloud persistence (Supabase), real-time data (Google Maps, Open-Meteo), and an evolving traveler profile that makes every trip smarter than the last.

**Total estimated cost:** $0/month for personal use.

---

## Architecture Overview

```
                    +------------------+
                    |  Claude Desktop  |
                    |  + MCP Server    |
                    |  (trip planning) |
                    +--------+---------+
                             |
                             | reads/writes
                             v
+------------+      +------------------+      +----------------+
|  TripDNA   | <--> |    Supabase      | <--> |  Companion's   |
|  PWA       |      |  (Postgres +     |      |  TripDNA PWA   |
|  (phone)   |      |   Auth + RT)     |      |  (phone)       |
+-----+------+      +------------------+      +----------------+
      |
      | calls
      v
+-----+------+     +------------------+
| Google Maps|     |   Open-Meteo     |
| Platform   |     |   Weather API    |
+------------+     +------------------+
```

### Data Flow

```
1. PLANNING (at home, laptop)
   Claude Desktop + MCP → reads Travel DNA profile from Supabase
                        → generates trip JSON
                        → writes trip to Supabase
                        → TripDNA app syncs automatically

2. DURING TRIP (on phone)
   User taps/chats in PWA → writes to localStorage (instant)
                          → background sync to Supabase
                          → companion's app updates via Realtime
                          → Google Maps for live drive times
                          → Open-Meteo for weather

3. POST-TRIP (at home, laptop)
   Claude Desktop + MCP → reads completed trip from Supabase
                        → analyzes patterns, ratings, drift
                        → proposes Travel DNA updates
                        → user approves → profile updated
```

---

## Phase 1: Bug Fixes & UX Gaps (v0.3)

**Goal:** Fix everything identified during the West Texas trip.
**Timeline:** 3-4 days
**Dependencies:** None

### 1.1 Fix Stats Calculations

**Problem:** Driven miles, drive time, and elevation totals don't match reality.

**Root cause analysis:**
- `tripStats()` only counts activities with `status === 'done'`
- Some drive activities were done but not checked off (marked as skipped or left pending)
- Activities without `distance`, `duration`, or `elevationGain` fields are silently excluded
- Drive `duration` field is estimated planning time, not actual driving time

**Fix:**
```javascript
// Current (broken)
const miles = doneActs
  .filter(a => a.distance)
  .reduce((s, a) => s + parseFloat(...), 0);

// Fixed — count done AND check for drives that were skipped but actually driven
const countableActs = acts.filter(a =>
  a.status === 'done' ||
  (a.type === 'drive' && a.status !== 'pending') // skipped drives were still driven
);
```

**Also add:**
- Manual override fields: `actualMiles`, `actualDuration` on activities
- When present, use actual values instead of planned estimates
- Show "planned vs actual" comparison in stats

### 1.2 Fix Gas Total Cost

**Problem:** Gas total is wrong.

**Investigation needed:**
- Audit `gasStats()` reducer against exported JSON
- Check if `total` field is being stored correctly (string vs number?)
- Check if auto-calculation (gallons * price) has rounding issues

**Fix:** Add validation in `addGasEntry()`:
```javascript
const total = parseFloat(totInp.value) || Math.round((gallons * pricePerGal) * 100) / 100;
```

### 1.3 Start/End Activity Tracking

**Current:** Single "Mark Done" button records one timestamp.
**New:** Two-phase check-off.

**UI flow:**
1. Tap circle on pending activity → "Start" button appears
2. Tap Start → status changes to `active`, `startedAt` timestamp recorded, timer begins
3. Activity card shows live elapsed timer
4. Tap circle again → "End" modal with rating/notes, `endedAt` recorded
5. Actual duration = endedAt - startedAt

**Schema change:**
```javascript
{
  "status": "pending | active | done | skipped",
  "startedAt": "ISO timestamp",
  "endedAt": "ISO timestamp",
  "actualDuration": 145, // minutes, calculated from start/end
  "checkedAt": "ISO timestamp" // kept for backward compat
}
```

**Edge cases:**
- User forgets to tap Start → End modal includes "When did you start?" time picker
- User closes app while activity is active → on reopen, show "Still doing X?" with resume/end options
- Battery dies → startedAt is persisted in localStorage, recoverable

### 1.4 Date + Time Picker on Check-Off

**Current:** Only time picker (same day).
**New:** Full date + time input.

```html
<input type="datetime-local" value="2026-04-18T13:45" />
```

Allows checking off yesterday's activity today. Pre-fills with current date/time, adjustable.

### 1.5 Add/Remove/Edit Activities

**Add activity:**
- FAB or "+" button on day view
- Modal: title, type (dropdown), time, duration, description, address
- Inserted into the day's activity list in time order
- Marked with "Added" badge to distinguish from planned activities

**Remove activity:**
- Long-press or swipe on activity card → "Remove" option
- Soft delete: `status: 'removed'`, hidden from view but kept in data
- Recoverable from a "Removed activities" section

**Edit activity:**
- Tap activity detail modal → "Edit" button
- Same form as Add, pre-filled with current values
- Changes tracked: `edited: true`, `editHistory: [{ field, old, new, at }]`

### 1.6 Reschedule Skipped Activities

**Flow:**
1. In Skipped & Missed list, tap activity
2. "Reschedule" option in the modal
3. Day picker: which day to move it to
4. Time picker: what time on that day
5. Activity moves from old day to new day
6. Status resets to `pending`
7. Original day shows "Moved to Day X" ghost entry

**Implementation:**
```javascript
const reschedule = (actId, newDayNumber, newTime) => {
  const { day: oldDay, activity } = findActivity(actId);
  const newDay = state.trip.days.find(d => d.dayNumber === newDayNumber);
  // Remove from old day
  oldDay.activities = oldDay.activities.filter(a => a.id !== actId);
  // Add placeholder
  oldDay.activities.push({ ...activity, status: 'moved', movedTo: newDayNumber });
  // Add to new day
  activity.time = newTime;
  activity.status = 'pending';
  activity.rescheduledFrom = oldDay.dayNumber;
  newDay.activities.push(activity);
  // Sort by time
  newDay.activities.sort((a, b) => parseHM(a.time) - parseHM(b.time));
  saveTrip();
};
```

### 1.7 Edit Expenses

**Current:** Delete and re-create.
**New:** Tap expense → edit modal with same fields pre-filled.

### 1.8 Show Dates Alongside Day Numbers

**Change:** "Day 1" → "Day 1 · Apr 17" everywhere:
- Day picker pills
- Dashboard header
- Day view header
- Calendar grid
- Search results

### 1.9 Correct Booking Costs

**Add:** "Update actual cost" button on each booking card.
- Pre-filled with planned cost
- User enters actual amount after checking out
- Shows planned vs actual comparison
- Feeds into budget accuracy tracking in profile

### 1.10 Auto-Focus Current Day

**Changes:**
- Day tab defaults to today's date (not Day 1)
- Auto-scroll to first pending activity on page load
- Dashboard shows today's view when mid-trip, not requiring navigation

### 1.11 Multi-Voice Ratings & Notes (Family Profile)

**Concept:** One family profile, but ratings and notes are tagged with who said them. Enables Claude to understand individual preferences within the family unit when planning future trips.

**Trip config change — named travelers:**
```javascript
{
  "travelers": [
    { "id": "bt", "name": "BT" },
    { "id": "s", "name": "S" }
  ]
}
```

**Activity rating schema change:**
```javascript
// Old (single rating)
{
  "status": "done",
  "rating": 5,
  "notes": "amazing views"
}

// New (multi-voice ratings)
{
  "status": "done",
  "ratings": [
    { "by": "bt", "rating": 5, "note": "Diego Burger lived up to the hype" },
    { "by": "s",  "rating": 3, "note": "Food was good but $65 for two felt steep" }
  ],
  // Keep legacy fields for backward compat
  "rating": 4,    // auto-calculated average
  "notes": ""     // deprecated, use ratings[].note
}
```

**Check-off modal flow:**
```
┌──────────────────────────────────────────┐
│  Completing: Starlight Theatre            │
│                                           │
│  Who's rating?                            │
│  [BT]  [S]  [Both - same rating]         │
│                                           │
│  ★★★★★  (if BT selected)                 │
│  Note: [Diego Burger was incredible  ]    │
│                                           │
│  [+ Add S's take]                         │
│                                           │
│  [Skip]                    [Save]         │
└──────────────────────────────────────────┘

After tapping "+ Add S's take":

┌──────────────────────────────────────────┐
│  BT: ★★★★★ "Diego Burger was incredible" │
│                                           │
│  S's rating:                              │
│  ★★★☆☆                                   │
│  Note: [Good but pricey for the area ]    │
│                                           │
│  [Skip]                    [Save All]     │
└──────────────────────────────────────────┘
```

**Journal entries — also tagged:**
```javascript
{
  "id": "j-123",
  "by": "bt",        // who wrote it
  "text": "Lost Mine at sunrise was life-changing",
  "createdAt": "ISO",
  "dayNumber": 5
}
```

**Profile extraction — family consensus + divergences:**
```javascript
{
  "familyConsensus": {
    "hike": { "avgRating": { "bt": 4.5, "s": 4.0 }, "bothEnjoy": true },
    "food": { "avgRating": { "bt": 4.2, "s": 3.5 }, "divergence": "budget" },
    "experience": { "avgRating": { "bt": 4.8, "s": 4.8 }, "bothEnjoy": true }
  },
  "divergences": [
    { "topic": "restaurant budget", "bt": "ok with $60+", "s": "prefers under $40" },
    { "topic": "hike difficulty", "bt": "wants harder trails", "s": "prefers moderate" }
  ]
}
```

**Why not RAG:**
- 10 trips = ~500KB of text, fits in Claude's context window
- For 1-10 trips: send full data
- For 10-50 trips: send profile + current trip + past trip summaries
- RAG only needed at 50+ trips (years away)
- Structured JSON is more reliable than embedding-based retrieval for this data size

**Display changes:**
- Activity detail modal shows each person's rating separately
- Day summary shows "BT avg: 4.5★, S avg: 3.8★"
- Dashboard best-rated shows both perspectives
- Export includes all multi-voice data for Claude to read

---

## Phase 2: External APIs (v0.4)

**Goal:** Real data instead of estimates.
**Timeline:** 3-4 days
**Dependencies:** Google Cloud project with Maps API key

### 2.1 Google Maps Integration

**Setup:**
1. Create Google Cloud project
2. Enable: Directions API, Places API, Maps JavaScript API
3. Create API key, restrict to your domain
4. Add `<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&libraries=places">` to index.html

**Features:**

#### Real-Time Drive Times
```javascript
const getDriveTime = async (origin, destination) => {
  const service = new google.maps.DirectionsService();
  const result = await service.route({
    origin, destination,
    travelMode: 'DRIVING',
    drivingOptions: { departureTime: new Date() } // for traffic
  });
  return {
    duration: result.routes[0].legs[0].duration, // with traffic
    distance: result.routes[0].legs[0].distance,
    steps: result.routes[0].legs[0].steps
  };
};
```

**Display:** On drive activity cards, show "Google says 4h 12m (with traffic)" alongside your planned estimate.

#### Place Search
```javascript
const searchPlace = (query, location) => {
  const service = new google.maps.places.PlacesService(map);
  return service.textSearch({
    query,
    location: new google.maps.LatLng(location.lat, location.lng),
    radius: 50000 // 50km
  });
};
```

**Use cases:**
- "Find coffee near me" → results with ratings, hours, address
- Activity location fields use Places Autocomplete instead of manual address entry
- Business resolution: show "V6 Coffee (4.6★, Open until 2 PM)" instead of raw address

#### Embedded Map
- Map view on dashboard showing all activities plotted as pins
- Tap pin → activity detail
- Route line connecting the day's activities
- Consider: Mapbox GL might be better for offline tiles (free tier: 50K loads/month)

### 2.2 Enhanced Weather (Open-Meteo)

**Current:** Single-point forecast for Big Bend region.
**New:**

#### Route Weather
For long drives, query weather at waypoints:
```javascript
const getRouteWeather = async (waypoints, date) => {
  // waypoints: [{lat, lng, name}, ...]
  const lats = waypoints.map(w => w.lat).join(',');
  const lngs = waypoints.map(w => w.lng).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&daily=temperature_2m_max,precipitation_probability_max,weather_code&start_date=${date}&end_date=${date}`;
  const res = await fetch(url);
  return res.json();
};
```

**Display:** "Kyle 86° → Junction 88° → Ozona 82° → Marathon 80°"

#### Hourly Forecast
```
https://api.open-meteo.com/v1/forecast?...&hourly=temperature_2m,precipitation_probability
```

Show hour-by-hour on hike days: "6 AM: 62° | 9 AM: 74° | 12 PM: 85°"

#### Sunrise/Sunset from API
Replace hardcoded `SUN_DATA` with live API:
```
https://api.open-meteo.com/v1/forecast?...&daily=sunrise,sunset
```

---

## Phase 3: Supabase Backend (v0.5)

**Goal:** Persistent data, auth, sharing.
**Timeline:** 1 week
**Dependencies:** Supabase account (free tier)

### 3.1 Supabase Project Setup

```sql
-- Users table (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users primary key,
  display_name text,
  avatar_url text,
  travel_dna jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trips table
create table trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) not null,
  trip_id text not null, -- slug like 'west-texas-2026'
  title text not null,
  data jsonb not null, -- the full trip JSON
  status text default 'active', -- active, completed, archived
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trip members (sharing)
create table trip_members (
  trip_id uuid references trips(id) on delete cascade,
  user_id uuid references profiles(id),
  role text default 'viewer', -- owner, editor, viewer
  visibility text default 'full', -- full, day_by_day, next_only, dates_only, surprise
  invited_at timestamptz default now(),
  primary key (trip_id, user_id)
);

-- Row Level Security
alter table trips enable row level security;
alter table trip_members enable row level security;

-- Users can read trips they're a member of
create policy "Members can read trips" on trips
  for select using (
    owner_id = auth.uid() or
    id in (select trip_id from trip_members where user_id = auth.uid())
  );

-- Only owner can update trip
create policy "Owner can update trips" on trips
  for update using (owner_id = auth.uid());

-- Editors can also update (for companions)
create policy "Editors can update trips" on trips
  for update using (
    id in (select trip_id from trip_members where user_id = auth.uid() and role = 'editor')
  );
```

### 3.2 Authentication

**Google OAuth only** (simplest for personal use):

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sign in
const signIn = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
};

// On auth state change
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    syncFromCloud();
  }
});
```

### 3.3 Offline-First Sync Strategy

```
User action → Write to localStorage (instant, offline-safe)
           → Queue sync job
           → When online: push to Supabase
           → On conflict: last-write-wins with timestamp comparison

App open → Check Supabase for newer data
        → If cloud is newer: merge into localStorage
        → If local is newer: push to cloud
        → Subscribe to Realtime for live updates from companions
```

**Sync implementation:**
```javascript
const SYNC_KEY = 'tripdna.sync.queue';

const queueSync = (tripId, data) => {
  const queue = JSON.parse(localStorage.getItem(SYNC_KEY) || '[]');
  queue.push({ tripId, data, timestamp: Date.now() });
  localStorage.setItem(SYNC_KEY, JSON.stringify(queue));
  processQueue(); // try immediately
};

const processQueue = async () => {
  if (!navigator.onLine) return;
  const queue = JSON.parse(localStorage.getItem(SYNC_KEY) || '[]');
  for (const item of queue) {
    try {
      await supabase.from('trips').upsert({
        trip_id: item.tripId,
        data: item.data,
        updated_at: new Date(item.timestamp).toISOString()
      });
      queue.shift();
      localStorage.setItem(SYNC_KEY, JSON.stringify(queue));
    } catch (e) {
      break; // retry later
    }
  }
};

// Retry on reconnect
window.addEventListener('online', processQueue);
```

### 3.4 Real-Time Companion Sync

```javascript
// Subscribe to trip changes
const subscribeToTrip = (tripId) => {
  supabase
    .channel(`trip:${tripId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'trips',
      filter: `id=eq.${tripId}`
    }, (payload) => {
      const cloudData = payload.new.data;
      const localData = state.trip;
      if (new Date(payload.new.updated_at) > new Date(localData._lastSync)) {
        state.trip = mergeTrips(localData, cloudData);
        saveTrip();
        render();
        toast('Trip updated by companion');
      }
    })
    .subscribe();
};
```

### 3.5 Trip Sharing Flow

1. Owner taps "Share Trip" → generates invite link: `https://app.tripdna.com/invite/{code}`
2. Link contains trip ID + one-time invite code
3. Companion opens link → signs in with Google → added as `trip_member`
4. Owner sets visibility level: full, day-by-day, next-only, surprise
5. Companion sees the trip filtered by their visibility level

**Surprise mode rendering:**
```javascript
const filterByVisibility = (trip, visibility) => {
  switch (visibility) {
    case 'full': return trip;
    case 'day_by_day':
      return { ...trip, days: trip.days.filter(d => d.date <= todayStr()) };
    case 'next_only':
      const today = trip.days.find(d => d.date === todayStr());
      const next = today?.activities.find(a => a.status === 'pending');
      return { ...trip, days: today ? [{ ...today, activities: next ? [next] : [] }] : [] };
    case 'dates_only':
      return { ...trip, days: trip.days.map(d => ({ ...d, activities: [] })), bookings: [] };
    case 'surprise':
      return { ...trip, title: 'Surprise Trip!', subtitle: '', days: [], bookings: [],
        packingList: trip.packingList }; // only show packing
  }
};
```

---

## Phase 4: Travel DNA Profile Engine (v0.6)

**Goal:** Auto-learn traveler patterns. No AI required.
**Timeline:** 1 week
**Dependencies:** Phase 3 (Supabase for persistence)

### 4.1 Profile Schema

```javascript
{
  "userId": "uuid",
  "displayName": "BT",

  // Stated preferences (user-entered)
  "statedPreferences": [
    "Prefers warm weather",
    "Hotel over camping",
    "No alcohol",
    "No Mexico crossing"
  ],

  // Learned behaviors (auto-extracted from trips)
  "learnedBehaviors": {
    "paceProfile": {
      "avgMorningDrift": 22,       // minutes late on avg for morning activities
      "avgAfternoonDrift": -5,     // minutes early for afternoon
      "avgHikeDurationMultiplier": 1.35, // takes 35% longer than planned on hikes
      "avgDriveDurationMultiplier": 1.12  // drives take 12% longer than planned
    },
    "activityPreferences": {
      "hike":       { "avgRating": 4.5, "completionRate": 0.9, "avgDurationDrift": 1.35 },
      "food":       { "avgRating": 4.0, "completionRate": 1.0, "avgDurationDrift": 1.1 },
      "sightseeing":{ "avgRating": 3.5, "completionRate": 0.7, "avgDurationDrift": 0.8 },
      "rest":       { "avgRating": null, "completionRate": 0.3, "avgDurationDrift": null },
      "experience": { "avgRating": 4.8, "completionRate": 1.0, "avgDurationDrift": 1.2 },
      "drive":      { "avgRating": null, "completionRate": 1.0, "avgDurationDrift": 1.12 }
    },
    "budgetProfile": {
      "avgDailyFood": 55,
      "avgDailyTotal": 120,
      "avgGasPricePerGal": 3.35,
      "tipPercentage": 0.20
    },
    "schedulingPatterns": {
      "preferredHikeStartTime": "06:30",
      "preferredDinnerTime": "18:00",
      "maxActivitiesPerDay": 6,
      "needsAfternoonRest": true,
      "restDurationAvg": 90
    }
  },

  // Trip-specific learnings (accumulated across trips)
  "tripLearnings": [
    {
      "tripId": "west-texas-2026",
      "learning": "Lost Mine Trailhead: arrive by 6 AM, not 7 — parking fills fast",
      "category": "timing",
      "location": { "lat": 29.27, "lng": -103.30 }
    },
    {
      "tripId": "west-texas-2026",
      "learning": "Ten Bits Ranch road is rough — always leave dinner by 7:30 PM",
      "category": "logistics"
    }
  ],

  // Regions visited
  "regionsVisited": [
    { "name": "West Texas / Big Bend", "trips": 1, "lastVisited": "2026-04-26" }
  ],

  // Lifetime stats
  "lifetimeStats": {
    "tripsCompleted": 1,
    "totalMilesDriven": 1100,
    "totalHikesCompleted": 5,
    "totalElevationGained": 3967,
    "totalDaysOnRoad": 10,
    "totalSpend": 2850
  }
}
```

### 4.2 Pattern Extraction Engine

Run after each trip completes:

```javascript
const extractPatterns = (trip) => {
  const patterns = {};

  // Time drift analysis
  const drifts = trip.days.flatMap(d => d.activities
    .filter(a => a.status === 'done' && a.startedAt)
    .map(a => ({
      type: a.type,
      plannedMin: parseHM(a.time),
      actualMin: new Date(a.startedAt).getHours() * 60 + new Date(a.startedAt).getMinutes(),
      drift: actualMin - plannedMin
    }))
  );

  // Group by activity type
  const byType = {};
  drifts.forEach(d => {
    if (!byType[d.type]) byType[d.type] = [];
    byType[d.type].push(d.drift);
  });

  // Calculate averages
  patterns.avgDriftByType = {};
  for (const [type, drifts] of Object.entries(byType)) {
    patterns.avgDriftByType[type] = Math.round(
      drifts.reduce((s, d) => s + d, 0) / drifts.length
    );
  }

  // Duration accuracy
  const durations = trip.days.flatMap(d => d.activities
    .filter(a => a.status === 'done' && a.actualDuration && a.duration)
    .map(a => ({ type: a.type, ratio: a.actualDuration / a.duration }))
  );

  patterns.durationMultiplierByType = {};
  // ... group and average ...

  // Skip analysis
  const skipRate = {};
  trip.days.flatMap(d => d.activities).forEach(a => {
    if (!skipRate[a.type]) skipRate[a.type] = { total: 0, skipped: 0 };
    skipRate[a.type].total++;
    if (a.status === 'skipped') skipRate[a.type].skipped++;
  });

  // Rating analysis
  // Budget analysis
  // Scheduling pattern analysis

  return patterns;
};
```

### 4.3 Profile-Aware UI Enhancements

**Smart time estimates:**
```javascript
// Instead of showing planned duration
const smartDuration = (activity, profile) => {
  const multiplier = profile.learnedBehaviors.activityPreferences[activity.type]?.avgDurationDrift || 1;
  const adjusted = Math.round(activity.duration * multiplier);
  return adjusted !== activity.duration
    ? `${fmtDuration(activity.duration)} (likely ${fmtDuration(adjusted)})`
    : fmtDuration(activity.duration);
};
```

**Smart scheduling suggestions:**
```javascript
// When planning, suggest time adjustments
const suggestTimeAdjustment = (activity, profile) => {
  const drift = profile.learnedBehaviors.paceProfile;
  const hour = parseHM(activity.time) / 60;
  if (hour < 10 && drift.avgMorningDrift > 15) {
    return `You usually run ${drift.avgMorningDrift} min late in the morning. Consider scheduling at ${shiftTime(activity.time, -drift.avgMorningDrift)}`;
  }
  return null;
};
```

**Skip predictions:**
```javascript
// Flag activities likely to be skipped
const skipWarning = (activity, profile) => {
  const rate = profile.learnedBehaviors.activityPreferences[activity.type]?.completionRate;
  if (rate !== null && rate < 0.5) {
    return `You typically skip ${activity.type} activities (${Math.round(rate * 100)}% completion rate)`;
  }
  return null;
};
```

---

## Phase 5: Claude Integration (v0.7)

**Goal:** AI-powered planning and analysis using your subscription.
**Timeline:** 3-4 days
**Dependencies:** Phase 3 (Supabase), Phase 4 (Profile)

### 5.1 MCP Server for Claude Desktop

A small Node.js server that Claude Desktop connects to:

```javascript
// mcp-server/index.js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const server = new Server({ name: 'tripdna', version: '1.0.0' });

// Tool: Read user profile
server.setRequestHandler('tools/call', async (request) => {
  switch (request.params.name) {
    case 'get_travel_profile':
      const profile = await supabase.from('profiles')
        .select('travel_dna').eq('id', userId).single();
      return { content: [{ type: 'text', text: JSON.stringify(profile.data.travel_dna) }] };

    case 'get_trip':
      const trip = await supabase.from('trips')
        .select('data').eq('trip_id', request.params.arguments.tripId).single();
      return { content: [{ type: 'text', text: JSON.stringify(trip.data.data) }] };

    case 'create_trip':
      const tripData = JSON.parse(request.params.arguments.tripJson);
      await supabase.from('trips').insert({
        owner_id: userId,
        trip_id: tripData.tripId,
        title: tripData.title,
        data: tripData
      });
      return { content: [{ type: 'text', text: 'Trip created and synced to app.' }] };

    case 'update_travel_dna':
      await supabase.from('profiles').update({
        travel_dna: request.params.arguments.profile,
        updated_at: new Date().toISOString()
      }).eq('id', userId);
      return { content: [{ type: 'text', text: 'Travel DNA updated.' }] };

    case 'list_trips':
      const trips = await supabase.from('trips')
        .select('trip_id, title, status, created_at')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });
      return { content: [{ type: 'text', text: JSON.stringify(trips.data) }] };
  }
});
```

**Claude Desktop config** (`~/.claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "tripdna": {
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"],
      "env": {
        "SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_SERVICE_KEY": "eyJ..."
      }
    }
  }
}
```

**Usage in Claude Desktop:**
```
You: "Plan a 4-day trip to Fredericksburg based on my travel profile"

Claude: [calls get_travel_profile] → reads your preferences, pace, budget
        [generates trip JSON following TripDNA schema]
        [calls create_trip] → trip appears in your app instantly
```

### 5.2 In-App Chat (Optional, Haiku)

Small chat drawer for on-road queries:

```javascript
const chatWithClaude = async (message) => {
  const apiKey = localStorage.getItem('tripdna.claude.key');
  if (!apiKey) { promptForApiKey(); return; }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You are a trip companion. Current trip: ${JSON.stringify(state.trip)}. User's profile: ${JSON.stringify(profile)}. Today is ${todayStr()}.`,
      messages: [{ role: 'user', content: message }],
      tools: [
        { name: 'checkOffActivity', description: '...', input_schema: {...} },
        { name: 'addExpense', description: '...', input_schema: {...} },
        { name: 'shiftTime', description: '...', input_schema: {...} },
        // ... more tools
      ]
    })
  });
  // Handle tool calls and text responses
};
```

**Cost control:**
- Send only today's day data + profile summary, not the full trip JSON (~5K tokens vs 30K)
- Cache system prompt across messages in a conversation
- Show estimated cost per message ("~$0.01")
- Set daily budget cap in settings

---

## Phase 6: Expenses Tab & Financial Tracking (v0.8)

**Goal:** Dedicated expense management with filters and analysis.
**Timeline:** 2-3 days

**Expense model:** Family travels as one unit, one wallet. No per-person splitting, no "who paid", no settle-up. Just: what was spent, on what, on which day. Splitting/settle-up is a future feature only if traveling with non-family who keep separate tabs.

### 6.1 Expenses as a Nav Tab

Replace "More" with split navigation:

```
Home | Day | Bookings | Expenses | More
```

Or keep 4 tabs and put Expenses as the first section in More with a "View All" link to a full-screen view.

### 6.2 Expense List View

```
[Search bar] [Filter: All v] [Sort: Date v]

---- Apr 17 (Day 1) ---- $42.50
  Gas — Junction Chevron          $38.50  ⛽
  Snack — gas station             $4.00   🍽️

---- Apr 18 (Day 2) ---- $87.30
  Lunch — Espresso y Poco Mas     $22.00  🍽️
  Dinner — Starlight Theatre      $65.30  🍽️

---- Apr 19 (Day 3) ---- $52.00
  Park entry — Big Bend NP        $30.00  🎯
  Lunch — Chisos Lodge            $22.00  🍽️

                          TOTAL: $1,847.00
```

**Filters:**
- By category: food, gas, park fee, souvenir, tip, other
- By day/date range
- By amount range

**Charts (stretch):**
- Daily spending bar chart
- Category pie chart
- Cumulative line chart

### 6.3 Booking Cost Correction

On each booking card, add "Update Actual Cost" button:
```javascript
{
  "cost": 224.87,       // planned/prepaid
  "actualCost": 487.50, // what you actually paid
  "costNotes": "3 nights full rate + tax, prepayment was deposit only"
}
```

---

## Phase 7: Content Enrichment (v0.9)

**Goal:** Richer activity data for better on-ground experience.
**Timeline:** 2-3 days

### 7.1 Restaurant Menu Highlights

**Schema addition:**
```javascript
{
  "id": "d2-a7",
  "title": "Dinner at Starlight Theatre",
  "type": "food",
  "menuHighlights": [
    { "item": "Diego Burger", "note": "Top 50 in Texas", "price": "$16" },
    { "item": "Chicken-fried antelope", "note": "House specialty", "price": "$24" },
    { "item": "Prickly pear margarita", "note": "Signature drink (alcoholic)", "tags": ["alcohol"] }
  ],
  "dietaryNotes": "Limited vegetarian options. Ask about daily specials."
}
```

**Display:** In activity detail modal, show menu section with items. Filter by user preferences (hide alcohol-tagged items if preference says "no alcohol").

**Population:** Claude adds these during trip planning by searching for restaurant menus.

### 7.2 Route Weather Display

On drive activity cards for drives > 2 hours:
```
Kyle 86° → Junction 88° → Ozona 82° → Marathon 80°
☀️ Clear along entire route
```

Fetch from Open-Meteo with waypoint coordinates.

---

## Milestone Summary

| Phase | Version | What | Timeline | Cost |
|-------|---------|------|----------|------|
| 1 | v0.3 | Bug fixes, start/end tracking, add/remove activities | 3-4 days | $0 |
| 2 | v0.4 | Google Maps, enhanced weather | 3-4 days | $0 |
| 3 | v0.5 | Supabase backend, auth, sharing, surprise mode | 1 week | $0 |
| 4 | v0.6 | Travel DNA profile engine | 1 week | $0 |
| 5 | v0.7 | Claude MCP + optional in-app chat | 3-4 days | $0-2/trip |
| 6 | v0.8 | Expenses tab, financial tracking | 2-3 days | $0 |
| 7 | v0.9 | Menu highlights, route weather | 2-3 days | $0 |
| - | v1.0 | Polish, testing, launch | 1 week | $0 |

**Total timeline:** ~6-8 weeks at casual pace
**Total cost:** $0/month (all free tiers)

---

## Tech Stack Summary

| Layer | v0.x (current) | v1.0 (target) |
|-------|---------------|---------------|
| Frontend | Vanilla HTML/JS | React + Vite (or keep vanilla) |
| Styling | Tailwind CDN | Tailwind (compiled) |
| Storage | localStorage | Supabase Postgres + localStorage cache |
| Auth | None | Supabase Auth (Google OAuth) |
| Maps | Static addresses | Google Maps Platform |
| Weather | Open-Meteo (basic) | Open-Meteo (hourly + route) |
| AI | None | Claude Desktop MCP + Haiku in-app |
| Hosting | GitHub Pages | Vercel (or keep GitHub Pages) |
| Offline | Basic service worker | Workbox + IndexedDB sync queue |

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | Supabase (Postgres) | Free tier, auth included, realtime, no server to manage |
| Auth | Google OAuth only | Personal use, all users have Google accounts |
| AI for planning | Claude Desktop + MCP | Free with existing subscription, full power model |
| AI for on-road | Haiku (optional) | Cheapest Claude model, only for complex queries |
| Maps | Google Maps Platform | $200/month free credit, best data quality |
| Weather | Open-Meteo | Completely free, no API key, good enough accuracy |
| Frontend framework | Keep vanilla JS for now | Works fine, migration to React is optional polish |
| Trip data storage | Single JSONB column | Matches current schema, flexible, no migration needed |
| Offline strategy | localStorage first, sync to cloud | Proven pattern, works in Big Bend with no signal |
| Companion sync | Supabase Realtime | Built-in, no additional infrastructure |
| Surprise mode | Client-side filtering | Data stays complete in DB, visibility is a render filter |
