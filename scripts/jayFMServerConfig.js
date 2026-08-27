// scripts/jayFMServerConfig.js
// All configurable settings for Jay's FM Server
// Edit this file to change behavior — no code changes needed!

module.exports = {

  // ── Content Generation Schedule ──────────────────────────────────────────
  CONTENT_SCHEDULE: {
    // Morning slots generated at 5AM IST
    MORNING: {
      HOUR: 5,
      MINUTE: 0,
      SLOTS: ['rhythms', 'rasi_palan', 'morning_news', 'thalaivar', 'health', 'movie_review', 'agriculture', 'travel'],
    },
    // Afternoon slots generated at 11AM IST
    AFTERNOON: {
      HOUR: 11,
      MINUTE: 0,
      SLOTS: ['local_news', 'weather', 'comedy', 'science', 'evening_news', 'horror', 'love', 'night'],
    },
  },

  // ── Audio Generation Schedule ────────────────────────────────────────────
  AUDIO_SCHEDULE: {
    // Morning audio at 5:30AM IST (30 mins after content)
    MORNING: {
      HOUR: 5,
      MINUTE: 30,
      SLOTS: ['rhythms', 'rasi_palan', 'morning_news', 'thalaivar', 'health', 'movie_review', 'agriculture', 'travel'],
    },
    // Afternoon audio at 11:30AM IST
    AFTERNOON: {
      HOUR: 11,
      MINUTE: 30,
      SLOTS: ['local_news', 'weather', 'comedy', 'science', 'evening_news', 'horror', 'love', 'night'],
    },
  },

  // ── TTS Settings ─────────────────────────────────────────────────────────
  TTS: {
    DEFAULT_VOICE: 'ta-IN-Wavenet-D',
    SPEAKING_RATE: 0.95,
    // Per-slot voice override (optional)
    SLOT_VOICES: {
      rasi_palan:   'ta-IN-Wavenet-A', // female voice for astrology
      morning_news: 'ta-IN-Wavenet-D', // male voice for news
      thalaivar:    'ta-IN-Wavenet-B',
      love:         'ta-IN-Wavenet-C',
      health:       'ta-IN-Wavenet-D',
    },
  },

  // ── Storage ───────────────────────────────────────────────────────────────
  STORAGE: {
    BUCKET: 'rideai-84dff.firebasestorage.app',
    BASE_PATH: 'jayfm/audio',
    RETENTION_DAYS: 3, // Keep 3 days of audio
  },

  // ── Firebase ──────────────────────────────────────────────────────────────
  FIREBASE: {
    PROJECT_ID: 'rideai-84dff',
    TIMEZONE: 'Asia/Kolkata',
  },

};