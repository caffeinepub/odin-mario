/* Synthesized sound effects using Web Audio API — no external files needed */

function ctx() {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

export function playJump() {
  try {
    const ac = ctx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(280, ac.currentTime);
    osc.frequency.linearRampToValueAtTime(560, ac.currentTime + 0.12);
    gain.gain.setValueAtTime(0.28, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.18);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.18);
    osc.onended = () => ac.close();
  } catch {}
}

export function playCoin() {
  try {
    const ac = ctx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ac.currentTime);
    osc.frequency.setValueAtTime(1100, ac.currentTime + 0.06);
    gain.gain.setValueAtTime(0.22, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.12);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.12);
    osc.onended = () => ac.close();
  } catch {}
}

export function playHit() {
  try {
    const ac = ctx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(160, ac.currentTime);
    osc.frequency.linearRampToValueAtTime(60, ac.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.15);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.15);
    osc.onended = () => ac.close();
  } catch {}
}

export function playGameOver() {
  try {
    const ac = ctx();
    if (!ac) return;
    const notes = [440, 370, 330, 220];
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "square";
      const t = ac.currentTime + i * 0.18;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.16);
      osc.start(t);
      osc.stop(t + 0.16);
      if (i === notes.length - 1) osc.onended = () => ac.close();
    });
  } catch {}
}

export function playShoot() {
  try {
    const ac = ctx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(600, ac.currentTime);
    osc.frequency.linearRampToValueAtTime(200, ac.currentTime + 0.08);
    gain.gain.setValueAtTime(0.18, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.08);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.08);
    osc.onended = () => ac.close();
  } catch {}
}

export function playEnemyDie() {
  try {
    const ac = ctx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(500, ac.currentTime);
    osc.frequency.linearRampToValueAtTime(100, ac.currentTime + 0.14);
    gain.gain.setValueAtTime(0.25, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.18);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.18);
    osc.onended = () => ac.close();
  } catch {}
}

export function playPowerUp() {
  try {
    const ac = ctx();
    if (!ac) return;
    const notes = [330, 440, 550, 660, 880];
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "sine";
      const t = ac.currentTime + i * 0.07;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.08);
      osc.start(t);
      osc.stop(t + 0.08);
      if (i === notes.length - 1) osc.onended = () => ac.close();
    });
  } catch {}
}

export function playBossHit() {
  try {
    const ac = ctx();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(100, ac.currentTime);
    osc.frequency.linearRampToValueAtTime(40, ac.currentTime + 0.2);
    gain.gain.setValueAtTime(0.35, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.25);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.25);
    osc.onended = () => ac.close();
  } catch {}
}
