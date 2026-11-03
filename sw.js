// Sawee Rxfill service worker (v6.12) — มีไว้ให้ติดตั้งเป็นแอป/ไอคอนบนเดสก์ท็อปได้เท่านั้น
// ไม่แคชไฟล์ใด ๆ (ทุกคำขอไปที่เครือข่ายตามปกติ) เพื่อไม่ให้ shared.js/HTML เก่าค้างจน version guard เตือน
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
