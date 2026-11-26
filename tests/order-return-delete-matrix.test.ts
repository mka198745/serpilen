import test from 'node:test';
import assert from 'node:assert/strict';
import {ADMIN_MODULES, normalizeRoleMatrix} from '../src/lib/admin-modules';

test('Sipariş/iade silme yetkisi Süper Admin için açık, diğer roller için varsayılan kapalıdır',()=>{
 assert.ok(ADMIN_MODULES.some(x=>x.key==='orderReturnDelete'));
 const defaults=normalizeRoleMatrix(null);
 assert.equal(defaults.SUPER_ADMIN.orderReturnDelete,true);
 for(const role of ['STORE_MANAGER','WAREHOUSE_KEEPER','CASHIER'] as const) assert.equal(defaults[role].orderReturnDelete,false);
 const updated=normalizeRoleMatrix({SUPER_ADMIN:{orderReturnDelete:false},STORE_MANAGER:{orders:true,orderReturnDelete:true},CASHIER:{orders:true}});
 assert.equal(updated.SUPER_ADMIN.orderReturnDelete,true);assert.equal(updated.STORE_MANAGER.orderReturnDelete,true);assert.equal(updated.CASHIER.orderReturnDelete,false);
});
