// Asetukset ja rajatut alueet. Pienet arvot, joten localStorage riittää.

const KEY = 'sprint30.settings.v1';

export const defaults = {
  finishGuardSeconds: 3.0,   // maalialue alkaa tunnistaa vasta tämän jälkeen
  maxRunSeconds: 20,         // mittaus keskeytyy itsestään tämän jälkeen
  pixelThreshold: 18,        // yksittäisen pikselin muutoskynnys 0..255
  areaThreshold: 0.06,       // muuttuneiden pikselien vähimmäisosuus
  backgroundAdapt: 0.02,     // taustan mukautumiskerroin ruutua kohden
  settleSeconds: 1.5,        // taustan opetteluaika virityksen jälkeen
  recordVideo: true,
  sound: true,
  vibrate: true,
  roiStart: null,            // {x,y,w,h} normalisoituna 0..1
  roiFinish: null,
  lastAthleteId: null
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

export const settings = Object.assign({}, defaults, load());

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (err) {
    // Tallennustila voi olla täynnä tai estetty. Sovellus toimii silti.
  }
}

export function resetSettings() {
  const keepRoiStart = settings.roiStart;
  const keepRoiFinish = settings.roiFinish;
  const keepAthlete = settings.lastAthleteId;
  Object.assign(settings, defaults, {
    roiStart: keepRoiStart,
    roiFinish: keepRoiFinish,
    lastAthleteId: keepAthlete
  });
  saveSettings();
}
