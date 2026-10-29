// Optional real-Web-Audio/playback regression harness. Run, then open localhost:4319.
// Uses temporary local assets; never writes to Supabase or publishes a Board post.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'board-voice-'));
const modules = {};
function bundle(file) {
  const id = path.relative(root, file).replaceAll('\\', '/');
  if (modules[id]) return id;
  modules[id] = ' '; // break circular imports
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText.replace(/require\("([^"\n]+)"\)/g, (_, name) => {
    const target = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
    return `require(${JSON.stringify(bundle(target + '.ts'))})`;
  });
  modules[id] = js;
  return id;
}
const mix = bundle(path.join(root, 'lib/board/audioSession/mixdown.ts'));
const session = bundle(path.join(root, 'lib/board/audioSession/session.ts'));
const client = `
const cache = {}, modules = {${Object.entries(modules).map(([id, code]) => `${JSON.stringify(id)}:function(module,exports,require){${code}\n}`).join(',')}};
function require(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}
const {renderSessionFile} = require(${JSON.stringify(mix)});
const {createAudioSession,createTrackFromFile} = require(${JSON.stringify(session)});
const log = message => document.querySelector('pre').textContent += message+'\\n';
const assert=(value,message)=>{if(!value)throw new Error(message);};
function fixture(ctx, seconds, preset, kind='vocal') {
 const b=ctx.createBuffer(1, seconds*8000, 8000), d=b.getChannelData(0);
 for(let i=0;i<d.length;i++)d[i]=Math.sin(2*Math.PI*220*i/8000)*0.2;
 const t=createTrackFromFile(kind,new File(['fixture'],kind+'.wav',{type:'audio/wav'}),{preset,volume:1});
 t.clips[0].decoded=b; return {...createAudioSession(),tracks:[t]};
}
const waitEvent=(el,event)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(new Error(event+' timed out')),10000);
 el.addEventListener(event,()=>{clearTimeout(timer);resolve();},{once:true});
});
document.querySelector('button').onclick=async()=>{
 document.querySelector('button').disabled=true;
 try {
 const ctx=new AudioContext(); await ctx.resume();
 log('Rendering 15-minute vocal with Clean preset using real Web Audio...');
 const voice=await renderSessionFile(fixture(ctx,900,'clean'),ctx);
 const decoded=await ctx.decodeAudioData(await voice.arrayBuffer());
 assert(Math.abs(decoded.duration-900)<0.01,'15-minute effect render duration');
 assert(decoded.getChannelData(0).slice(-8000).some(v=>Math.abs(v)>0.01),'vocal tail lost');
 log('PASS: 15-minute vocal effects export; final audio samples present');
 log('Rendering 5-minute instrumental without vocals...');
 const beat=await renderSessionFile(fixture(ctx,300,'none','instrumental'),ctx);
 const r=await fetch('/asset.wav',{method:'POST',body:beat}); assert(r.ok,'asset write');
 const audio=document.querySelector('audio');
 let loaded=waitEvent(audio,'loadedmetadata'); audio.src='/asset.wav';audio.load();await loaded;
 assert(Math.abs(audio.duration-300)<0.01,'served URL duration');
 let seeked=waitEvent(audio,'seeked');audio.currentTime=298;await seeked;
 await audio.play(); await new Promise(r=>setTimeout(r,150)); audio.pause();
 assert(audio.currentTime>=298,'seek after old cutoff'); const paused=audio.currentTime;
 await audio.play(); await new Promise(r=>setTimeout(r,150)); audio.pause();assert(audio.currentTime>paused,'resume');
 seeked=waitEvent(audio,'seeked');audio.currentTime=299.8;await seeked;
 const ended=waitEvent(audio,'ended');await audio.play();await ended;
 assert(audio.ended,'end playback');
 loaded=waitEvent(audio,'loadedmetadata');audio.load();await loaded;assert(audio.duration===300,'reload metadata');
 log('PASS: served audio URL duration 300s; seek past 2m; pause/resume; end; reload');
 const wet=await renderSessionFile(fixture(ctx,32,'reverb','instrumental'),ctx);
 const wetBuffer=await ctx.decodeAudioData(await wet.arrayBuffer());
 const data=wetBuffer.getChannelData(0); const rate=wetBuffer.sampleRate;
 for(const seconds of [10,20,30]) {const i=seconds*rate;assert(Math.abs(data[i]-data[i-1])<0.15,'effect block seam');}
 log('PASS: instrumental Reverb effects and 10s block continuity');
 const knobs=fixture(ctx,2,'distorted','instrumental');
 knobs.tracks[0].mix.alteration={intensity:0,distortion:0};
 const low=await ctx.decodeAudioData(await (await renderSessionFile(knobs,ctx)).arrayBuffer());
 knobs.tracks[0].mix.alteration={intensity:1,distortion:1};
 const high=await ctx.decodeAudioData(await (await renderSessionFile(knobs,ctx)).arrayBuffer());
 let difference=0;for(let i=0;i<low.length;i++)difference+=Math.abs(low.getChannelData(0)[i]-high.getChannelData(0)[i]);
 assert(difference>1,'effect controls must change rendered audio');
 log('PASS: effect intensity and distortion controls change exported audio');
 await ctx.close();log('ALL BROWSER CHECKS PASSED');
 }catch(e){log('FAIL: '+e.message);console.error(e);}
};`;
http.createServer(async (req,res) => {
  if (req.url === '/asset.wav' && req.method === 'POST') {
    const out=fs.createWriteStream(path.join(temp,'asset.wav'));req.pipe(out);out.on('finish',()=>res.end('ok'));return;
  }
  if (req.url === '/asset.wav') {
    const file=path.join(temp,'asset.wav'), size=fs.statSync(file).size;
    const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const start=range?Number(range[1]):0,end=range&&range[2]?Number(range[2]):size-1;
    res.writeHead(range?206:200,{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
    fs.createReadStream(file,{start,end}).pipe(res);return;
  }
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(client);return;}
  res.setHeader('Content-Type','text/html');
  res.end('<!doctype html><title>Board Voice Studio browser checks</title><h1>Voice Studio browser checks</h1><p>Local synthetic audio only. No microphone or Supabase access.</p><button>Run browser audio checks</button><pre></pre><audio controls></audio><script src="/bundle.js"></script>');
}).listen(4319,'127.0.0.1',()=>console.log('Voice checks: http://127.0.0.1:4319'));
