/* =====================================================================
   Controle remoto — lado da TELA (computador / projetor)
   ---------------------------------------------------------------------
   • Recebe os comandos do celular (controle.html) pelo Supabase Realtime
     (Broadcast + Presence). Não usa banco de dados.
   • Devolve o estado do slide: número, passo, título, notas, quem fala.
   • Tecla C (ou o botão de celular na barra): QR code + código da sala.
   • Tecla H: esconde/mostra a barra de navegação de baixo.
   Se o Supabase não estiver configurado ou cair, a apresentação continua
   funcionando normalmente pelo teclado.
   ===================================================================== */
(()=>{
"use strict";
const S=window.Slides;
if(!S){console.warn("[remoto] window.Slides não encontrado");return}
const cfg=window.CONFIG_REMOTO||{};
const configurado=!!(cfg.SUPABASE_URL&&cfg.SUPABASE_KEY)&&!/SEU-PROJETO|SUA_CHAVE/i.test(cfg.SUPABASE_URL+" "+cfg.SUPABASE_KEY);
const $=s=>document.querySelector(s);
const mem={get(k){try{return localStorage.getItem("ctd:"+k)}catch(e){return null}},set(k,v){try{localStorage.setItem("ctd:"+k,v)}catch(e){}}};
const novoCodigo=()=>String(1000+Math.floor(Math.random()*9000));

/* código da sala: ?sala=1234 na URL > último usado neste computador > novo */
let sala="";
try{sala=new URLSearchParams(location.search).get("sala")||""}catch(e){}
sala=(sala||mem.get("sala")||"").replace(/\D/g,"").slice(0,6);
if(sala.length<4)sala=novoCodigo();
mem.set("sala",sala);

/* ---------------- visual ---------------- */
document.head.insertAdjacentHTML("beforeend",`<style>
#btnRemoto{position:relative}
#btnRemoto .rm-ponto{position:absolute;right:.3rem;top:.3rem;width:.55rem;height:.55rem;border-radius:50%;background:#6b7194;box-shadow:0 0 0 2px rgba(10,13,26,.9)}
#btnRemoto[data-st=conectando] .rm-ponto{background:#ffb62e;animation:rmPisca 1s steps(1) infinite}
#btnRemoto[data-st=online] .rm-ponto{background:#ffb62e}
#btnRemoto[data-st=pareado] .rm-ponto{background:#5fd36f}
#btnRemoto[data-st=erro] .rm-ponto,#btnRemoto[data-st=sem-lib] .rm-ponto{background:#ff5f57}
#btnRemoto.rm-cmd .rm-ponto{animation:rmPulso .45s}
@keyframes rmPisca{50%{opacity:.2}}
@keyframes rmPulso{50%{transform:scale(2.2)}}
#rmPainel{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:16px;background:rgba(5,7,15,.74);backdrop-filter:blur(6px)}
#rmPainel[hidden]{display:none}
.rm-caixa{position:relative;width:min(30rem,100%);max-height:calc(100vh - 32px);overflow:auto;border-radius:26px;padding:1.6rem 1.5rem 1.4rem;background:#121831;color:#eef1ff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.12),0 30px 80px rgba(0,0,0,.5);display:flex;flex-direction:column;align-items:center;gap:.75rem;text-align:center;font-family:var(--texto)}
.rm-caixa h2{font-size:1.55rem}
.rm-et{font-family:var(--mono);font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;opacity:.7}
.rm-x{position:absolute;right:.7rem;top:.6rem;border:0;background:transparent;font-size:1.6rem;line-height:1;opacity:.7;width:2.2rem;height:2.2rem;border-radius:50%}
.rm-x:hover{background:rgba(255,255,255,.1);opacity:1}
.rm-qr{width:236px;height:236px;max-width:100%;border-radius:18px;background:#fff;display:grid;place-items:center;padding:8px;color:#1c1916;font-size:.85rem;line-height:1.4}
.rm-qr img{display:block}
.rm-ou{font-size:.9rem;opacity:.82;line-height:1.4}
.rm-ou b{font-family:var(--mono);word-break:break-all}
.rm-cod{font-family:var(--mono);font-weight:700;font-size:3rem;letter-spacing:.3em;padding-left:.3em;color:#ffb62e;line-height:1}
.rm-st{min-height:1.5em;font-weight:700}
.rm-st.ok{color:#5fd36f}.rm-st.erro{color:#ff8a84}
.rm-bts{display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center}
.rm-dica{font-size:.78rem;opacity:.6}
body.rm-limpo #doca{opacity:0;transition:opacity .3s}
body.rm-limpo #doca:hover,body.rm-limpo #doca:focus-within{opacity:1}
</style>`);

const bt=document.createElement("button");
bt.id="btnRemoto";bt.setAttribute("aria-label","Controle pelo celular");bt.dataset.st="sem-config";
bt.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg><i class="rm-ponto"></i>';
const doca=$("#doca");if(doca)doca.appendChild(bt);

const ov=document.createElement("div");ov.id="rmPainel";ov.hidden=true;
ov.innerHTML=`<div class="rm-caixa" role="dialog" aria-label="Conectar o celular">
  <button class="rm-x" id="rmX" aria-label="Fechar">&times;</button>
  <span class="rm-et">controle pelo celular</span>
  <h2>Aponte a câmera do celular</h2>
  <div class="rm-qr" id="rmQr"></div>
  <p class="rm-ou">ou abra <b id="rmLink"></b><br>e digite o código</p>
  <div class="rm-cod" id="rmCod"></div>
  <p class="rm-st" id="rmSt"></p>
  <div class="rm-bts"><button class="btn" id="rmNovo">Gerar novo código</button><button class="btn on" id="rmFechar">Pronto</button></div>
  <p class="rm-dica">C abre/fecha este painel · H esconde a barra de baixo</p>
</div>`;
document.body.appendChild(ov);

/* ---------------- status ---------------- */
let st="sem-config",controles=0;
const TXT={
  "sem-config":["Preencha o config.js com a URL e a chave do Supabase.","erro"],
  "sem-lib":["Não carreguei o Supabase. O computador está sem internet?","erro"],
  conectando:["Conectando ao servidor…",""],
  online:["Aguardando o celular…",""],
  erro:["Sem conexão com o servidor. Tentando de novo…","erro"]
};
function marca(novo){st=novo;if(st!=="online")controles=0;
  const ef=st==="online"&&controles>0?"pareado":st;bt.dataset.st=ef;
  const t=ef==="pareado"?[controles===1?"✓ Celular conectado":`✓ ${controles} celulares conectados`,"ok"]:TXT[ef];
  const el=$("#rmSt");el.textContent=t[0];el.className="rm-st "+t[1];bt.title=t[0]}

/* ---------------- QR code (biblioteca carregada só quando precisa) ---------------- */
let qrP=null;
function carregaQR(){if(window.QRCode)return Promise.resolve();if(qrP)return qrP;
  qrP=new Promise((ok,falha)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    s.onload=()=>window.QRCode?ok():falha();s.onerror=()=>{qrP=null;falha()};document.head.appendChild(s)});return qrP}
const linkControle=()=>{try{return new URL("controle.html?sala="+sala,location.href).href}catch(e){return "controle.html?sala="+sala}};
function desenhaPainel(){
  const qr=$("#rmQr");$("#rmCod").textContent=sala;
  let u=null;try{u=new URL("controle.html",location.href)}catch(e){}
  $("#rmLink").textContent=u&&/^https?:$/.test(u.protocol)?u.host+u.pathname:"controle.html";
  if(!/^https?:$/.test(location.protocol)){qr.textContent="Abra a apresentação pelo link do Vercel para gerar o QR code.";return}
  qr.innerHTML='<span style="opacity:.5">gerando…</span>';
  carregaQR().then(()=>{qr.innerHTML="";new QRCode(qr,{text:linkControle(),width:220,height:220,colorDark:"#0d1120",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M})})
    .catch(()=>{qr.textContent="Não consegui gerar o QR. Use o link e o código abaixo."})}

/* ---------------- canal Supabase ---------------- */
let sb=null,ch=null,tRetry=0,espera=2000,tEnvio=0,ultimoCmd="";
function tentaDeNovo(){clearTimeout(tRetry);tRetry=setTimeout(conecta,espera);espera=Math.min(espera*2,15000)}
function conecta(){
  clearTimeout(tRetry);
  if(!configurado){marca("sem-config");return}
  if(!window.supabase||!window.supabase.createClient){marca("sem-lib");return}
  try{
    if(!sb)sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    if(ch){const velho=ch;ch=null;sb.removeChannel(velho)}
    marca("conectando");
    const meu=sb.channel("slides-"+sala,{config:{broadcast:{self:false,ack:false}}});
    ch=meu;
    meu.on("broadcast",{event:"cmd"},m=>{if(ch===meu)executa((m&&m.payload)||{})})
      .on("broadcast",{event:"ola"},()=>{if(ch===meu)envia()})
      .on("presence",{event:"sync"},()=>{if(ch!==meu)return;
        const ps=meu.presenceState()||{};let n=0;
        Object.keys(ps).forEach(k=>(ps[k]||[]).forEach(p=>{if(p&&p.tipo==="controle")n++}));
        const entrou=n>controles;controles=n;marca(st==="conectando"?"online":st);if(entrou)envia()})
      .subscribe(s=>{if(ch!==meu)return;
        if(s==="SUBSCRIBED"){espera=2000;marca("online");const t=meu.track({tipo:"tela"});if(t&&t.catch)t.catch(()=>{});envia()}
        else if(s==="CHANNEL_ERROR"||s==="TIMED_OUT"){marca("erro");tentaDeNovo()}});
  }catch(e){console.warn("[remoto]",e);marca("erro");tentaDeNovo()}
}
/* manda o estado atual para os celulares (agrupa chamadas seguidas) */
function envia(){clearTimeout(tEnvio);tEnvio=setTimeout(()=>{
  if(!ch||st!=="online")return;
  try{const r=ch.send({type:"broadcast",event:"estado",payload:S.estado()});if(r&&r.catch)r.catch(()=>{})}catch(e){}},30)}
function executa(c){
  if(c.id&&c.id===ultimoCmd)return;ultimoCmd=c.id||"";
  switch(c.acao){
    case "prox":S.prox();break;
    case "volta":S.volta();break;
    case "ir":S.ir((parseInt(c.n,10)||1)-1);break;
    case "reinicia":S.reinicia();break;
    case "botao":S.clicar(parseInt(c.slide,10),parseInt(c.i,10));break;
    default:return}
  envia();bt.classList.remove("rm-cmd");void bt.offsetWidth;bt.classList.add("rm-cmd")}
S.aoMudar=envia;
setInterval(()=>{if(controles>0)envia()},10000);

/* ---------------- painel ---------------- */
function abre(){desenhaPainel();marca(st);ov.hidden=false;$("#rmFechar").focus()}
function fecha(){ov.hidden=true;if(document.activeElement)document.activeElement.blur()}
bt.onclick=()=>ov.hidden?abre():fecha();
$("#rmX").onclick=fecha;$("#rmFechar").onclick=fecha;
ov.addEventListener("click",e=>{if(e.target===ov)fecha()});
$("#rmNovo").onclick=()=>{sala=novoCodigo();mem.set("sala",sala);
  try{const u=new URL(location.href);if(u.searchParams.has("sala")){u.searchParams.set("sala",sala);history.replaceState(null,"",u)}}catch(e){}
  desenhaPainel();conecta()};
document.addEventListener("keydown",e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||(e.target&&e.target.matches&&e.target.matches("input,textarea,select")))return;
  const k=e.key;
  if(k==="c"||k==="C"){e.preventDefault();ov.hidden?abre():fecha()}
  else if(k==="h"||k==="H")document.body.classList.toggle("rm-limpo");
  else if(k==="Escape"&&!ov.hidden)fecha()});
window.addEventListener("online",()=>{if(st!=="online")conecta()});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&(st==="erro"||st==="sem-lib"))conecta()});

marca(st);
conecta();
})();