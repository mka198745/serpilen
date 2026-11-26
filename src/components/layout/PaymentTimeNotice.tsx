import Link from "next/link";
/** Display before checkout; actual deadline comes from the server after stock allocation. */
export function PaymentTimeNotice() {
 return <div className="text-xs leading-relaxed text-amber-950 bg-amber-50 border border-amber-200 rounded-xl p-3" role="note">
  <strong>Havale/EFT ödeme süresi: 24 saat.</strong> Sipariş oluşturulup stok ayrıldığında süre başlar; banka ödeme onayının bu süre içinde tamamlanması gerekir. Süre dolarsa sipariş iptal edilir. Stok bekleyen siparişlerde henüz ödeme yapmayın; stok ayrıldığında süre başlar. E-posta ulaşmayabilir, <Link href="/siparis-takip" className="underline font-bold">Sipariş Takip</Link> sayfasını kontrol edin veya mağazayla görüşün.
 </div>;
}
