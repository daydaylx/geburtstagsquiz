import { useEffect, useEffectEvent, useRef, useState } from "react";

import { serializeEnvelope, type ClientToServerEventPayloadMap } from "@quiz/shared-protocol";
import { getReconnectDelay } from "@quiz/shared-utils";

import { getServerSocketUrl } from "../lib/helpers.js";

export type ConnectionState = "connecting" | "connected" | "reconnecting";

export function useWebSocket() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const messageHandlerRef = useRef<((raw: string) => void) | null>(null);

  const clearReconnectTimer = useEffectEvent(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  });

  const sendEvent = useEffectEvent(
    <TEvent extends keyof ClientToServerEventPayloadMap>(
      event: TEvent,
      payload: ClientToServerEventPayloadMap[TEvent],
    ) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(serializeEnvelope(event, payload));
      return true;
    },
  );

  const scheduleReconnect = useEffectEvent(() => {
    if (!shouldReconnectRef.current) return;
    clearReconnectTimer();
    const delay = getReconnectDelay(reconnectAttemptRef.current);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectAttemptRef.current += 1;
      connectSocket();
    }, delay);
  });

  const connectSocket = useEffectEvent(() => {
    clearReconnectTimer();
    const socket = new WebSocket(getServerSocketUrl());
    socketRef.current = socket;
    socket.addEventListener("message", (e) => {
      const handler = messageHandlerRef.current;
      if (handler) handler(e.data as string);
    });
    socket.addEventListener("close", () => {
      if (socketRef.current === socket) {
        setConnectionState("reconnecting");
        scheduleReconnect();
      }
    });
  });

  const onMessage = useEffectEvent((handler: (raw: string) => void) => {
    messageHandlerRef.current = handler;
  });

  const notifyConnected = useEffectEvent(() => {
    reconnectAttemptRef.current = 0;
    setConnectionState("connected");
  });

  useEffect(() => {
    connectSocket();
    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      socketRef.current?.close();
    };
  }, []);

  const closeSocket = useEffectEvent(() => {
    socketRef.current?.close();
  });

  return { connectionState, sendEvent, onMessage, notifyConnected, closeSocket };
}
