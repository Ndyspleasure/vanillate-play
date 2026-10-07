import { MotionSession } from '../core/session/MotionSession';
import { AudioEngine } from '../engine/audio';
import { settings, type Settings } from '../storage/settings';
import { Router } from './router';

/** Application singletons. The motion session lives for the whole visit (camera stays on across games). */
export const app = {
  session: new MotionSession(),
  audio: new AudioEngine(),
  router: new Router(),
};

function apply(s: Settings): void {
  app.session.setSensitivity(s.sensitivity);
  app.session.setQuality(s.trackingQuality);
  app.audio.setVolumes(s.sfxVolume, s.musicVolume);
  document.documentElement.lang = s.lang;
  document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
}

apply(settings.get());
settings.subscribe(apply);
