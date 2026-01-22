/**
 * PS1-style sound generator using Web Audio API
 * 
 * These are simple synthesized sounds inspired by PS1 era UI sounds:
 * - Warning: A two-tone ascending beep
 * - Timeout: A dramatic descending chime sequence
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play a PS1-style warning sound (ascending two-tone beep)
 */
export function playWarningSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Create oscillator for first tone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "square";
    osc1.frequency.setValueAtTime(440, now); // A4
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Create oscillator for second tone (higher)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "square";
    osc2.frequency.setValueAtTime(554.37, now + 0.12); // C#5
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.3);
  } catch {
    // Audio context may not be available
  }
}

/**
 * Play a PS1-style timeout sound (dramatic descending chime sequence)
 */
export function playTimeoutSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Sequence of descending notes
    const notes = [
      { freq: 880, time: 0, duration: 0.2 },      // A5
      { freq: 659.25, time: 0.15, duration: 0.2 }, // E5
      { freq: 554.37, time: 0.3, duration: 0.2 },  // C#5
      { freq: 440, time: 0.45, duration: 0.4 },    // A4 (longer)
    ];

    notes.forEach(({ freq, time, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Triangle wave for a softer, more musical tone
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + time);
      
      // Envelope
      gain.gain.setValueAtTime(0, now + time);
      gain.gain.linearRampToValueAtTime(0.2, now + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + time + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + time);
      osc.stop(now + time + duration);
    });

    // Add a subtle low bass note for impact
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = "sine";
    bass.frequency.setValueAtTime(110, now + 0.45); // A2
    bassGain.gain.setValueAtTime(0.1, now + 0.45);
    bassGain.gain.exponentialRampToValueAtTime(0.01, now + 1);
    bass.connect(bassGain);
    bassGain.connect(ctx.destination);
    bass.start(now + 0.45);
    bass.stop(now + 1);
  } catch {
    // Audio context may not be available
  }
}

/**
 * Resume audio context (required after user interaction)
 */
export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}
