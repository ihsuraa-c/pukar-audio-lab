(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const els = {
    fileInput:$("fileInput"),dropzone:$("dropzone"),browse:$("browseButton"),error:$("errorMessage"),
    fileName:$("fileName"),fileMeta:$("fileMeta"),recordState:$("recordState"),processing:$("processingLabel"),progress:$("processProgress"),
    duration:$("durationStat"),rate:$("sampleRateStat"),peak:$("peakStat"),rms:$("rmsStat"),
    wave:$("waveformCanvas"),spec:$("spectrogramCanvas"),spectrum:$("spectrumCanvas"),
    waveEmpty:$("waveEmpty"),specEmpty:$("specEmpty"),spectrumEmpty:$("spectrumEmpty"),
    play:$("playButton"),seek:$("seekBar"),playTime:$("playTime"),
    centroid:$("centroidStat"),bandwidth:$("bandwidthStat"),peakList:$("peakList"),
    scale:$("frequencyScale"),maxFreq:$("maxFrequency")
  };
  let audioContext=null,decoded=null,objectUrl=null,playing=false,raf=0,analysis=null,loadToken=0;
  const audio=new Audio(); audio.preload="metadata";
  const fmt=s=>{s=Math.max(0,Math.floor(s||0));return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")};
  const setError=t=>{els.error.textContent=t||""};
  const setProgress=(n,label)=>{els.progress.style.width=n+"%";els.processing.textContent=label};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

  function canvasSetup(canvas){
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(1,rect.width),h=Math.max(1,rect.height);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    const c=canvas.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);
    return {c,w,h};
  }
  function drawGrid(c,w,h,left=38,bottomPad=20){
    c.clearRect(0,0,w,h);c.fillStyle="#f7f9fc";c.fillRect(0,0,w,h);
    c.strokeStyle="#e6ebf2";c.lineWidth=1;
    for(let i=0;i<=4;i++){let y=9+(h-30)*i/4;c.beginPath();c.moveTo(left,y);c.lineTo(w-8,y);c.stroke()}
    for(let i=0;i<=8;i++){let x=left+(w-left-8)*i/8;c.beginPath();c.moveTo(x,9);c.lineTo(x,h-bottomPad);c.stroke()}
  }
  function drawWave(){
    const {c,w,h}=canvasSetup(els.wave);drawGrid(c,w,h);
    if(!decoded)return;
    const data=mono(),left=38,top=9,bottom=h-20,mid=(top+bottom)/2,plotW=w-left-8,plotH=bottom-top;
    c.strokeStyle="#183f91";c.lineWidth=1;c.beginPath();c.moveTo(left,mid);c.lineTo(w-8,mid);c.stroke();
    const samplesPerPixel=Math.max(1,Math.floor(data.length/plotW));
    c.strokeStyle="#2457ad";c.lineWidth=1.2;c.beginPath();
    for(let x=0;x<plotW;x++){
      const a=x*samplesPerPixel,b=Math.min(data.length,a+samplesPerPixel);let lo=1,hi=-1;
      for(let j=a;j<b;j++){lo=Math.min(lo,data[j]);hi=Math.max(hi,data[j])}
      c.moveTo(left+x,mid-hi*plotH*.46);c.lineTo(left+x,mid-lo*plotH*.46);
    }c.stroke();
    c.fillStyle="#8392a9";c.font="9px DM Mono, monospace";c.fillText("+1",7,15);c.fillText("0",17,mid+3);c.fillText("-1",10,bottom);
  }
  function mono(){
    const n=decoded.length,out=new Float32Array(n);
    for(let ch=0;ch<decoded.numberOfChannels;ch++){const d=decoded.getChannelData(ch);for(let i=0;i<n;i++)out[i]+=d[i]/decoded.numberOfChannels}
    return out;
  }
  function fft(re,im){
    const n=re.length;
    for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]]}}
    for(let len=2;len<=n;len*=2){const angle=-2*Math.PI/len,wr0=Math.cos(angle),wi0=Math.sin(angle);
      for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const u=i+j,v=i+j+len/2,tr=wr*re[v]-wi*im[v],ti=wr*im[v]+wi*re[v];re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;const next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next}}
    }
  }
  async function calculate(data,sr,token){
    const N=2048,hop=512,bins=N/2,window=new Float32Array(N);
    for(let i=0;i<N;i++)window[i]=.5-.5*Math.cos(2*Math.PI*i/(N-1));
    const count=Math.max(1,Math.ceil(Math.max(0,data.length-N)/hop)+1),frames=[],sum=new Float64Array(bins);
    for(let frame=0;frame<count;frame++){
      if(token!==loadToken)throw new Error("Analysis superseded.");
      const start=frame*hop,re=new Float64Array(N),im=new Float64Array(N);
      for(let i=0;i<N;i++)re[i]=(data[start+i]||0)*window[i];
      fft(re,im);const mag=new Float32Array(bins);
      for(let k=0;k<bins;k++){mag[k]=Math.hypot(re[k],im[k]);sum[k]+=mag[k]}
      frames.push(mag);
      if(frame%24===0){setProgress(30+Math.round(50*frame/count),"ANALYSING FFT");await new Promise(r=>setTimeout(r,0))}
    }
    const avg=new Float64Array(bins);for(let k=0;k<bins;k++)avg[k]=sum[k]/frames.length;
    let total=0,weighted=0;
    for(let k=1;k<bins;k++){const f=k*sr/N;total+=avg[k];weighted+=f*avg[k]}
    const centroid=total?weighted/total:0;let variance=0;
    for(let k=1;k<bins;k++)variance+=avg[k]*Math.pow(k*sr/N-centroid,2);
    const bandwidth=total?Math.sqrt(variance/total):0;
    const candidates=[];
    for(let k=2;k<bins-1;k++)if(avg[k]>avg[k-1]&&avg[k]>=avg[k+1]&&avg[k]>0)candidates.push({k,f:k*sr/N,a:avg[k]});
    candidates.sort((a,b)=>b.a-a.a);const selected=[];
    for(const p of candidates){if(selected.every(q=>Math.abs(q.f-p.f)>Math.max(18,3*sr/N)))selected.push(p);if(selected.length>=8)break}
    return {frames,avg,centroid,bandwidth,selected,N,hop,bins,sr};
  }
  function colour(t){
    const stops=[[0,[19,48,111]],[.23,[39,87,174]],[.48,[48,143,199]],[.69,[126,204,180]],[.86,[246,210,91]],[1,[238,91,75]]];
    for(let i=1;i<stops.length;i++)if(t<=stops[i][0]){const a=stops[i-1],b=stops[i],f=(t-a[0])/(b[0]-a[0]);return a[1].map((v,j)=>Math.round(v+(b[1][j]-v)*f))}
    return stops[stops.length-1][1];
  }
  function drawSpectrogram(){
    const {c,w,h}=canvasSetup(els.spec);c.fillStyle="#f7f9fc";c.fillRect(0,0,w,h);if(!analysis)return;
    const left=43,top=9,right=w-8,bottom=h-25,pw=right-left,ph=bottom-top;
    const nyq=decoded.sampleRate/2,max=Math.min(els.maxFreq.value==="nyquist"?nyq:Number(els.maxFreq.value),nyq),log=els.scale.value==="log";
    const frames=analysis.frames,bins=analysis.bins,step=decoded.sampleRate/analysis.N;
    let maxDb=-120;for(const frame of frames)for(let k=1;k<bins;k++)maxDb=Math.max(maxDb,20*Math.log10(frame[k]+1e-9));
    const iw=Math.max(1,Math.floor(pw)),ih=Math.max(1,Math.floor(ph)),img=c.createImageData(iw,ih);
    for(let x=0;x<iw;x++){
      const frame=frames[Math.min(frames.length-1,Math.floor(x/iw*frames.length))];
      for(let y=0;y<ih;y++){
        const ratio=1-y/ih,f=log?Math.expm1(ratio*Math.log1p(max)):ratio*max,k=clamp(Math.round(f/step),0,bins-1);
        const db=20*Math.log10(frame[k]+1e-9),v=clamp((db-(maxDb-68))/68,0,1),col=colour(Math.pow(v,.88)),idx=(y*iw+x)*4;
        img.data[idx]=col[0];img.data[idx+1]=col[1];img.data[idx+2]=col[2];img.data[idx+3]=255;
      }
    }
    const temp=document.createElement("canvas");temp.width=iw;temp.height=ih;temp.getContext("2d").putImageData(img,0,0);c.drawImage(temp,left,top,pw,ph);
    c.strokeStyle="#ffffff99";c.fillStyle="#657995";c.font="9px DM Mono, monospace";
    for(let i=0;i<=4;i++){const f=max*i/4,y=bottom-(log?Math.log1p(f)/Math.log1p(max):f/max)*ph;c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();c.fillText(f>=1000?(f/1000).toFixed(f%1000?1:0)+"k":Math.round(f),4,y+3)}
    for(let i=0;i<=4;i++){const x=left+pw*i/4;c.beginPath();c.moveTo(x,top);c.lineTo(x,bottom);c.stroke();c.fillText(fmt(decoded.duration*i/4),x-12,h-7)}
  }
  function drawSpectrum(){
    const {c,w,h}=canvasSetup(els.spectrum);drawGrid(c,w,h);if(!analysis)return;
    const left=38,right=w-8,top=9,bottom=h-20,pw=right-left,ph=bottom-top,maxHz=Math.min(10000,decoded.sampleRate/2),binHz=decoded.sampleRate/analysis.N;
    const max=analysis.avg.reduce((a,b)=>Math.max(a,b),0)||1;
    c.beginPath();c.moveTo(left,bottom);
    for(let x=0;x<=pw;x++){const k=Math.min(analysis.bins-1,Math.floor(x/pw*maxHz/binHz)),y=bottom-analysis.avg[k]/max*ph*.9;c.lineTo(left+x,y)}
    c.lineTo(right,bottom);c.closePath();c.fillStyle="#dce8fb";c.fill();
    c.beginPath();for(let x=0;x<=pw;x++){const k=Math.min(analysis.bins-1,Math.floor(x/pw*maxHz/binHz)),y=bottom-analysis.avg[k]/max*ph*.9;x===0?c.moveTo(left+x,y):c.lineTo(left+x,y)}
    c.strokeStyle="#214fa1";c.lineWidth=2;c.stroke();
    for(const p of analysis.selected.filter(p=>p.f<=maxHz)){const x=left+p.f/maxHz*pw,y=bottom-p.a/max*ph*.9;c.fillStyle="#ef6958";c.beginPath();c.arc(x,y,3.3,0,Math.PI*2);c.fill()}
    c.fillStyle="#8392a9";c.font="9px DM Mono, monospace";c.fillText("0",10,bottom);c.fillText("RELATIVE",4,top+4);
  }
  function renderPeaks(){
    els.peakList.innerHTML="";
    if(!analysis.selected.length){els.peakList.innerHTML='<div class="peak-empty">No clear local peaks found in this recording.</div>';return}
    analysis.selected.forEach((p,i)=>{const row=document.createElement("div");row.className="peak-row";const label=document.createElement("span"),value=document.createElement("b");label.textContent=String(i+1).padStart(2,"0")+"  PEAK";value.textContent=p.f>=1000?(p.f/1000).toFixed(2)+" kHz":p.f.toFixed(1)+" Hz";row.append(label,value);els.peakList.append(row)})
  }
  function drawAll(){drawWave();drawSpectrogram();drawSpectrum()}
  function updatePlayback(){
    if(!decoded)return;const t=audio.currentTime||0;els.seek.value=String(Math.round(t/decoded.duration*1000));els.playTime.textContent=fmt(t)+" / "+fmt(decoded.duration);
    if(playing)raf=requestAnimationFrame(updatePlayback);
  }
  async function loadFile(file){
    if(!file)return;setError("");
    if(!/\.(wav|mp3)$/i.test(file.name)){setError("That file type is not supported. Please choose a WAV or MP3 file.");return}
    if(!file.size){setError("This file is empty.");return}
    if(file.size>100*1024*1024){setError("This prototype supports files up to 100 MB.");return}
    const token=++loadToken;els.play.disabled=true;els.seek.disabled=true;setProgress(5,"READING AUDIO");
    els.recordState.textContent="PROCESSING";els.fileName.textContent=file.name;els.fileMeta.textContent=(file.size/1048576).toFixed(2)+" MB · decoding in browser";
    try{
      if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();
      if(audioContext.state==="suspended")await audioContext.resume();
      const bytes=await file.arrayBuffer();setProgress(17,"DECODING FILE");
      const result=await audioContext.decodeAudioData(bytes.slice(0));if(token!==loadToken)return;
      if(!result.length||!result.duration)throw new Error("No audio samples were decoded.");
      decoded=result;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(file);audio.src=objectUrl;audio.load();
      const data=mono();let peak=0,sum=0;for(let i=0;i<data.length;i++){const v=data[i];peak=Math.max(peak,Math.abs(v));sum+=v*v}
      const rms=Math.sqrt(sum/data.length);
      els.duration.textContent=result.duration.toFixed(2)+" s";els.rate.textContent=(result.sampleRate/1000).toFixed(1)+" kHz";els.peak.textContent=peak.toFixed(4);els.rms.textContent=rms.toFixed(4);
      els.fileMeta.textContent=result.numberOfChannels+" CHANNEL(S) · "+result.sampleRate.toLocaleString()+" HZ · "+fmt(result.duration);
      els.waveEmpty.hidden=true;drawWave();setProgress(30,"BUILDING SPECTROGRAM");
      analysis=await calculate(data,result.sampleRate,token);if(token!==loadToken)return;
      els.centroid.textContent=analysis.centroid.toFixed(0)+" Hz";els.bandwidth.textContent=analysis.bandwidth.toFixed(0)+" Hz";renderPeaks();
      els.specEmpty.hidden=true;els.spectrumEmpty.hidden=true;
      $("waveMid").textContent=fmt(result.duration/2);$("waveEnd").textContent=fmt(result.duration);
      const maxHz=Math.min(10000,result.sampleRate/2);$("spectrumMid").textContent=(maxHz/2000).toFixed(1)+" kHz";$("spectrumEnd").textContent=(maxHz/1000).toFixed(1)+" kHz";
      drawAll();setProgress(100,"ANALYSIS COMPLETE");els.recordState.textContent="READY TO EXPLORE";els.play.disabled=false;els.seek.disabled=false;els.play.textContent="▶";els.playTime.textContent="00:00 / "+fmt(result.duration);
    }catch(e){if(token!==loadToken)return;console.error(e);setProgress(0,"PROCESSING FAILED");els.recordState.textContent="ERROR";setError("Could not decode this recording. Try another valid WAV or MP3 file. "+e.message)}
  }
  function reset(){
    ++loadToken;audio.pause();playing=false;cancelAnimationFrame(raf);audio.removeAttribute("src");audio.load();
    if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;decoded=null;analysis=null;
    ["durationStat","sampleRateStat","peakStat","rmsStat","centroidStat","bandwidthStat"].forEach(id=>$(id).textContent="—");
    els.fileName.textContent="Nothing on the tape yet.";els.fileMeta.textContent="Upload a recording to begin acoustic analysis.";
    els.recordState.textContent="AWAITING AUDIO";setProgress(0,"STANDING BY");els.play.disabled=true;els.seek.disabled=true;els.seek.value=0;els.play.textContent="▶";els.playTime.textContent="00:00 / 00:00";
    els.waveEmpty.hidden=false;els.specEmpty.hidden=false;els.spectrumEmpty.hidden=false;els.peakList.innerHTML='<div class="peak-empty">Peaks will show up after analysis.</div>';setError("");
    [els.wave,els.spec,els.spectrum].forEach(cv=>cv.getContext("2d").clearRect(0,0,cv.width,cv.height));
  }
  els.browse.addEventListener("click",e=>{e.stopPropagation();els.fileInput.click()});
  els.dropzone.addEventListener("click",e=>{if(e.target!==els.browse)els.fileInput.click()});
  els.dropzone.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();els.fileInput.click()}});
  els.fileInput.addEventListener("change",e=>{if(e.target.files[0])loadFile(e.target.files[0]);e.target.value=""});
  ["dragenter","dragover"].forEach(type=>els.dropzone.addEventListener(type,e=>{e.preventDefault();els.dropzone.classList.add("dragover")}));
  ["dragleave","drop"].forEach(type=>els.dropzone.addEventListener(type,e=>{e.preventDefault();els.dropzone.classList.remove("dragover")}));
  els.dropzone.addEventListener("drop",e=>{const f=e.dataTransfer.files[0];if(f)loadFile(f)});
  els.play.addEventListener("click",async()=>{if(!decoded)return;if(audio.paused){try{await audio.play();playing=true;els.play.textContent="Ⅱ";cancelAnimationFrame(raf);updatePlayback()}catch(e){setError("Playback could not start: "+e.message)}}else audio.pause()});
  audio.addEventListener("pause",()=>{playing=false;cancelAnimationFrame(raf);if(decoded)els.play.textContent="▶"});
  audio.addEventListener("play",()=>{playing=true;els.play.textContent="Ⅱ";updatePlayback()});
  audio.addEventListener("ended",()=>{playing=false;cancelAnimationFrame(raf);els.play.textContent="▶";els.seek.value=0;els.playTime.textContent="00:00 / "+fmt(decoded.duration)});
  els.seek.addEventListener("input",()=>{if(decoded){audio.currentTime=Number(els.seek.value)/1000*decoded.duration;els.playTime.textContent=fmt(audio.currentTime)+" / "+fmt(decoded.duration)}});
  els.scale.addEventListener("change",()=>decoded&&drawSpectrogram());els.maxFreq.addEventListener("change",()=>decoded&&drawSpectrogram());
  window.addEventListener("resize",()=>{if(decoded)drawAll()});
  document.querySelectorAll(".nav-item").forEach(a=>a.addEventListener("click",()=>{document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));a.classList.add("active")}));
  // A clean state if the user refreshes the prototype.
  reset();
})();