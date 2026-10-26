#!/bin/sh
# SSE Stub which sends notifications every 2 seconds
# tests whether there is no buffering on the Caddy server
# and whether the connection keeps alive

while true; do
    (
        printf 'HTTP/1.1 200 OK\r\n'
        printf 'Content-Type: text/event-stream\r\n'
        printf 'Cache-Control: no-cache\r\n'
        printf '\r\n' #marks header ended
        while true; do
            printf 'event: notification\n'
            printf 'data: {"createdAt":"%s"}\n\n' "$(date +"%F %T")"
            sleep 2
        done
    ) | nc -l -p 80
done