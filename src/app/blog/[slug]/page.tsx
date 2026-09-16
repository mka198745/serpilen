import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { blogPosts, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ArrowLeft, User, Calendar, Tag, ShoppingBag } from "lucide-react";

export const dynamic = "force-dynamic";

interface BlogPostPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;

  const [post] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);

  if (!post) {
    notFound();
  }

  const suggestedProducts = await db.select().from(products).limit(3);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 hover:underline"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Tüm Rehber Makalelerine Dön</span>
      </Link>

      <div className="space-y-4">
        <span className="text-xs font-black uppercase text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
          {post.category}
        </span>
        <h1 className="text-2xl sm:text-4xl font-black text-stone-900 tracking-tight leading-tight">
          {post.title}
        </h1>
        <div className="flex items-center gap-4 text-xs text-stone-400">
          <span className="flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-stone-500" />
            <span>Yazar: <strong>{post.author}</strong></span>
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-stone-500" />
            <span>{new Date(post.publishedAt).toLocaleDateString("tr-TR")}</span>
          </span>
        </div>
      </div>

      <div className="aspect-16/9 bg-stone-100 rounded-3xl overflow-hidden border border-stone-200 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.imageUrl || "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=1000"}
          alt={post.title}
          className="w-full h-full object-cover"
        />
      </div>

      <div className="prose prose-stone max-w-none bg-white p-8 rounded-3xl border border-stone-200 shadow-xs text-sm leading-relaxed space-y-4 text-stone-700">
        <p className="font-semibold text-stone-900 text-base">{post.excerpt}</p>
        <div className="border-t border-stone-100 pt-4 whitespace-pre-line">
          {post.content}
        </div>
      </div>

      {/* Recommended Products */}
      <div className="bg-stone-50 p-6 rounded-3xl border border-stone-200 space-y-4">
        <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-amber-800" />
          <span>Bu Yazıyla İlgili Malzemeler</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {suggestedProducts.map((p) => (
            <Link
              key={p.id}
              href={`/urun/${p.slug}`}
              className="p-3 bg-white rounded-xl border border-stone-200 hover:border-amber-700 shadow-xs transition block"
            >
              <h4 className="font-bold text-xs text-stone-900 truncate">{p.name}</h4>
              <span className="text-xs font-black text-amber-900 mt-1 block">
                {Number(p.retailPrice).toFixed(2)} TL
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
