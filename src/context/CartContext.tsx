"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Product, ProductVariant } from "@/lib/types";

export interface CartItem {
  productId: number;
  variantId: number | null;
  name: string;
  variantName: string | null;
  sku: string;
  barcode: string | null;
  price: number;
  quantity: number;
  imageUrl: string | null;
  unit: string;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, variant?: ProductVariant | null, quantity?: number) => void;
  removeFromCart: (productId: number, variantId?: number | null) => void;
  updateQuantity: (productId: number, variantId: number | null, quantity: number) => void;
  clearCart: () => void;
  cartCount: number;
  subtotal: number;
  discountTotal: number;
  appliedCoupon: string | null;
  applyCoupon: (code: string) => Promise<{ success: boolean; message: string }>;
  removeCoupon: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  wishlist: number[];
  toggleWishlist: (productId: number) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [discountTotal, setDiscountTotal] = useState<number>(0);
  const [wishlist, setWishlist] = useState<number[]>([]);

  // Load from local storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ipek_cart");
      if (saved) setItems(JSON.parse(saved));
      const savedWish = localStorage.getItem("ipek_wishlist");
      if (savedWish) setWishlist(JSON.parse(savedWish));
    } catch (e) {
      console.error("Cart localStorage error:", e);
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    try {
      localStorage.setItem("ipek_cart", JSON.stringify(items));
    } catch (e) {
      console.error(e);
    }
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem("ipek_wishlist", JSON.stringify(wishlist));
    } catch (e) {
      console.error(e);
    }
  }, [wishlist]);

  const addToCart = (product: Product, variant: ProductVariant | null = null, quantity: number = 1) => {
    setItems((prev) => {
      const vId = variant ? variant.id : null;
      const existingIndex = prev.findIndex(
        (it) => it.productId === product.id && it.variantId === vId
      );

      const price = variant ? Number(variant.retailPrice) : Number(product.retailPrice);
      const variantName = variant
        ? `${variant.colorName || ""} ${variant.size || ""}`.trim()
        : null;

      if (existingIndex > -1) {
        const next = [...prev];
        next[existingIndex].quantity += quantity;
        return next;
      } else {
        return [
          ...prev,
          {
            productId: product.id,
            variantId: vId,
            name: product.name,
            variantName,
            sku: variant?.sku || product.sku,
            barcode: variant?.barcode || product.barcode,
            price,
            quantity,
            imageUrl: variant?.imageUrl || product.imageUrl,
            unit: product.unit || "Adet",
          },
        ];
      }
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId: number, variantId: number | null = null) => {
    setItems((prev) =>
      prev.filter((it) => !(it.productId === productId && it.variantId === variantId))
    );
  };

  const updateQuantity = (productId: number, variantId: number | null, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId, variantId);
      return;
    }
    setItems((prev) =>
      prev.map((it) => {
        if (it.productId === productId && it.variantId === variantId) {
          return { ...it, quantity };
        }
        return it;
      })
    );
  };

  const clearCart = () => {
    setItems([]);
    setAppliedCoupon(null);
    setDiscountTotal(0);
  };

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const applyCoupon = async (code: string) => {
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, cartTotal: subtotal }),
      });
      const data = await res.json();
      if (data.success) {
        setAppliedCoupon(code);
        setDiscountTotal(data.discountAmount || 0);
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.error || "Geçersiz kupon kodu." };
      }
    } catch {
      return { success: false, message: "Kupon doğrulanamadı." };
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setDiscountTotal(0);
  };

  const toggleWishlist = (productId: number) => {
    setWishlist((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        subtotal,
        discountTotal,
        appliedCoupon,
        applyCoupon,
        removeCoupon,
        isCartOpen,
        setIsCartOpen,
        wishlist,
        toggleWishlist,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
