"use strict";

const CACHE_NAME = "neuroreader-static-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./accessibility.html",
  "./kids.html",
  "./dashboard.html",
  "./formula-builder.html",
  "./formula.min.js",
  "./features.js",
  "./adaptive.js",
  "./manifest.webmanifest",
  "./fonts/NeuroReaderFont-Regular.woff2",
  "./fonts/NeuroReaderFont-Regular.ttf",
  "./icons/neuroreader-192.svg",
  "./icons/neuroreader-512.svg",
  "./icons/neuroreader-brain.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const isNavigation = request.mode === "navigate";
  const isStatic = ASSETS.some((asset) => new URL(asset, self.location.href).pathname === url.pathname);
  event.respondWith(caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response.ok && isStatic) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => isNavigation ? caches.match("./index.html") : Response.error());
  }));
});
