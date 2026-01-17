self.addEventListener("push", (event) => {
    const fallback = {
        title: "Deosil",
        body: "You have a new notification.",
        url: self.registration.scope,
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


    const iconUrl = new URL("../icons/pwa/icon-192.png", self.registration.scope).href;

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: iconUrl,
            badge: iconUrl,
            data: { url: payload.url },
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    const targetUrl = event.notification?.data?.url || self.registration.scope || "/";
    event.notification.close();
    event.waitUntil(clients.openWindow(targetUrl));
});
