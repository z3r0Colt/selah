// The production packager replaces this version and adds emitted JS/CSS assets.
const CACHE='scripture-focus-v1';
const PRECACHE=['/','/manifest.webmanifest','/icon-192.png','/icon-512.png','/bibles/index.json','/plans/chronological.json'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE)
    .then(cache=>cache.addAll(PRECACHE))
    .then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith('scripture-focus-')&&key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin)return;
  // Chapter data is owned by the IndexedDB chapter repository. Keeping another
  // copy in CacheStorage would double translation storage and bypass its checks.
  if(/^\/bibles\/[^/]+\/\d+\/\d+\.json$/.test(url.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    // Only this worker version's cache may supply its shell and asset responses.
    const cached=await cache.match(event.request);
    if(cached)return cached;
    try{
      const response=await fetch(event.request);
      if(response.ok){
        // A cache write can fail under storage pressure without failing the read.
        try{await cache.put(event.request,response.clone())}catch{}
      }
      return response;
    }catch{
      if(event.request.mode==='navigate')return await cache.match('/')||Response.error();
      return Response.error();
    }
  })());
});
