import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedMultipart, MultipartTooLarge } from '../src/lib/bounded-multipart';
import { issueDownloadTicket, consumeDownloadTicket, DOWNLOAD_TICKET_TTL_SECONDS } from '../src/lib/download-tickets';

const body = '--boundary\r\nContent-Disposition: form-data; name="file"; filename="x.db"\r\nContent-Type: application/octet-stream\r\n\r\nhello\r\n--boundary--\r\n';
function req(contentLength?: string) {
 const stream = new ReadableStream<Uint8Array>({start(controller){const bytes=new TextEncoder().encode(body);controller.enqueue(bytes.slice(0,25));controller.enqueue(bytes.slice(25));controller.close();}});
 return new Request('https://example.test/api/database',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=boundary',...(contentLength?{'content-length':contentLength}:{})},body:stream,duplex:'half'} as RequestInit & {duplex:'half'});
}

test('Multipart gerçek içerik uzunluğu başlık eksik veya yanlış olsa da sınırlandırılır',async()=>{
 const valid=await readBoundedMultipart(req(),1024);assert.equal((await (valid.get('file') as File).text()),'hello');
 await assert.rejects(readBoundedMultipart(req(),40),MultipartTooLarge);
 await assert.rejects(readBoundedMultipart(req('1'),40),MultipartTooLarge);
 await assert.rejects(readBoundedMultipart(req('10000'),100),MultipartTooLarge);
});

test('İndirme bileti dosyaya bağlı, tek kullanımlık ve en fazla 30 saniye geçerli',()=>{
 const now=Date.now;let ms=1700000000000;Date.now=()=>ms;
 try{const ticket=issueDownloadTicket('tuhafiye-test.db',7,'a'.repeat(64));assert.equal(consumeDownloadTicket(ticket,'tuhafiye-other.db'),null);assert.deepEqual(consumeDownloadTicket(ticket,'tuhafiye-test.db'),{name:'tuhafiye-test.db',userId:7,sessionHash:'a'.repeat(64)});assert.equal(consumeDownloadTicket(ticket,'tuhafiye-test.db'),null);
  const expired=issueDownloadTicket('tuhafiye-test.db',7,'b'.repeat(64));ms+=DOWNLOAD_TICKET_TTL_SECONDS*1000;assert.equal(consumeDownloadTicket(expired,'tuhafiye-test.db'),null);
 }finally{Date.now=now;}
});
