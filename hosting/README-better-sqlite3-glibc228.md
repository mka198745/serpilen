# better_sqlite3-linux-x64-glibc228.node

`better-sqlite3@13.0.3`'ün (npm tarball kaynak kodu, resmi sürüm) **glibc 2.28**
(CloudLinux 8) hedeflerine karşı elle derlenmiş `linux-x64` binding'i.

## Neden var?

Resmi paketteki `prebuilds/linux-x64.node` glibc >= 2.29/2.34 ister (`libm.so.6`
için `GLIBC_2.29`, libc için `GLIBC_2.34`). CloudLinux 8'in glibc 2.28'inde
`dlopen` şu hatayla ölür:

    Error: /lib64/libm.so.6: version `GLIBC_2.29' not found

Hosting'de `Run NPM Install` / node-gyp derlemesi olmadığı için bağlama burada,
Debian 12 üzerinde şu yöntemle derlendi:

1. Kaynak: `npm pack better-sqlite3@13.0.3` (`deps/sqlite3` amalgamation 3.53.4,
   derleme tanımları resmi `binding.gyp`/`defines.gypi` ile aynı).
2. glibc **2.28** header'ları: `bminor/glibc` GitHub mirror'ı, `glibc-2.28` etiketi,
   `make install-headers` ile `/tmp/glibc228/include`.
3. GCC 12 libstdc++ header'larının glibc >= 2.30 sembollerine bağımlılığını
   kaldırmak için `bits/c++config.h` sarmalayıcısı (`_GLIBCXX_USE_PTHREAD_*_CLOCKWAIT`,
   `_GLIBCXX_USE_PTHREAD_*_CLOCKLOCK`, `_GLIBCXX_USE_PTHREAD_RWLOCK_CLOCKLOCK` #undef)
   ve `-nostdinc` + elle dizin sıralaması (`#include_next` karışımını önler).
4. glibc 2.28'de bulunmayan 3 sembol `shim.c` ile sağlandı (`-Bsymbolic` ile yalnız
   bu DSO içinde bağlanır): `__libc_single_threaded=0`, `arc4random` (getrandom),
   `_dl_find_object` (dl_iterate_phdr ile).
5. Bağlama, SONAME'leri doğru stub kütüphanelerle yapıldı (`libc.so.6`,
   `libm.so.6`, `libpthread.so.0`, `libdl.so.2`) → **hiçbir versiyonlu sembol
   referansı kalmadı** (`readelf -V` boş); NEEDED yalnız bu 4 çekirdek kütüphane.
6. stat64/fstat64/lstat64/dlopen/... compat sembolleri (glibc >= 2.2) kullanılır —
   2.28'de hepsi mevcut.

Doğrulama: sembol düzeyi tarama (2.28'de olmayan isim yok) + FTS5/JSON1/WAL/
transaction/dosya roundtrip smoke testi (SQLite 3.53.4) + paketli hâlinde
(`prebuilds/linux-x64.node` değiştirilerek) yükleme testi.

## Hosting'de uygulama (CloudLinux 8 / glibc 2.28)

```bash
cd /home/serpilen/public_html/serpilen/.next/standalone/node_modules/better-sqlite3/prebuilds
cp linux-x64.node linux-x64.node.glibc234.bak
wget -O linux-x64.node \
  https://github.com/mka198745/serpilen/raw/arena/01a0a9cf-serpilen/hosting/better_sqlite3-linux-x64-glibc228.node
```

sonra panel -> Node.js App -> **Restart** ve `https://serpilencollection.com/api/health`
→ `{"ok":true,...}` bekleyin.

## Notlar

- Bu bir **build artifact**'tir; better-sqlite3 sürümü yükseltilirse yeniden derleyin.
- Dosya MIT lisanslı better-sqlite3 kaynaklarından üretilmiştir.
