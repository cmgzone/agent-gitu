/** Incremental SHA-256 for browser uploads; files are read in bounded slices. */
export const FILE_HASH_JS = String.raw`
  function fileHashState(){
    var h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    var k=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
    var w=new Uint32Array(64),pending=new Uint8Array(64),used=0,total=0,finished=false;
    function rotate(x,n){return (x>>>n)|(x<<(32-n));}
    function block(bytes,start){
      for(var i=0;i<16;i++){var j=start+i*4;w[i]=(bytes[j]<<24)|(bytes[j+1]<<16)|(bytes[j+2]<<8)|bytes[j+3];}
      for(var i=16;i<64;i++){var x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+w[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10)))>>>0;}
      var a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],z=h[7];
      for(var i=0;i<64;i++){var t1=(z+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^((~e)&g))+k[i]+w[i])>>>0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
      h[0]=(h[0]+a)>>>0;h[1]=(h[1]+b)>>>0;h[2]=(h[2]+c)>>>0;h[3]=(h[3]+d)>>>0;h[4]=(h[4]+e)>>>0;h[5]=(h[5]+f)>>>0;h[6]=(h[6]+g)>>>0;h[7]=(h[7]+z)>>>0;
    }
    return {
      update:function(bytes){
        if(finished)throw new Error('File checksum already finalized.');total+=bytes.length;var offset=0;
        if(used){var count=Math.min(64-used,bytes.length);pending.set(bytes.subarray(0,count),used);used+=count;offset=count;if(used===64){block(pending,0);used=0;}}
        while(offset+64<=bytes.length){block(bytes,offset);offset+=64;}
        if(offset<bytes.length){pending.set(bytes.subarray(offset),0);used=bytes.length-offset;}
      },
      digest:function(){
        if(finished)throw new Error('File checksum already finalized.');finished=true;pending[used++]=0x80;
        if(used>56){pending.fill(0,used);block(pending,0);pending.fill(0);used=0;}pending.fill(0,used,56);
        var view=new DataView(pending.buffer);view.setUint32(56,Math.floor(total/0x20000000));view.setUint32(60,(total*8)>>>0);block(pending,0);
        return Array.from(h).map(function(value){return value.toString(16).padStart(8,'0');}).join('');
      }
    };
  }
  async function fileChecksum(file,signal,onProgress){
    var hash=fileHashState(),chunkBytes=1024*1024;
    for(var offset=0;offset<file.size;offset+=chunkBytes){
      if(signal)signal.throwIfAborted();var bytes=new Uint8Array(await file.slice(offset,Math.min(file.size,offset+chunkBytes)).arrayBuffer());
      if(signal)signal.throwIfAborted();hash.update(bytes);if(onProgress)onProgress(Math.min(file.size,offset+bytes.length)/file.size);
      await new Promise(function(resolve){setTimeout(resolve,0);});
    }
    if(signal)signal.throwIfAborted();return hash.digest();
  }
`;
