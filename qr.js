// QR encoder lifted out of counter-manager-v20.html so the customer display can draw
// the same payment QR with no internet and no second copy to maintain. Byte mode, error
// correction L, versions 1 to 9 — a UPI string is about 120 characters.
// The counter page keeps its own inline copy; this file guards so loading both is harmless.
(function(){
if (window.QRE && window.drawQR) return;
var QRE=(function(){
  var EXP=new Array(512),LOG=new Array(256);
  (function(){var x=1;for(var i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=285;}for(var j=255;j<512;j++)EXP[j]=EXP[j-255];})();
  function mul(a,b){return (a&&b)?EXP[LOG[a]+LOG[b]]:0;}
  function genPoly(n){var p=[1];for(var i=0;i<n;i++){var r=new Array(p.length+1);for(var k=0;k<r.length;k++)r[k]=0;for(var j=0;j<p.length;j++){r[j]^=p[j];r[j+1]^=mul(p[j],EXP[i]);}p=r;}return p;}
  function eccOf(data,n){var g=genPoly(n),res=data.slice(),i,j;for(i=0;i<n;i++)res.push(0);
    for(i=0;i<data.length;i++){var c=res[i];if(!c)continue;for(j=0;j<g.length;j++)res[i+j]^=mul(g[j],c);}
    return res.slice(data.length);}
  var VER={1:[26,7,1],2:[44,10,1],3:[70,15,1],4:[100,20,1],5:[134,26,1],6:[172,18,2],7:[196,20,2],8:[242,24,2],9:[292,30,2]};
  var ALIGN={1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46]};
  function bchDigit(d){var n=0;while(d!==0){n++;d>>>=1;}return n;}
  function fmtInfo(d){var v=d<<10;while(bchDigit(v)-bchDigit(1335)>=0)v^=1335<<(bchDigit(v)-bchDigit(1335));return ((d<<10)|v)^21522;}
  function verInfo(v){var x=v<<12;while(bchDigit(x)-bchDigit(7973)>=0)x^=7973<<(bchDigit(x)-bchDigit(7973));return (v<<12)|x;}
  function maskFn(m,i,j){
    if(m===0)return (i+j)%2===0;
    if(m===1)return i%2===0;
    if(m===2)return j%3===0;
    if(m===3)return (i+j)%3===0;
    if(m===4)return (Math.floor(i/2)+Math.floor(j/3))%2===0;
    if(m===5)return ((i*j)%2)+((i*j)%3)===0;
    if(m===6)return (((i*j)%2)+((i*j)%3))%2===0;
    return (((i+j)%2)+((i*j)%3))%2===0;}
  function lost(m,N){
    var lp=0,r,c,dr,dc;
    for(r=0;r<N;r++)for(c=0;c<N;c++){var same=0,dark=m[r][c];
      for(dr=-1;dr<=1;dr++){if(r+dr<0||r+dr>=N)continue;
        for(dc=-1;dc<=1;dc++){if(c+dc<0||c+dc>=N)continue;if(dr===0&&dc===0)continue;if(dark===m[r+dr][c+dc])same++;}}
      if(same>5)lp+=3+same-5;}
    for(r=0;r<N-1;r++)for(c=0;c<N-1;c++){var cnt=0;
      if(m[r][c])cnt++;if(m[r+1][c])cnt++;if(m[r][c+1])cnt++;if(m[r+1][c+1])cnt++;
      if(cnt===0||cnt===4)lp+=3;}
    for(r=0;r<N;r++)for(c=0;c<N-6;c++)if(m[r][c]&&!m[r][c+1]&&m[r][c+2]&&m[r][c+3]&&m[r][c+4]&&!m[r][c+5]&&m[r][c+6])lp+=40;
    for(c=0;c<N;c++)for(r=0;r<N-6;r++)if(m[r][c]&&!m[r+1][c]&&m[r+2][c]&&m[r+3][c]&&m[r+4][c]&&!m[r+5][c]&&m[r+6][c])lp+=40;
    var dk=0;for(r=0;r<N;r++)for(c=0;c<N;c++)if(m[r][c])dk++;
    lp+=(Math.abs(100*dk/(N*N)-50)/5|0)*10;
    return lp;}
  function build(str){
    var bytes=[],i,j,b;
    if(window.TextEncoder){var enc=new TextEncoder().encode(str);for(i=0;i<enc.length;i++)bytes.push(enc[i]);}
    else for(i=0;i<str.length;i++)bytes.push(str.charCodeAt(i)&255);
    var ver=0,spec=null;
    for(var v=1;v<=9;v++){var s=VER[v];if(bytes.length<=(s[0]-s[1]*s[2])-2){ver=v;spec=s;break;}}
    if(!ver)return null;
    var total=spec[0],ecLen=spec[1],blocks=spec[2],dataTotal=total-ecLen*blocks;
    var bb=[];
    function put(val,n){for(var k=n-1;k>=0;k--)bb.push((val>>k)&1);}
    put(4,4);put(bytes.length,8);for(i=0;i<bytes.length;i++)put(bytes[i],8);
    var pad0=Math.min(4,dataTotal*8-bb.length);for(i=0;i<pad0;i++)bb.push(0);
    while(bb.length%8)bb.push(0);
    var dcw=[];for(i=0;i<bb.length;i+=8){b=0;for(j=0;j<8;j++)b=(b<<1)|bb[i+j];dcw.push(b);}
    var PADS=[236,17],pi=0;while(dcw.length<dataTotal)dcw.push(PADS[pi++%2]);
    var per=dataTotal/blocks,dblk=[],eblk=[];
    for(b=0;b<blocks;b++){var d=dcw.slice(b*per,(b+1)*per);dblk.push(d);eblk.push(eccOf(d,ecLen));}
    var fin=[];
    for(i=0;i<per;i++)for(b=0;b<blocks;b++)fin.push(dblk[b][i]);
    for(i=0;i<ecLen;i++)for(b=0;b<blocks;b++)fin.push(eblk[b][i]);
    var N=17+4*ver;
    var bits=[];for(i=0;i<fin.length;i++)for(j=7;j>=0;j--)bits.push((fin[i]>>j)&1);
    function construct(mask){
      var m=[],fn=[],i2,j2;
      for(i2=0;i2<N;i2++){m.push(new Array(N).fill(0));fn.push(new Array(N).fill(0));}
      function setF(r,c,v){if(r<0||c<0||r>=N||c>=N)return;m[r][c]=v;fn[r][c]=1;}
      function finder(r,c){for(var a=-1;a<=7;a++)for(var e=-1;e<=7;e++){
        var on=((a>=0&&a<=6)&&(e===0||e===6))||((e>=0&&e<=6)&&(a===0||a===6))||(a>=2&&a<=4&&e>=2&&e<=4);
        setF(r+a,c+e,on?1:0);}}
      finder(0,0);finder(0,N-7);finder(N-7,0);
      for(i2=8;i2<N-8;i2++){setF(6,i2,i2%2===0?1:0);setF(i2,6,i2%2===0?1:0);}
      var al=ALIGN[ver];
      for(i2=0;i2<al.length;i2++)for(j2=0;j2<al.length;j2++){
        var ar=al[i2],ac=al[j2];
        if((ar<=8&&ac<=8)||(ar<=8&&ac>=N-9)||(ar>=N-9&&ac<=8))continue;
        for(var a2=-2;a2<=2;a2++)for(var e2=-2;e2<=2;e2++)setF(ar+a2,ac+e2,Math.max(Math.abs(a2),Math.abs(e2))!==1?1:0);}
      for(i2=0;i2<9;i2++){if(!fn[i2][8]){m[i2][8]=0;fn[i2][8]=1;}if(!fn[8][i2]){m[8][i2]=0;fn[8][i2]=1;}}
      for(i2=0;i2<8;i2++){if(!fn[8][N-1-i2]){m[8][N-1-i2]=0;fn[8][N-1-i2]=1;}if(!fn[N-1-i2][8]){m[N-1-i2][8]=0;fn[N-1-i2][8]=1;}}
      if(ver>=7)for(i2=0;i2<18;i2++){
        var r1=Math.floor(i2/3),c1=i2%3+N-11;fn[r1][c1]=1;m[r1][c1]=0;
        var r2=i2%3+N-11,c2=Math.floor(i2/3);fn[r2][c2]=1;m[r2][c2]=0;}
      var idx=0,up=true;
      for(var col=N-1;col>0;col-=2){
        if(col===6)col--;
        for(var k=0;k<N;k++){
          var row=up?N-1-k:k;
          for(var dx=0;dx<2;dx++){
            var cc=col-dx;
            if(fn[row][cc])continue;
            var bit=idx<bits.length?bits[idx]:0;idx++;
            if(maskFn(mask,row,cc))bit^=1;
            m[row][cc]=bit;}}
        up=!up;}
      var fb=fmtInfo((1<<3)|mask);
      for(i2=0;i2<15;i2++){var fbit=(fb>>i2)&1;
        if(i2<6)m[i2][8]=fbit;else if(i2<8)m[i2+1][8]=fbit;else m[N-15+i2][8]=fbit;
        if(i2<8)m[8][N-i2-1]=fbit;else if(i2<9)m[8][15-i2]=fbit;else m[8][14-i2]=fbit;}
      m[N-8][8]=1;
      if(ver>=7){var vb=verInfo(ver);
        for(i2=0;i2<18;i2++){var vbit=(vb>>i2)&1;
          m[Math.floor(i2/3)][i2%3+N-11]=vbit;
          m[i2%3+N-11][Math.floor(i2/3)]=vbit;}}
      return m;}
    var best=null,bestScore=Infinity;
    for(var mk=0;mk<8;mk++){var mm=construct(mk),sc=lost(mm,N);if(sc<bestScore){bestScore=sc;best=mm;}}
    return {size:N,mods:best};}
  return {build:build};
})();
function drawQR(cv,text,px){
  var q=QRE.build(text);if(!q)return false;
  var quiet=4,n=q.size,tot=n+quiet*2,scale=Math.max(3,Math.floor((px||280)/tot));
  cv.width=tot*scale;cv.height=tot*scale;
  var g=cv.getContext('2d');
  g.fillStyle='#ffffff';g.fillRect(0,0,cv.width,cv.height);
  g.fillStyle='#000000';
  for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(q.mods[r][c])g.fillRect((c+quiet)*scale,(r+quiet)*scale,scale,scale);
  return true;}
window.QRE = QRE;
window.drawQR = drawQR;
})();
