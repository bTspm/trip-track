#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.TRIPDNA_DATA_DIR || path.resolve(import.meta.dirname, "..");

const readTrips = () => {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json") && !f.includes("package"));
  return files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8"));
    return { file: f, ...data };
  });
};

const readTrip = (tripId) => {
  const trips = readTrips();
  return trips.find(t => t.tripId === tripId) || trips[0];
};

const writeTrip = (trip) => {
  const filename = `${trip.tripId}.json`;
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(trip, null, 2));
  return filename;
};

const readProfile = () => {
  const profilePath = path.join(DATA_DIR, "profile.json");
  if (fs.existsSync(profilePath)) return JSON.parse(fs.readFileSync(profilePath, "utf-8"));
  return { statedPreferences: [], learnedBehaviors: {}, tripLearnings: [], lifetimeStats: {} };
};

const writeProfile = (profile) => {
  fs.writeFileSync(path.join(DATA_DIR, "profile.json"), JSON.stringify(profile, null, 2));
};

const server = new McpServer({
  name: "tripdna",
  version: "0.1.0",
});

server.tool(
  "get_travel_profile",
  "Read the user's Travel DNA profile — preferences, learned behaviors, patterns from past trips",
  {},
  async () => {
    const profile = readProfile();
    return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }] };
  }
);

server.tool(
  "update_travel_profile",
  "Update the user's Travel DNA profile with new preferences or learned behaviors",
  { profile: z.object({}).passthrough().describe("The updated profile object (merged with existing)") },
  async ({ profile }) => {
    const existing = readProfile();
    const merged = { ...existing, ...profile };
    if (profile.statedPreferences) {
      merged.statedPreferences = [...new Set([...(existing.statedPreferences || []), ...profile.statedPreferences])];
    }
    if (profile.tripLearnings) {
      merged.tripLearnings = [...(existing.tripLearnings || []), ...profile.tripLearnings];
    }
    writeProfile(merged);
    return { content: [{ type: "text", text: "Profile updated." }] };
  }
);

server.tool(
  "list_trips",
  "List all trips with their ID, title, dates, and completion status",
  {},
  async () => {
    const trips = readTrips();
    const summary = trips.map(t => ({
      tripId: t.tripId,
      title: t.title,
      dates: `${t.startDate} to ${t.endDate}`,
      days: t.days?.length || 0,
      file: t.file
    }));
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  }
);

server.tool(
  "get_trip",
  "Read a specific trip's full data including all activities, check-offs, ratings, expenses, journal",
  { tripId: z.string().describe("The trip ID slug, e.g. 'west-texas-2026'") },
  async ({ tripId }) => {
    const trip = readTrip(tripId);
    if (!trip) return { content: [{ type: "text", text: `Trip '${tripId}' not found.` }] };
    return { content: [{ type: "text", text: JSON.stringify(trip, null, 2) }] };
  }
);

server.tool(
  "get_trip_stats",
  "Get aggregated statistics across all trips — total miles, hikes, elevation, spending, ratings",
  {},
  async () => {
    const trips = readTrips();
    const stats = { tripsCompleted: 0, totalMiles: 0, totalHikes: 0, totalElevation: 0, totalSpend: 0, totalDays: 0, allRatings: [] };

    trips.forEach(t => {
      stats.tripsCompleted++;
      stats.totalDays += t.days?.length || 0;
      (t.days || []).forEach(d => {
        d.activities?.forEach(a => {
          if (a.status === "done") {
            if (a.distance) stats.totalMiles += parseFloat(String(a.distance).replace(/[^\d.]/g, "")) || 0;
            if (a.type === "hike") stats.totalHikes++;
            if (a.elevationGain) stats.totalElevation += a.elevationGain;
            if (a.rating) stats.allRatings.push({ title: a.title, rating: a.rating, trip: t.tripId });
          }
        });
      });
      stats.totalSpend += (t.bookings || []).reduce((s, b) => s + (b.actualCost || b.cost || 0), 0);
      stats.totalSpend += (t.gasLog || []).reduce((s, g) => s + (g.total || 0), 0);
      stats.totalSpend += (t.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
    });

    stats.totalMiles = Math.round(stats.totalMiles);
    stats.avgRating = stats.allRatings.length
      ? (stats.allRatings.reduce((s, r) => s + r.rating, 0) / stats.allRatings.length).toFixed(1)
      : null;
    stats.topRated = stats.allRatings.sort((a, b) => b.rating - a.rating).slice(0, 5);

    return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
  }
);

server.tool(
  "search_activities",
  "Search across all trips for activities matching a query. Search by name, type, rating, or location.",
  {
    query: z.string().optional().describe("Text to search in activity titles and descriptions"),
    type: z.string().optional().describe("Activity type: hike, food, drive, lodging, experience, sightseeing, activity, rest"),
    minRating: z.number().optional().describe("Minimum rating (1-5)"),
  },
  async ({ query, type, minRating }) => {
    const trips = readTrips();
    const results = [];
    trips.forEach(t => {
      (t.days || []).forEach(d => {
        d.activities?.forEach(a => {
          let match = true;
          if (query) {
            const hay = [a.title, a.description, a.location?.name, a.location?.address].filter(Boolean).join(" ").toLowerCase();
            if (!hay.includes(query.toLowerCase())) match = false;
          }
          if (type && a.type !== type) match = false;
          if (minRating && (!a.rating || a.rating < minRating)) match = false;
          if (match) results.push({ trip: t.tripId, day: d.dayNumber, date: d.date, ...a });
        });
      });
    });
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }
);

server.tool(
  "create_trip",
  "Create a new trip from a TripDNA JSON object. Saves to filesystem and will sync to app.",
  { trip: z.object({}).passthrough().describe("Full trip JSON following the TripDNA schema") },
  async ({ trip }) => {
    if (!trip.tripId) return { content: [{ type: "text", text: "Error: trip must have a tripId field." }] };
    const filename = writeTrip(trip);
    return { content: [{ type: "text", text: `Trip '${trip.tripId}' saved as ${filename}. Import it into the TripDNA app.` }] };
  }
);

server.tool(
  "update_trip",
  "Update specific fields of an existing trip",
  {
    tripId: z.string().describe("The trip ID to update"),
    updates: z.object({}).passthrough().describe("Fields to update (merged into existing trip)")
  },
  async ({ tripId, updates }) => {
    const trip = readTrip(tripId);
    if (!trip) return { content: [{ type: "text", text: `Trip '${tripId}' not found.` }] };
    const updated = { ...trip, ...updates };
    delete updated.file;
    writeTrip(updated);
    return { content: [{ type: "text", text: `Trip '${tripId}' updated.` }] };
  }
);

server.tool(
  "analyze_trip_patterns",
  "Analyze a completed trip and extract behavioral patterns for the Travel DNA profile",
  { tripId: z.string().describe("The trip ID to analyze") },
  async ({ tripId }) => {
    const trip = readTrip(tripId);
    if (!trip) return { content: [{ type: "text", text: `Trip '${tripId}' not found.` }] };

    const analysis = { tripId, patterns: {} };
    const allActs = (trip.days || []).flatMap(d => d.activities || []);
    const done = allActs.filter(a => a.status === "done");
    const skipped = allActs.filter(a => a.status === "skipped");

    // Rating analysis by type
    const ratingsByType = {};
    done.filter(a => a.rating).forEach(a => {
      if (!ratingsByType[a.type]) ratingsByType[a.type] = [];
      ratingsByType[a.type].push(a.rating);
    });
    analysis.patterns.avgRatingByType = {};
    for (const [type, ratings] of Object.entries(ratingsByType)) {
      analysis.patterns.avgRatingByType[type] = +(ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1);
    }

    // Skip rate by type
    const skipRate = {};
    allActs.forEach(a => {
      if (!skipRate[a.type]) skipRate[a.type] = { total: 0, skipped: 0 };
      skipRate[a.type].total++;
      if (a.status === "skipped") skipRate[a.type].skipped++;
    });
    analysis.patterns.skipRateByType = {};
    for (const [type, data] of Object.entries(skipRate)) {
      analysis.patterns.skipRateByType[type] = +(data.skipped / data.total).toFixed(2);
    }

    // Time drift (if startedAt exists)
    const drifts = done
      .filter(a => a.startedAt || a.checkedAt)
      .map(a => {
        const planned = parseInt(a.time.split(":")[0]) * 60 + parseInt(a.time.split(":")[1]);
        const actual = new Date(a.startedAt || a.checkedAt);
        const actualMin = actual.getHours() * 60 + actual.getMinutes();
        return { type: a.type, drift: actualMin - planned };
      });

    const driftByType = {};
    drifts.forEach(d => {
      if (!driftByType[d.type]) driftByType[d.type] = [];
      driftByType[d.type].push(d.drift);
    });
    analysis.patterns.avgDriftByType = {};
    for (const [type, vals] of Object.entries(driftByType)) {
      analysis.patterns.avgDriftByType[type] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    }

    // Budget
    const foodExpenses = (trip.expenses || []).filter(e => e.category === "food");
    const gasLog = trip.gasLog || [];
    analysis.patterns.budget = {
      totalFoodSpend: foodExpenses.reduce((s, e) => s + (e.amount || 0), 0),
      avgDailyFood: foodExpenses.length ? +(foodExpenses.reduce((s, e) => s + (e.amount || 0), 0) / (trip.days?.length || 1)).toFixed(0) : null,
      totalGasSpend: gasLog.reduce((s, g) => s + (g.total || 0), 0),
      avgGasPrice: gasLog.length ? +(gasLog.reduce((s, g) => s + (g.pricePerGal || 0), 0) / gasLog.length).toFixed(2) : null,
    };

    // Top and bottom activities
    analysis.patterns.topRated = done.filter(a => a.rating).sort((a, b) => b.rating - a.rating).slice(0, 5).map(a => ({ title: a.title, rating: a.rating, type: a.type }));
    analysis.patterns.bottomRated = done.filter(a => a.rating).sort((a, b) => a.rating - b.rating).slice(0, 3).map(a => ({ title: a.title, rating: a.rating, type: a.type }));
    analysis.patterns.skippedActivities = skipped.map(a => ({ title: a.title, type: a.type }));

    // Journal entries (tips and learnings)
    analysis.journal = (trip.journal || []).map(j => j.text);

    return { content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
