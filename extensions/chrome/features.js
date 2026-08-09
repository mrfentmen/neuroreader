(function (root) {
  "use strict";
  var RAINBOW = ["#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#9333ea"];
  var DEFAULTS = { gradient:false, complexity:false, sentence:false, progress:false, spotlight:false, motion:false, contrast:false, rainbowWords:false, ruler:false, rulerSize:6, rulerDim:28, rulerLock:false, color:"#dc2626", profile:"custom", focus:false, blueLight:false, eyeRest:false };
  function normalize(value) {
    var input = value || {}, out = {};
    Object.keys(DEFAULTS).forEach(function (key) { out[key] = input[key] === undefined ? DEFAULTS[key] : input[key]; });
    if (!/^#[0-9a-f]{6}$/i.test(String(out.color))) out.color = DEFAULTS.color;
    out.rulerSize = Math.max(2, Math.min(14, Number(out.rulerSize) || DEFAULTS.rulerSize));
    out.rulerLock = out.rulerLock === true;
    var rulerDim = Number(out.rulerDim);
    out.rulerDim = isFinite(rulerDim) ? Math.max(0, Math.min(70, rulerDim)) : DEFAULTS.rulerDim;
    if (["custom", "adhd", "dyslexia", "autism"].indexOf(String(out.profile)) === -1) out.profile = DEFAULTS.profile;
    if (out.profile === "adhd") {
      out.gradient = false; out.complexity = false; out.sentence = false; out.progress = true;
      out.spotlight = true; out.motion = false; out.contrast = false; out.rainbowWords = false;
    }
    if (out.profile === "dyslexia") {
      out.gradient = true; out.complexity = false; out.sentence = true; out.progress = false;
      out.spotlight = false; out.motion = false; out.contrast = true; out.rainbowWords = false;
    }
    if (out.profile === "autism") {
      out.gradient = false; out.complexity = false; out.sentence = false; out.progress = false;
      out.spotlight = false; out.motion = true; out.contrast = true; out.rainbowWords = false;
    }
    return out;
  }
  function rgb(hex) { var h = String(hex).replace(/^#/,''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
  function mix(color, amount) { var c=rgb(color); return "#"+c.map(function(v){return Math.round(v+(255-v)*amount).toString(16).padStart(2,"0");}).join(""); }
  function plain(value) { return String(value||"").replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
  function wordChar(value) { return /[\p{L}\p{N}]/u.test(value||""); }
  function decorateHtml(html, raw) {
    var opt=normalize(raw), state={first:true,index:0};
    if (!opt.gradient && !opt.complexity && !opt.sentence && !opt.rainbowWords) return html;
    return String(html||"").split(/(\s+)/).map(function(token){
      if (/^\s+$/.test(token)) return token;
      var text=plain(token), length=Array.from(text).filter(wordChar).length;
      if (!length) { if (/[.!?]/.test(text)) state.first=true; return token; }
      var last=/[.!?](?:[^\p{L}\p{N}]*)$/u.test(text), base=opt.color;
      if (opt.sentence) base=state.first?"#16a34a":last?"#2563eb":base;
      if (opt.complexity && !opt.sentence) base=length<=4?base:length<=8?"#2563eb":length<=14?"#16a34a":RAINBOW[state.index%RAINBOW.length];
      if (opt.rainbowWords) base=RAINBOW[state.index%RAINBOW.length];
      var word=state.index++, fixation=0;
      var out=token.replace(/<b(?:\s[^>]*)?>[\s\S]*?<\/b>/gi,function(full){
        var inner=full.replace(/^<b(?:\s[^>]*)?>|<\/b>$/gi,"");
        if (!wordChar(plain(inner))) return full;
        var color=(length>=15&&(opt.complexity||opt.gradient))?RAINBOW[(word+fixation)%RAINBOW.length]:base;
        var style="--nr-feature-color:"+color+";color:"+color+";";
        if (opt.gradient && length<15) style+="background:linear-gradient(90deg,"+color+","+mix(base,.72)+");-webkit-background-clip:text;background-clip:text;color:transparent;";
        fixation++;
        return '<b data-nr-fixation="1" data-nr-gradient="'+((opt.gradient && length<15)?"1":"0")+'" data-nr-word="'+word+'" data-nr-length="'+length+'" style="'+style+'">'+inner+'</b>';
      });
      state.first=last;
      return out;
    }).join("");
  }
  root.NeuroReaderFeatures={DEFAULTS:DEFAULTS,normalize:normalize,decorateHtml:decorateHtml,colors:{rainbow:RAINBOW}};
})(typeof window!=="undefined"?window:globalThis);
