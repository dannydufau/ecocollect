self.addEventListener("push", (event) => {
    let data;
    try {
        data = event.data.json();
    } catch {
        return;
    }
    const { title, body, url, tag, silent } = data;
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
            // the app already shows it in the open tab
            if (!silent && list.some((c) => c.focused)) return;
            return self.registration.showNotification(title, { body, tag, silent, data: { url } });
        }),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    // only our own pages (README 16.14), anything else or a missing url goes home
    const target = new URL(event.notification.data?.url ?? "/", self.location.origin);
    const url = target.origin === self.location.origin ? target.pathname + target.search + target.hash : "/";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
            if (!list.length) return self.clients.openWindow(url);
            // navigate fails on a tab the worker does not control yet, so open a new window instead of doing nothing
            return list[0].focus().then((c) => c.navigate(url)).catch(() => self.clients.openWindow(url));
        }),
    );
});
