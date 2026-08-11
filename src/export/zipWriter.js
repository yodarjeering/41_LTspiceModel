const encoder = new TextEncoder();
let crcTable;
function makeCrcTable() {
  return Array.from({ length: 256 }, (_, n) => {
    let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; return c>>>0;
  });
}
function crc32(bytes) {
  crcTable ||= makeCrcTable(); let c=0xffffffff;
  for (const b of bytes) c=crcTable[(c^b)&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function u16(n){ return [n&255,(n>>>8)&255]; }
function u32(n){ return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]; }
function dosDateTime(date=new Date()) {
  const year=Math.max(1980,date.getFullYear());
  return { time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>>1), date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate() };
}

export function createZip(files, date=new Date()) {
  const local=[], central=[]; let offset=0; const dt=dosDateTime(date);
  for (const [path, content] of Object.entries(files)) {
    const name=encoder.encode(path.replace(/\\/g,"/")); const data=typeof content==="string"?encoder.encode(content):content; const crc=crc32(data);
    const localHeader=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x800),...u16(0),...u16(dt.time),...u16(dt.date),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);
    local.push(localHeader,data);
    central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x800),...u16(0),...u16(dt.time),...u16(dt.date),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]));
    offset+=localHeader.length+data.length;
  }
  const centralSize=central.reduce((n,b)=>n+b.length,0);
  const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(central.length),...u16(central.length),...u32(centralSize),...u32(offset),...u16(0)]);
  const all=[...local,...central,end], size=all.reduce((n,b)=>n+b.length,0), out=new Uint8Array(size); let at=0;
  for(const bytes of all){out.set(bytes,at);at+=bytes.length;} return out;
}
