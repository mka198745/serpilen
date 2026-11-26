import { sharedSalesWarehouseId } from "@/lib/shared-sales-warehouse";
import { sqlite } from "@/db";
import { applyPromotionsSync } from "@/lib/promotion-engine";
import { getSettingsSync } from "@/lib/settings";
import { StockShortage } from "@/lib/inventory-engine";

type InputLine = {productId:unknown;variantId?:unknown;quantity:unknown;unitPrice:unknown};
/** Run both for preview and for committing, so price/promotion changes fail closed. */
export function posQuote(items:InputLine[], discount:unknown, checkStock=true, couponCode?:unknown, spentPoints?:unknown, customerId?:unknown) {
  if(!Array.isArray(items)||!items.length||items.length>100)throw new StockShortage("Geçerli POS sepeti gerekli.");
  const totals=new Map<string,number>();
  const lines=items.map(item=>{
    const productId=Number(item.productId), variantId=item.variantId?Number(item.variantId):null, quantity=Number(item.quantity);
    if(!Number.isSafeInteger(productId)||productId<=0||!Number.isSafeInteger(quantity)||quantity<=0||quantity>10000|| (variantId!==null&&(!Number.isSafeInteger(variantId)||variantId<=0)))throw new StockShortage("Geçersiz POS ürün bilgisi.");
    const p=sqlite.prepare("SELECT category_id,brand_id,retail_price,is_active FROM products WHERE id=?").get(productId) as {category_id:number|null;brand_id:number|null;retail_price:number|string;is_active:number}|undefined;
    if(!p||!p.is_active)throw new StockShortage("POS ürünü mevcut değil.");
    const v=variantId?sqlite.prepare("SELECT retail_price,is_active FROM product_variants WHERE id=? AND product_id=?").get(variantId,productId) as {retail_price:number|string;is_active:number}|undefined:undefined;
    if(variantId&&(!v||!v.is_active))throw new StockShortage("POS varyantı mevcut değil.");
    const price=Number(v?.retail_price??p.retail_price),cents=Math.round(price*100);
    if(!Number.isSafeInteger(cents)||cents<0||!Number.isFinite(Number(item.unitPrice))||Math.round(Number(item.unitPrice)*100)!==cents)throw new StockShortage("Ürün fiyatı değişti; sepeti yenileyin.");
    const key=`${productId}:${variantId??'base'}`;totals.set(key,(totals.get(key)||0)+quantity);
    return {productId,variantId,quantity,unitPrice:cents/100,categoryId:p.category_id,brandId:p.brand_id};
  });
  const warehouseId = sharedSalesWarehouseId();
  if (checkStock && !warehouseId) throw new StockShortage("Ortak satış deposu seçilmemiş.");
  if(checkStock) for(const [key,quantity] of totals) {
    const [pid,vid]=key.split(':'),stock=sqlite.prepare("SELECT physical_qty,reserved_qty FROM inventory WHERE warehouse_id=? AND product_id=? AND variant_id IS ? LIMIT 2").all(warehouseId,Number(pid),vid==='base'?null:Number(vid)) as {physical_qty:number;reserved_qty:number}[];
    if(stock.length!==1||stock[0].physical_qty-stock[0].reserved_qty<quantity)throw new StockShortage("POS satışı için kullanılabilir stok yetersiz.");
  }
  const subtotalCents=lines.reduce((a,l)=>a+Math.round(l.unitPrice*100)*l.quantity,0), manualCents=Math.round(Number(discount)*100);
  if(!Number.isSafeInteger(subtotalCents)||!Number.isSafeInteger(manualCents)||manualCents<0||manualCents>subtotalCents)throw new StockShortage("Geçersiz POS iskonto tutarı.");
  const promo=applyPromotionsSync(lines),promoCents=Math.min(subtotalCents-manualCents,Math.round(promo.totalDiscount*100));
  let remaining=subtotalCents-manualCents-promoCents,couponCents=0,pointsCents=0;
  if(couponCode) {
    const coupon=sqlite.prepare("SELECT * FROM coupons WHERE code=?").get(String(couponCode).trim().toUpperCase()) as {id:number;is_active:number;used_count:number;usage_limit:number;min_cart_amount:number;discount_type:string;discount_value:number;max_discount:number|null}|undefined;
    if(!coupon||!coupon.is_active||coupon.used_count>=coupon.usage_limit||subtotalCents<Math.round(Number(coupon.min_cart_amount||0)*100)) throw new StockShortage("POS kuponu geçersiz veya kullanım sınırına ulaştı.");
    couponCents=coupon.discount_type==='PERCENT'?Math.round(subtotalCents*Number(coupon.discount_value)/100):Math.round(Number(coupon.discount_value)*100);
    if(coupon.max_discount!=null)couponCents=Math.min(couponCents,Math.round(Number(coupon.max_discount)*100));
    if(!Number.isSafeInteger(couponCents)||couponCents<0)throw new StockShortage("Kupon tutarı geçersiz.");
    couponCents=Math.min(remaining,couponCents);remaining-=couponCents;
  }
  const points=Number(spentPoints||0);
  if(!Number.isSafeInteger(points)||points<0)throw new StockShortage("Geçersiz puan kullanımı.");
  if(points) {
    const customer=sqlite.prepare("SELECT loyalty_points FROM customers WHERE id=?").get(Number(customerId)) as {loyalty_points:number}|undefined;
    if(!customer||points>Math.max(0,customer.loyalty_points))throw new StockShortage("Müşteri puan bakiyesi yetersiz.");
    pointsCents=Math.round(points*Number(getSettingsSync()["loyalty.point_value_tl"]||0.5)*100);
    if(!Number.isSafeInteger(pointsCents)||pointsCents<=0||pointsCents>remaining)throw new StockShortage("Puan tutarı kalan toplamı aşıyor.");
    remaining-=pointsCents;
  }
  return {subtotal:subtotalCents/100,manualDiscount:manualCents/100,promotionDiscount:promoCents/100,couponDiscount:couponCents/100,pointsDiscount:pointsCents/100,grandTotal:remaining/100,promotions:promo.appliedPromotions,lines};
}
