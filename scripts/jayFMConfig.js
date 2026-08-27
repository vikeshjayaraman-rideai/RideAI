// jayFMConfig.js — Central config for Jay's FM
// Edit this file to change prompts, queries, slots without touching main code

module.exports = {

  // ── Schedule ─────────────────────────────────────────────────────────────
  SCHEDULE: [
    // Morning block
    { id: 'rhythms',      title: 'Rhythms',         emoji: '🎵', contentType: 'spiritual',    segments: 8,  startHour: 6,  startMin: 0,  endHour: 7,  endMin: 0  },
    { id: 'rasi_palan',   title: 'Rasi Palan',       emoji: '⭐', contentType: 'astrology',    segments: 12, startHour: 7,  startMin: 0,  endHour: 8,  endMin: 0  },
    { id: 'morning_news', title: 'Morning News',     emoji: '📰', contentType: 'news',         segments: 8,  startHour: 8,  startMin: 0,  endHour: 9,  endMin: 0  },
    { id: 'thalaivar',    title: 'Thalaivar Valga',  emoji: '👑', contentType: 'leader',       segments: 8,  startHour: 9,  startMin: 0,  endHour: 10, endMin: 0  },
    { id: 'health',       title: 'Healthy Tips',     emoji: '💪', contentType: 'health',       segments: 8,  startHour: 10, startMin: 0,  endHour: 11, endMin: 0  },
    { id: 'movie_review', title: 'Movie Masala',     emoji: '🎬', contentType: 'movie',        segments: 8,  startHour: 11, startMin: 0,  endHour: 12, endMin: 0  },
    // Afternoon block
    { id: 'agriculture',  title: 'Vivasayam',        emoji: '🌾', contentType: 'agriculture',  segments: 4,  startHour: 12, startMin: 0,  endHour: 12, endMin: 30 },
    { id: 'travel',       title: 'Travel Time',      emoji: '🛣️', contentType: 'travel',       segments: 8,  startHour: 12, startMin: 30, endHour: 13, endMin: 30 },
    { id: 'local_news',   title: 'Local News',       emoji: '📡', contentType: 'news',         segments: 4,  startHour: 13, startMin: 30, endHour: 14, endMin: 0  },
    { id: 'weather',      title: 'Weather Update',   emoji: '🌤️', contentType: 'weather',      segments: 2,  startHour: 14, startMin: 0,  endHour: 14, endMin: 15 },
    { id: 'comedy',       title: 'Comedy Stop',      emoji: '😂', contentType: 'comedy',       segments: 8,  startHour: 14, startMin: 15, endHour: 15, endMin: 15 },
    { id: 'science',      title: 'Science Time',     emoji: '🔬', contentType: 'science',      segments: 8,  startHour: 15, startMin: 15, endHour: 16, endMin: 15 },
    // Evening block
    { id: 'evening_news', title: 'Evening News',     emoji: '📺', contentType: 'news',         segments: 8,  startHour: 16, startMin: 15, endHour: 17, endMin: 15 },
    { id: 'horror',       title: 'Horror Stories',   emoji: '👻', contentType: 'horror',       segments: 8,  startHour: 17, startMin: 15, endHour: 18, endMin: 15 },
    { id: 'love',         title: 'Love Stories',     emoji: '❤️', contentType: 'love',         segments: 8,  startHour: 18, startMin: 15, endHour: 19, endMin: 15 },
    { id: 'night',        title: 'Night Stories',    emoji: '🌙', contentType: 'night',        segments: 8,  startHour: 19, startMin: 15, endHour: 20, endMin: 15 },
    { id: 'night_music',  title: 'Night Music',      emoji: '🎶', contentType: 'music_only',   segments: 0,  startHour: 20, startMin: 15, endHour: 6,  endMin: 0  },
  ],

  // ── Mini-song queries (Deezer 30s previews between content chunks) ─────────
  // Edit these to change the background music between content chunks
  SONG_QUERIES: {
    rhythms:      ['Tamil morning songs', 'Tamil peppy songs', 'Tamil motivation songs',
                   'Anirudh Ravichander songs', 'AR Rahman Tamil songs', 'Tamil mass songs',
                   'Tamil trending songs', 'Tamil upbeat songs', 'Tamil dance songs'],
    rasi_palan:   ['Ilaiyaraaja melody songs', 'Tamil devotional songs', 'Murugan bhakthi songs',
                   'SPB melody songs', 'Tamil 90s melody', 'Tamil soft melody',
                   'Tamil evergreen songs', 'KJ Yesudas Tamil songs', 'Tamil classical melody'],
    morning_news: ['AR Rahman Tamil songs', 'Harris Jayaraj songs', 'Yuvan Shankar Raja songs',
                   'Anirudh Ravichander songs', 'D Imman songs', 'GV Prakash songs',
                   'Tamil hits 2024', 'Tamil blockbuster songs', 'Tamil superhits'],
    thalaivar:    ['MGR hits songs', 'Rajinikanth songs', 'Sivaji Ganesan songs',
                   'Tamil patriotic songs', 'Tamil mass songs', 'Tamil all time hits',
                   'Tamil legend songs', 'Tamil classic hits', 'Tamil inspirational songs'],
    health:       ['Tamil energetic songs', 'Tamil kuthu songs', 'Tamil peppy songs',
                   'Anirudh dance songs', 'Tamil mass dance songs', 'Tamil folk dance songs',
                   'Tamil gaana songs', 'Tamil celebration songs', 'Tamil trending kuthu'],
    movie_review: ['Tamil movie songs 2024', 'Tamil movie songs 2025', 'Tamil new movie songs',
                   'Tamil blockbuster movie songs', 'Kollywood latest songs', 'Tamil hit movie songs',
                   'Tamil film songs hits', 'Tamil award winning songs', 'Tamil cinema songs'],
    agriculture:  ['Tamil folk songs', 'Tamil village songs', 'Tamil gaana songs',
                   'Tamil karagattam songs', 'Tamil folk dance songs', 'Tamil traditional songs',
                   'Tamil natupura padal', 'Tamil rural songs', 'Tamil devotional folk'],
    travel:       ['Tamil road trip songs', 'Tamil travel songs', 'Tamil adventure songs',
                   'Tamil bike songs', 'Tamil mass action songs', 'Tamil hero songs',
                   'AR Rahman Tamil beats', 'Tamil upbeat songs', 'Tamil BGM instrumental'],
    local_news:   ['Tamil melody songs', '80s Tamil songs', '90s Tamil melody',
                   'Ilaiyaraaja hits', 'MSV songs Tamil', 'Tamil evergreen songs',
                   'Tamil classic melody', 'Tamil old hits', 'SPB Tamil songs'],
    weather:      ['Tamil mazhai songs', 'Tamil rain songs', 'Tamil romantic rain songs',
                   'Tamil soft melody', 'Tamil chill songs', 'Tamil monsoon songs',
                   'Tamil peaceful songs', 'Tamil calm melody', 'Tamil love songs rain'],
    comedy:       ['Tamil comedy songs', 'Tamil kuthu songs', 'Tamil fun songs',
                   'Tamil dance party songs', 'Tamil gaana kuthu', 'Tamil celebration songs',
                   'Tamil folk comedy', 'Tamil trending dance songs', 'Tamil mass comedy'],
    science:      ['Tamil BGM instrumental', 'AR Rahman instrumental', 'Harris Jayaraj BGM',
                   'Tamil background music', 'GV Prakash BGM', 'Tamil fusion music',
                   'Tamil ambient songs', 'Tamil instrumental melody', 'Tamil electronic music'],
    evening_news: ['Tamil evening melody', 'SPB Tamil songs', 'Tamil 90s melody',
                   'Tamil soft evening songs', 'Tamil bhakthi songs', 'Tamil classic evening',
                   'Tamil devotional songs', 'Tamil peaceful melody', 'Tamil sunset songs'],
    horror:       ['Tamil thriller BGM', 'Tamil horror BGM', 'Tamil suspense music',
                   'Tamil dark BGM instrumental', 'Tamil mystery songs', 'Tamil intense BGM',
                   'Tamil action BGM', 'Tamil background thriller', 'Tamil dark melody'],
    love:         ['Tamil love songs', 'Tamil romantic melody', 'Tamil romantic songs 2024',
                   'Simbu love songs', 'Ajith love songs', 'Suriya romantic songs',
                   'Vijay love songs', 'Tamil love duet songs', 'Tamil couple songs',
                   'Arjun Tamil songs', 'Tamil hero romantic songs', 'Tamil feel good songs'],
    night_music:  ['Tamil melody songs', 'Tamil 90s melody', 'Ilaiyaraaja melody songs',
                   'Tamil soft songs', 'Tamil chill songs', 'SPB melody songs',
                   'Tamil romantic songs', 'Tamil love songs', 'Tamil evergreen songs',
                   'Tamil instrumental songs', 'Tamil BGM music', 'Harris Jayaraj melody',
                   'AR Rahman soft songs', 'Tamil lullaby songs', 'Tamil peaceful songs'],
    night:        ['Tamil night songs', 'Tamil chill songs', 'Tamil soft melody night',
                   'Tamil relaxing songs', 'Tamil slow melody', '90s Tamil night melody',
                   'Tamil classic night songs', 'Tamil lullaby songs', 'Tamil soothing melody',
                   'Ilaiyaraaja night songs', 'Tamil ambient music', 'Tamil peaceful night'],
  },

  // ── SFX queries — instrumental bgm per slot (fetched fresh from Deezer at runtime) ──
  // Edit these to change the background chime/music for each program
  SFX_QUERIES: {
    rhythms:      'Hans Zimmer morning',
    rasi_palan:   'Yanni meditation',
    morning_news: 'news theme instrumental',
    thalaivar:    'AR Rahman bgm',
    health:       'energetic workout bgm',
    movie_review: 'film score instrumental',
    agriculture:  'flute instrumental folk',
    travel:       'road trip bgm instrumental',
    local_news:   'news theme bgm',
    weather:      'ambient piano instrumental',
    comedy:       'circus fun bgm instrumental',
    science:      'space ambient electronic',
    evening_news: 'evening news theme',
    horror:       'dark ambient horror bgm',
    love:         'romantic piano bgm',
    night:        'night jazz instrumental',
  },

  // ── Song queries — multiple variations rotate daily ────────────────────
  // Add more variations for more variety. Rotates by day + random page offset.
  MINI_SONG_QUERIES: {
    rhythms:      ['Tamil peppy songs', 'Tamil kuthu songs', 'Tamil motivational songs', 'Tamil upbeat songs', 'Tamil dance songs'],
    rasi_palan:   ['Tamil melody songs', 'Tamil soft melody', 'Tamil evergreen songs', 'Tamil melody hits', 'Tamil classic songs'],
    morning_news: ['Tamil hits songs', 'Tamil blockbuster songs', 'Tamil trending songs', 'Tamil popular songs', 'Tamil super hits'],
    thalaivar:    ['Tamil mass songs', 'Tamil hero songs', 'Tamil powerful songs', 'Tamil mass hits', 'Tamil rajinikanth songs'],
    health:       ['Tamil dance songs', 'Tamil kuthu songs', 'Tamil energy songs', 'Tamil fast songs', 'Tamil peppy songs'],
    movie_review: ['Tamil movie songs', 'Tamil cinema songs', 'Tamil latest songs', 'Tamil new songs', 'Tamil film songs'],
    agriculture:  ['Tamil folk songs', 'Tamil nattu paatu', 'Tamil village songs', 'Tamil folk music', 'Tamil gana songs'],
    travel:       ['Tamil road songs', 'Tamil journey songs', 'Tamil driving songs', 'Tamil travel songs', 'Tamil adventure songs'],
    local_news:   ['Tamil hits songs', 'Tamil trending songs', 'Tamil popular songs', 'Tamil super hits', 'Tamil all time hits'],
    weather:      ['Tamil rain songs', 'Tamil soft songs', 'Tamil melody songs', 'Tamil soothing songs', 'Tamil calm songs'],
    comedy:       ['Tamil comedy songs', 'Tamil kuthu songs', 'Tamil fun songs', 'Tamil dance songs', 'Tamil peppy songs'],
    science:      ['Tamil bgm songs', 'Tamil background music', 'Tamil movie bgm', 'Tamil instrumental songs', 'Tamil keyboard songs'],
    evening_news: ['Tamil evening songs', 'Tamil relaxing songs', 'Tamil melody songs', 'Tamil soft songs', 'Tamil chill songs'],
    horror:       ['Tamil thriller bgm', 'Tamil horror songs', 'Tamil suspense bgm', 'Tamil dark songs', 'Tamil mystery songs'],
    love:         ['Tamil love songs', 'Tamil romantic songs', 'Tamil kadhal songs', 'Tamil duet songs', 'Tamil soft melody'],
    night:        ['Tamil night songs', 'Tamil late night songs', 'Tamil midnight songs', 'Tamil calm songs', 'Tamil slow songs'],
  },

  // ── Content prompts per content type ─────────────────────────────────────
  CONTENT_GUIDE: {
    motivational: `தமிழிலேயே மட்டும் எழுதவும். பைக் ஓட்டுபவர்களின் வாழ்க்கையுடன் தொடர்புடைய உண்மையான தூண்டுதல் கதை பகிரவும். தமிழ் வரலாறு, திரைப்படங்கள் அல்லது உண்மையான நபர்களிலிருந்து உதாரணங்கள் எடுக்கவும். ஆற்றலுடன் ஆரம்பித்து சக்திவாய்ந்த வாக்கியத்துடன் முடிக்கவும். குறைந்தது 800 எழுத்துகள்.`,

    health: `தமிழிலேயே மட்டும் எழுதவும். பைக் ஓட்டுபவர்களுக்கான 2-3 குறிப்பிட்ட நடைமுறை ஆரோக்கிய குறிப்புகள். உட்கார்ந்திருக்கும் நிலை, கண் பாதுகாப்பு, நீர்ச்சத்து, உணவு, ஓய்வு பற்றி சொல்லவும். குறைந்தது 800 எழுத்துகள்.`,

    movie: `தமிழிலேயே மட்டும் எழுதவும். இந்த தமிழ் திரைப்படத்தை விரிவாக மதிப்பிடவும். கதை, நடிப்பு, இசை, இயக்கம் பற்றி பேசவும். வடிவேல் ஸ்டைல் வேடிக்கையான கமெண்ட் சேர்க்கவும். குறைந்தது 800 எழுத்துகள்.`,

    agriculture: `தமிழிலேயே மட்டும் எழுதவும். தமிழ்நாடு விவசாயிகளுக்கான நடைமுறை குறிப்புகள். தமிழ்நாட்டு விவசாயிகளின் உண்மையான உதாரணங்கள் சேர்க்கவும். குறைந்தது 800 எழுத்துகள்.`,

    travel: `தமிழிலேயே மட்டும் எழுதவும். இந்த இடத்தை பைக் ஓட்டுபவர்களுக்காக விரிவாக விவரிக்கவும். வரலாறு, உணவு, சிறந்த ரூட்டுகள், மறைந்திருக்கும் இடங்கள் பற்றி சொல்லவும். குறைந்தது 800 எழுத்துகள்.`,

    leader: `தமிழிலேயே மட்டும் எழுதவும். இந்த தலைவரின் வாழ்க்கை கதை சொல்லவும். ஆரம்ப வாழ்க்கை, போராட்டங்கள், சாதனைகள், மரபு பற்றி பேசவும். குறைந்தது 800 எழுத்துகள்.`,

    comedy: `தமிழிலேயே மட்டும் எழுதவும். வடிவேல்/கவுண்டமணி ஸ்டைல் வேடிக்கையான கதை. உரையாடலுடன் கட்டமைத்து பஞ்ச்லைனுடன் முடிக்கவும். குறைந்தது 800 எழுத்துகள்.`,

    science: `தமிழிலேயே மட்டும் எழுதவும். அதிர்ச்சியான அறிவியல் உண்மையிலிருந்து தொடங்கவும். பைக் ஓட்டுபவர்களுக்கு புரியும் உதாரணங்களுடன் விளக்கவும். குறைந்தது 800 எழுத்துகள்.`,

    horror: `தமிழிலேயே மட்டும் எழுதவும். இருண்ட நெடுஞ்சாலையில் திகில் கதை. மர்மம், பதற்றம், திருப்பம் சேர்க்கவும். குறைந்தது 800 எழுத்துகள்.`,

    love: `தமிழிலேயே மட்டும் எழுதவும். பைக் பயணத்துடன் தொடர்புடைய காதல் கதை. சந்திப்பு, தடைகள், இனிமையான முடிவு. குறைந்தது 800 எழுத்துகள்.`,

    night: `தமிழிலேயே மட்டும் எழுதவும். இரவு பைக் ஓட்டுபவர்களுக்கு அமைதியான பேச்சு. நாளின் சிந்தனை, நல்ல ஓய்வு வாழ்த்து. குறைந்தது 800 எழுத்துகள்.`,
  },

  // ── News promp

  // ── News prompts by segment index ────────────────────────────────────────
  NEWS_CATEGORIES: [
    'இந்திய அரசியல், PM Modi, Parliament, State governments',     // seg 0
    'உலக செய்திகள், போர், USA, China, Middle East, Europe, UN',  // seg 1
    'அறிவியல், தொழில்நுட்பம், AI, Space, ISRO, Tech startups',   // seg 2
    'இந்திய பொருளாதாரம், Stock market, Infrastructure, Business', // seg 3
    'Tamil/Bollywood சினிமா, OTT, Celebrities, Entertainment',    // seg 4
    'விளையாட்டு செய்திகள் - Cricket, Football, Tennis, Chess',   // seg 5 (SPORTS ONLY)
  ],

  LOCAL_NEWS_CATEGORIES: [
    'தமிழ்நாடு அரசியல், CM, DMK, AIADMK, Government schemes',    // seg 0
    'Chennai city news, Traffic, Development, Local events',        // seg 1
    'Tamil cinema, Kollywood, Actor news, Movie releases',          // seg 2
    'Tamil Nadu sports, விளையாட்டு செய்திகள்',                    // seg 3 (SPORTS)
  ],
};