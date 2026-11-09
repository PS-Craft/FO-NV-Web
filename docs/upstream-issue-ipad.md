iPad (A16, iPadOS 26.5.2, Safari): tab crashes at ~17 % "Compiling the game"

**Device:** iPad (A16, 6 GB RAM), iPadOS 26.5.2, Safari (also tried as a Home Screen web app)
**Site:** falloutnewvegasweb.com, quality *Low*, start *outside Doc Mitchell's house*

### What happens
Loading reaches about **17 %** ("Compiling the game"). Then Safari kills the tab and reloads the page. Adding `?debug` shows nothing more before the crash. I can't attach a Web Inspector because I don't have a Mac.

### Device capabilities (measured on this iPad)
- WebGPU available. Texture compression: **ASTC and ETC2 only, no BC**, so the CPU DXT decode path in `renderer.js` applies. `maxBufferSize` 1 GB, `maxTextureDimension2D` 16384.
- `crossOriginIsolated` true, SharedArrayBuffer and WASM SIMD available. Pointer Lock not available.
- Safari reports a desktop UA ("Macintosh"). `maxTouchPoints` is 5, so your phone/tablet detection still picks *Low*.

### Synthetic stress test (no game code, same device)
I generated WebAssembly modules shaped roughly like the recompiled exe: a shared imported memory, ~100 MB of code, a few functions of 1–7 MB, and up to 64 workers instantiating the same `WebAssembly.Module`.

| Test | Result |
|---|---|
| Shared memory 1/2/3 GB; 1/1.5/2 GB actually touched | ok |
| Compile 25/50/100 MB module | ok (≤ 0.7 s, Safari compiles lazily) |
| Start 16/32/64 workers, instantiate shared module | ok |
| One 1/4/7 MB function, hot on 1 thread | ok |
| 100 MB with 8 large functions (1–4 MB), hot on 1/4/16 threads, no memory touched | ok |
| 100 MB small functions, 16 threads hot, 1 GB touched | ok |
| **2 GB (1 GB touched) + large functions + 16 threads hot** | **tab crash** (first run) |
| 3 GB (1.5 GB touched) + large functions + 64 threads hot | ok (a later run) |
| **Large functions + 4 threads hot + 1 GB touched** | **one worker never answered (> 180 s)** |

No single factor hits a hard limit. Failures are intermittent and happen when large functions are tiering up on several threads while a lot of memory is committed. That looks like memory pressure (jetsam) or a JSC tier-up stall rather than a fixed Safari limit. The real game is probably just over the edge on a 6 GB iPad.

The test page is at https://ps-craft.github.io/FO-NV-Web/ (section "Belastungstest", in German). Its source is at https://github.com/PS-Craft/FO-NV-Web/tree/main/src (`stress.ts`, `wasmgen.ts`).

### Ideas that might help on iPad (untested with the real build)
- Fewer pthreads for the mobile variant (`PTHREAD_POOL_SIZE` 64 → 16 or fewer, if the game's thread count allows).
- A smaller file-layer block cache on mobile (`kCacheMax` 256 MB).
- Less reserved memory, or memory growth, for the mobile variant.
- Splitting the largest lifted functions, if feasible, to reduce tier-up memory.

I'm planning to self-host a build from my own copy and can test iPad variants. I'm happy to report back if you add build switches for any of these.
