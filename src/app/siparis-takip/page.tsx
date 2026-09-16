import React from "react";
import { OrderTrackClient } from "./OrderTrackClient";

export const metadata = {
  title: "Sipariş Takibi | İpek Tuhafiye",
  description: "Sipariş numaranız ve telefonunuzla kargo ve sipariş durumunuzu anlık takip edin.",
};

export default function OrderTrackPage() {
  return <OrderTrackClient />;
}
