const Astronomy = require('astronomy-engine');

const now = new Date();
const adate = new Astronomy.AstroTime(now);

const illum = Astronomy.Illumination(Astronomy.Body.Moon, adate);
console.log('Illumination:', illum);

const phase = Astronomy.MoonPhase(adate);
console.log('MoonPhase:', phase);
