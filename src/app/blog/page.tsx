import React from "react";
import Link from "next/link";
import { db } from "@/db";
import { blogPosts } from "@/db/schema";
import { desc } from "drizzle-orm";
import { BookOpen, Calendar, User, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BlogListPage() {
  const posts = await db.select().from(blogPosts).orderBy(desc(blogPosts.id));

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold mb-2">
          <BookOpen className="w-3.5 h-3.5 text-amber-700" />
          <span>Atölye & Malzeme Rehberi</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
          Dikiş, Fermuar & Tuhafiye Bilgi Bankası
        </h1>
        <p className="text-stone-500 text-sm mt-1 max-w-2xl">
          Kumaş seçiminden doğru dikiş makinesi iğnesi ve iplik kombinasyonlarına kadar pratik atölye rehberleri.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {posts.map((post) => (
          <article
            key={post.id}
            className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-xs hover:shadow-lg transition flex flex-col justify-between"
          >
            <div>
              <div className="aspect-16/9 bg-stone-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.imageUrl || "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=600"}
                  alt={post.title}
                  className="w-full h-full object-cover hover:scale-105 transition duration-500"
                />
              </div>
              <div className="p-6 space-y-2">
                <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full">
                  {post.category}
                </span>
                <h3 className="font-bold text-base text-stone-900 line-clamp-2 leading-snug">
                  {post.title}
                </h3>
                <p className="text-xs text-stone-500 line-clamp-3 leading-relaxed">
                  {post.excerpt}
                </p>
              </div>
            </div>

            <div className="p-6 pt-0 border-t border-stone-100 mt-4 flex items-center justify-between text-xs">
              <span className="text-stone-400 font-medium">{post.author}</span>
              <Link
                href={`/blog/${post.slug}`}
                className="font-bold text-amber-800 hover:text-amber-900 flex items-center gap-1"
              >
                <span>Devamını Oku</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
