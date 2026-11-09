/* SHA-256 en JavaScript puro (la misma función que usa el motor de las prácticas). */
function sha256hex(ascii){
function rr(v,c){return(v>>>c)|(v<<(32-c));}
var mw=Math.pow,ms=mw(2,32),i,j,result='';
var words=[],al=ascii.length*8;
var hash=sha256hex.h=sha256hex.h||[],k=sha256hex.k=sha256hex.k||[],pc=k.length;
var isC={};
for(var cand=2;pc<64;cand++){
if(!isC[cand]){for(i=0;i<313;i+=cand){isC[i]=cand;}
hash[pc]=(mw(cand,.5)*ms)|0;k[pc++]=(mw(cand,1/3)*ms)|0;}}
ascii+='\x80';
while(ascii.length%64-56)ascii+='\x00';
for(i=0;i<ascii.length;i++){j=ascii.charCodeAt(i);if(j>>8)return null;
words[i>>2]|=j<<((3-i)%4)*8;}
words[words.length]=(al/ms)|0;words[words.length]=al;
for(j=0;j<words.length;){
var w=words.slice(j,j+=16),oh=hash.slice(0,8);
for(i=16;i<64;i++){var w15=w[i-15],w2=w[i-2];
w[i]=((rr(w15,7)^rr(w15,18)^(w15>>>3))+w[i-7]+(rr(w2,17)^rr(w2,19)^(w2>>>10))+w[i-16])|0;}
for(i=0;i<64;i++){
var a=hash[0],e=hash[4];
var t1=(hash[7]+(rr(e,6)^rr(e,11)^rr(e,25))+((e&hash[5])^((~e)&hash[6]))+k[i]+w[i])|0;
var t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&hash[1])^(a&hash[2])^(hash[1]&hash[2])))|0;
hash=[(t1+t2)|0].concat(hash);hash[4]=(hash[4]+t1)|0;hash.length=8;}
for(i=0;i<8;i++)hash[i]=(hash[i]+oh[i])|0;}
for(i=0;i<8;i++)for(j=3;j+1;j--){var b=(hash[i]>>(j*8))&255;result+=((b>>4).toString(16))+((b&15).toString(16));}
return result;}
function utf8(s){return unescape(encodeURIComponent(s));}
function sha(s){return sha256hex(utf8(s));}
