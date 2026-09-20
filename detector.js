// Liiketunnistin yhdelle rajatulle alueelle (ROI).
//
// Periaate: alue piirretään pienelle apukankaalle, muunnetaan harmaasävyksi ja
// normalisoidaan vähentämällä alueen oma keskikirkkaus. Normalisointi poistaa
// koko alueen yhteiset kirkkausmuutokset, joita syntyy kun kameran automaattinen
// valotus säätyy tai pilvi liikkuu auringon eteen. Niistä ei siis tule liikettä.
//
// Vertailukuva (tausta) on hidas liukuva keskiarvo, joten teline- ja valodriftti
// sulautuu taustaan, mutta nopea liike erottuu.

export class RoiDetector {
  /**
   * @param {number} width  apukankaan leveys pikseleinä
   * @param {number} height apukankaan korkeus pikseleinä
   */
  constructor(width = 48, height = 64) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.roi = null;
    this.reset();
  }

  /** Nollaa taustamallin. Kutsutaan aina kun aluetta muutetaan tai viritetään uudelleen. */
  reset() {
    this.background = null;
    this.frames = 0;
    this.score = 0;
  }

  /** @param {{x:number,y:number,w:number,h:number}|null} roi normalisoidut koordinaatit 0..1 */
  setRoi(roi) {
    this.roi = roi;
    this.reset();
  }

  /** Taustamalli on uskottava vasta kun ruutuja on kertynyt tarpeeksi. */
  get isReady() {
    return this.background !== null && this.frames >= 12;
  }

  /** Lukee alueen nykyisen sisällön normalisoituna harmaasävynä. */
  _sample(video) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || !this.roi) return null;

    const sx = Math.max(0, Math.round(this.roi.x * vw));
    const sy = Math.max(0, Math.round(this.roi.y * vh));
    const sw = Math.max(2, Math.min(vw - sx, Math.round(this.roi.w * vw)));
    const sh = Math.max(2, Math.min(vh - sy, Math.round(this.roi.h * vh)));

    this.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, this.width, this.height);
    const data = this.ctx.getImageData(0, 0, this.width, this.height).data;

    const n = this.width * this.height;
    const out = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      // Rec. 601 -painot: vastaa silmän herkkyyttä riittävän hyvin.
      const gray = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      out[i] = gray;
      sum += gray;
    }
    const mean = sum / n;
    for (let i = 0; i < n; i++) out[i] -= mean;
    return out;
  }

  /**
   * Päivittää tunnistimen yhdellä ruudulla.
   * @param {HTMLVideoElement} video
   * @param {number} pixelThreshold yksittäisen pikselin muutoskynnys (0..255)
   * @param {number} adapt taustan mukautumiskerroin (0..1)
   * @returns {number} muuttuneiden pikselien osuus 0..1
   */
  update(video, pixelThreshold, adapt) {
    const sample = this._sample(video);
    if (!sample) {
      this.score = 0;
      return 0;
    }

    this.frames++;

    if (this.background === null) {
      this.background = sample;
      this.score = 0;
      return 0;
    }

    const bg = this.background;
    const n = sample.length;
    let changed = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(sample[i] - bg[i]) > pixelThreshold) changed++;
    }
    this.score = changed / n;

    for (let i = 0; i < n; i++) {
      bg[i] += (sample[i] - bg[i]) * adapt;
    }

    return this.score;
  }
}

/**
 * Nouseva reuna kahden peräkkäisen ruudun vahvistuksella.
 *
 * Aika luetaan parin ENSIMMÄISESTÄ ruudusta, joten vahvistus ei siirrä tulosta.
 * Koska sekä lähtö että maali käyttävät samaa sääntöä, mahdollinen jäljelle jäävä
 * viive on molemmissa sama ja kumoutuu vähennyslaskussa.
 */
export class EdgeTrigger {
  constructor(confirmFrames = 2) {
    this.confirmFrames = confirmFrames;
    this.reset();
  }

  reset() {
    this.pendingTime = null;
    this.count = 0;
  }

  /**
   * @param {number} score nykyisen ruudun pistemäärä
   * @param {number} threshold laukaisukynnys
   * @param {number} time ruudun aikaleima sekunteina
   * @returns {number|null} liipaisuhetki sekunteina tai null
   */
  feed(score, threshold, time) {
    if (score > threshold) {
      if (this.pendingTime === null) {
        this.pendingTime = time;
        this.count = 1;
      } else {
        this.count++;
      }
      if (this.count >= this.confirmFrames) {
        const at = this.pendingTime;
        this.reset();
        return at;
      }
      return null;
    }
    this.reset();
    return null;
  }
}
