// services/ssmlHelper.ts
// Adds emotion and expression to Jay's voice using SSML

export type MessageType = 
  | 'greeting'    // happy, excited
  | 'alert'       // urgent, serious  
  | 'warning'     // firm but friendly
  | 'info'        // calm, helpful
  | 'casual'      // relaxed, cheerful
  | 'emergency';  // urgent, alarming

interface SsmlOptions {
  type: MessageType;
  lang: string;
}

// ── Detect message type from content ────────────────────────────────────────
export const detectMessageType = (text: string): MessageType => {
  const lower = text.toLowerCase();
  
  // Emergency keywords
  if (/emergency|police|hospital|accident|code red|danger|help me/i.test(lower))
    return 'emergency';
  
  // Speed/safety alerts
  if (/slow down|too fast|kmph|speed|motoGP|race track/i.test(lower))
    return 'warning';
    
  // Off route / navigation alerts  
  if (/off route|went off|check on|alert|careful/i.test(lower))
    return 'alert';
    
  // Greetings
  if (/woah|hey hey|welcome|let's ride|epic ride|in the house/i.test(lower))
    return 'greeting';
    
  // Info/helpful
  if (/found|nearby|km away|mechanic|station|hospital|turn left|right/i.test(lower))
    return 'info';
    
  return 'casual';
};

// ── Build SSML with emotion ──────────────────────────────────────────────────
export const toSsml = (text: string, options: SsmlOptions): string => {
  const { type } = options;
  
  // Clean text for SSML — escape special chars
  const clean = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/kmph/gi, '<sub alias="kilometres per hour">kmph</sub>')
    .replace(/km\b/gi, '<sub alias="kilometres">km</sub>')
    .replace(/NH(\d+)/gi, '<sub alias="National Highway $1">NH$1</sub>');

  switch (type) {
    case 'greeting':
      // Fast, high energy, excited
      return `<speak>
        <prosody rate="fast" pitch="+4st" volume="loud">
          ${addEmphasis(clean, ['Woah', 'Hey', 'Ayyo', 'Jay', 'epic', 'best'])}
        </prosody>
      </speak>`;

    case 'warning':
      // Start urgent, slow down for the warning
      return `<speak>
        <prosody rate="medium" pitch="+2st">
          <emphasis level="strong">
            ${addBreaks(clean, ['!', ','])}
          </emphasis>
        </prosody>
      </speak>`;

    case 'emergency':
      // Slow, clear, serious — every word must be heard
      return `<speak>
        <prosody rate="slow" pitch="-1st" volume="x-loud">
          <emphasis level="strong">
            ${addBreaks(clean, ['!', ',', '.'])}
          </emphasis>
        </prosody>
      </speak>`;

    case 'alert':
      // Medium pace, slightly urgent
      return `<speak>
        <prosody rate="medium" pitch="+1st">
          <break time="200ms"/>
          ${addBreaks(clean, ['!', ','])}
          <break time="300ms"/>
        </prosody>
      </speak>`;

    case 'info':
      // Calm, clear, helpful
      return `<speak>
        <prosody rate="medium" pitch="0st">
          ${addBreaks(clean, [',', '.'])}
        </prosody>
      </speak>`;

    case 'casual':
    default:
      // Relaxed, cheerful, natural
      return `<speak>
        <prosody rate="medium" pitch="+2st">
          ${addBreaks(clean, [',', '—'])}
        </prosody>
      </speak>`;
  }
};

// ── Add emphasis to key words ────────────────────────────────────────────────
const addEmphasis = (text: string, words: string[]): string => {
  let result = text;
  words.forEach(word => {
    const regex = new RegExp(`\\b(${word})\\b`, 'gi');
    result = result.replace(regex, '<emphasis level="strong">$1</emphasis>');
  });
  return result;
};

// ── Add natural pauses after punctuation ────────────────────────────────────
const addBreaks = (text: string, punctuation: string[]): string => {
  let result = text;
  const breakMap: Record<string, string> = {
    '!': '! <break time="200ms"/>',
    ',': ', <break time="150ms"/>',
    '.': '. <break time="300ms"/>',
    '—': '— <break time="200ms"/>',
  };
  punctuation.forEach(p => {
    if (breakMap[p]) {
      result = result.replace(new RegExp(`\\${p}`, 'g'), breakMap[p]);
    }
  });
  return result;
};

// ── Tamil/Hindi specific improvements ───────────────────────────────────────
export const improveIndianPronunciation = (text: string, lang: string): string => {
  if (lang === 'en-IN') {
    return text
      .replace(/\bda\b/g, 'daa')        // Tamil "da" — elongate
      .replace(/\bmachan\b/gi, 'machaan') // Tamil "machan"
      .replace(/\bbro\b/gi, 'broo')      // elongate for energy
      .replace(/\bWoah\b/gi, 'Woaah')    // more expressive
      .replace(/\bAyyo\b/gi, 'Aiyyo');   // Tamil exclamation
  }
  return text;
};
