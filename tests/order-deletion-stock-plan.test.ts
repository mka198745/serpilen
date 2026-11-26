import test from 'node:test';
import assert from 'node:assert/strict';
import {planStockReversal,StockPlanError,type DeletionReturn} from '../src/lib/order-deletion-stock-plan';

const saleItems=[{productId:1,variantId:2,quantity:5}];
const saleMovements=[{warehouseId:1,productId:1,variantId:2,quantity:-3},{warehouseId:2,productId:1,variantId:2,quantity:-2}];
const returned:DeletionReturn={id:1,status:'REFUNDED',restock:true,items:[{productId:1,variantId:2,quantity:2}],movements:[{warehouseId:2,productId:1,variantId:2,quantity:2}]};
const balances=[{warehouseId:1,productId:1,variantId:2,physical:10,reserved:4},{warehouseId:2,productId:1,variantId:2,physical:5,reserved:3}];

test('Satış ve iade hareketleri depo/varyant bazında gerçek kayıtlarından terslenir',()=>{
 assert.deepEqual(planStockReversal({saleItems,saleMovements,returns:[returned],balances}),[
  {warehouseId:1,productId:1,variantId:2,delta:3,physical:10,reserved:4,after:13},
  {warehouseId:2,productId:1,variantId:2,delta:0,physical:5,reserved:3,after:5},
 ]);
 assert.deepEqual(planStockReversal({saleItems:[],saleMovements:[],returns:[returned],balances}),[{warehouseId:2,productId:1,variantId:2,delta:-2,physical:5,reserved:3,after:3}]);
 assert.throws(()=>planStockReversal({saleItems:[],saleMovements:[],returns:[returned],balances:[{...balances[1],reserved:4}]}),StockPlanError);
});

test('Eksik, çelişkili ve belirsiz geçmiş tahmin edilmez',()=>{
 const run=(overrides:Record<string,unknown>)=>planStockReversal({saleItems,saleMovements,returns:[returned],balances,...overrides});
 assert.throws(()=>run({saleMovements:[]}),/Satış miktarı/);
 assert.throws(()=>run({saleMovements:[{...saleMovements[0],quantity:3}]}),/hareketi geçersiz/);
 assert.throws(()=>run({returns:[{...returned,movements:[]}]}),/İade miktarı/);
 assert.throws(()=>run({returns:[{...returned,items:[{productId:1,variantId:2,quantity:6}],movements:[{...returned.movements[0],quantity:6}]}]}),/satış miktarını aşıyor/);
 assert.throws(()=>run({returns:[returned,returned]}),/kimliği/);
 assert.throws(()=>run({balances:[balances[0],balances[0]]}),/Yinelenen/);
 assert.throws(()=>run({balances:[balances[1]]}),/Stok kaydı eksik/);
 assert.throws(()=>run({balances:[{...balances[1],physical:1,reserved:2}]}),/tutarsız/);
 assert.throws(()=>run({returns:[{...returned,status:'REQUESTED'}]}),/durumu/);
 assert.throws(()=>run({returns:[{...returned,status:'REJECTED'}]}),/İade miktarı/);
});

test('Stoğa alınmamış ve reddedilmiş iadeler stok hareketi üretmez',()=>{
 const noStock={...returned,restock:false,movements:[]};
 assert.deepEqual(planStockReversal({saleItems:[],saleMovements:[],returns:[noStock],balances}),[]);
 const rejected={...returned,status:'REJECTED' as const,movements:[]};
 assert.deepEqual(planStockReversal({saleItems:[],saleMovements:[],returns:[rejected],balances}),[]);
});
