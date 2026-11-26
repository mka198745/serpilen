import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('SQLite yolu mutlak, göreli, file ve bellek biçimleriyle çalışma anında çözülür',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sqlite-paths-'));
 try{
  const dbModule=path.resolve('src/db/index.ts'),tsx=path.resolve('node_modules/tsx/dist/cli.mjs');
  const cases=[
   {url:'sqlite:./relative/a.db',expected:path.join(dir,'relative/a.db')},
   {url:'./relative/b.db',expected:path.join(dir,'relative/b.db')},
   {url:'file:./relative/c.db',expected:path.join(dir,'relative/c.db')},
   {url:`sqlite:${path.join(dir,'absolute.db')}`,expected:path.join(dir,'absolute.db')},
   {url:'sqlite::memory:',expected:':memory:'},
   {url:undefined,expected:path.join(dir,'data/tuhafiye.db')},
  ];
  for(const {url,expected} of cases){const env={...process.env,NODE_ENV:'production'};if(url===undefined)delete env.DATABASE_URL;else env.DATABASE_URL=url;
   const r=spawnSync(process.execPath,[tsx,'-e',`const db=require(${JSON.stringify(dbModule)});console.log(db.sqlitePath);db.sqlite.close()`],{cwd:dir,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),expected);if(expected!==':memory:')assert.ok(fs.existsSync(expected));
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
