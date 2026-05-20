let audioContext: AudioContext | null = null;

export const initAudioContext = () => {
  if (!audioContext) {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
};

const playNote = (context: AudioContext, freq: number, startTime: number, duration: number, waveType: OscillatorType = 'sine') => {
  const osc = context.createOscillator();
  const g = context.createGain();
  osc.type = waveType;
  osc.frequency.setValueAtTime(freq, startTime);
  g.gain.setValueAtTime(0, startTime);
  g.gain.linearRampToValueAtTime(0.8, startTime + 0.05);
  g.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
  osc.connect(g);
  g.connect(context.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
};

export const playSound = (type: 'ok' | 'ng' | 'add') => {
  try {
    initAudioContext();
    if (!audioContext) return;

    if (type === 'ok') {
      // Rising positive chime
      playNote(audioContext, 659.25, audioContext.currentTime, 0.2, 'triangle'); // E5
      playNote(audioContext, 880, audioContext.currentTime + 0.07, 0.3, 'triangle'); // A5
    } else if (type === 'add') {
      // Pleasant double success chime for adding to report
      playNote(audioContext, 523.25, audioContext.currentTime, 0.1, 'sine'); // C5
      playNote(audioContext, 783.99, audioContext.currentTime + 0.08, 0.25, 'sine'); // G5
    } else {
      // Professional Error buzz
      playNote(audioContext, 150, audioContext.currentTime, 0.3, 'sawtooth');
      playNote(audioContext, 110, audioContext.currentTime + 0.05, 0.3, 'sawtooth');
    }
  } catch (e) {
    console.error('Audio error:', e);
  }
};
