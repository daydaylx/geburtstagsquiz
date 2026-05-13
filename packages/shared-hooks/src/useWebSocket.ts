import { type ClientToServerEventPayloadMap, serializeEnvelope } from "@quiz/shared-protocol";
import { getReconnectDelay } from "@quiz/shared-utils";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { getServerSocketUrl } from "./helpers.js";

/**
 * Maximalzahl aufeinanderfolgender Reconnect-Versuche ohne erfolgreiche
 * Verbindung. Nach diesem Schwellwert wird der Zustand "connectionerror"
 * gesetzt; automatische Reconnect-Versuche laufen weiter.
 */
const MAX_RECONNECT_ATTEMPTS = 6;

/**
 * Verfügbare WebSocket-Verbindungszustände.
 * - connecting:       Erste Verbindung wird aufgebaut (TCP-Handshake offen)
 * - connected:        Verbindung aktiv, CONNECTION_ACK vom Server empfangen
 * - reconnecting:     Verbindung verloren, automatischer Reconnect läuft
 * - connectionerror:  Mehrere Reconnects fehlgeschlagen, Reconnect läuft weiter
 * - disconnected:     Verbindung bewusst geschlossen (durch Client)
 */
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "connectionerror" | "disconnected";

export function useWebSocket() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const messageHandlerRef = useRef<((raw: string) => void) | null>(null);

  const getRecoverableConnectionState = () =>
    reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS ? "connectionerror" : "reconnecting";

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
    setConnectionState(getRecoverableConnectionState());
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
    socket.addEventListener("open", () => {
      if (socketRef.current === socket) {
        setConnectionState("connecting");
      }
    });
    socket.addEventListener("error", () => {
      if (socketRef.current === socket) {
        setConnectionState(getRecoverableConnectionState());
      }
    });
    socket.addEventListener("message", (e) => {
      const handler = messageHandlerRef.current;
      if (handler) handler(e.data as string);
    });
    socket.addEventListener("close", () => {
      if (socketRef.current === socket) {
        if (!shouldReconnectRef.current) return;
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
    shouldReconnectRef.current = false;
    clearReconnectTimer();
    const ws = socketRef.current;
    socketRef.current = null;
    setConnectionState("disconnected");
    ws?.close();
  });

  return { connectionState, sendEvent, onMessage, notifyConnected, closeSocket };
}
