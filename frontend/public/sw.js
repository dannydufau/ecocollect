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
    const url = event.notification.data.url;
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
            if (!list.length) return self.clients.openWindow(url);
            // navigate fails on a tab the worker does not control yet, the tab is still focused
            return list[0].focus().then((c) => c.navigate(url)).catch(() => {});
        }),
    );
});
