self.addEventListener("push", (event) => {
    const fallback = {
        title: "Deosil",
        body: "You have a new notification.",
        url: self.registration?.scope || "/",
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
    const targetUrl = event.notification?.data?.url || self.registration.scope || "/";
    event.notification.close();
    event.waitUntil(clients.openWindow(targetUrl));
});
