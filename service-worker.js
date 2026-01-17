self.addEventListener("push", (event) => {
    const fallback = {
        title: "Deosil",
        body: "You have a new notification.",
        url: "home.html",
    };

    let payload = { ...fallback };
    if (event.data) {
        try {
            const data = event.data.json();
            payload = { ...payload, ...data };
        } catch {
            payload.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: `${self.registration.scope}icons/pwa/icon-192.png`,
            badge: `${self.registration.scope}icons/pwa/icon-192.png`,
            data: { url: payload.url },
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const data = event.notification.data || {};
    const rawUrl = data.url || "home.html";

    event.waitUntil((async () => {
        // URL を正規化
        const normalized = String(rawUrl).replace(/^\/+/, "");
        // ターゲット URL を決定
        const targetUrl = new URL(normalized, self.registration.scope).toString();

        const all = await clients.matchAll({ type: "window", includeUncontrolled: true });

        for (const client of all) {
            if ("focus" in client) {
                await client.focus();
                if ("navigate" in client) await client.navigate(targetUrl);
                return;
            }
        }

        await clients.openWindow(targetUrl);
    })());
});
