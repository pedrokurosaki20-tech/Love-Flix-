import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  addChatMessageToBridgeRoom,
  applyBridgeMediaUpdate,
  applyBridgePlaybackUpdate,
  bridgeRoomsStore,
  getOrCreateBridgeRoom,
  isBridgeAuthorized,
  isValidBridgeRoomId,
  registerBridgeBroadcaster,
  serializeBridgeRoom,
} from './externalRoomBridge.js';

interface BridgeSocketMeta {
  roomId: string;
  peerId: string;
  name: string;
  source: 'loveflix' | 'external';
  originUrl: string;
}

const roomSockets = new Map<string, Set<WebSocket>>();
const socketMeta = new WeakMap<WebSocket, BridgeSocketMeta>();

function broadcastRoomPayload(
  roomId: string,
  payload: Record<string, unknown>,
  excludePeerId?: string
): void {
  const sockets = roomSockets.get(roomId);
  if (!sockets || sockets.size === 0) return;
  const serialized = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (excludePeerId && socketMeta.get(ws)?.peerId === excludePeerId) continue;
    ws.send(serialized);
  }
}

export function attachExternalBridgeWebSocketServer(httpServer: HttpServer): void {
  registerBridgeBroadcaster(broadcastRoomPayload);

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const host = String(request.headers.host || 'localhost:3000');
      const parsed = new URL(request.url || '/', `http://${host}`);
      if (parsed.pathname !== '/api/bridge/ws') {
        return;
      }

      const originHeader = String(request.headers.origin || '');
      let sameOrigin = false;
      if (originHeader) {
        try {
          sameOrigin = new URL(originHeader).host.toLowerCase() === host.toLowerCase();
        } catch {
          sameOrigin = false;
        }
      }

      const queryKey = parsed.searchParams.get('key') || parsed.searchParams.get('token') || '';
      const queryRoom = parsed.searchParams.get('roomId') || undefined;

      if (!sameOrigin && !isBridgeAuthorized(queryKey, queryRoom)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, request) => {
    const proto = String(request.headers['x-forwarded-proto'] || 'http')
      .split(',')[0]
      .trim();
    const host = String(request.headers['x-forwarded-host'] || request.headers.host || 'localhost:3000')
      .split(',')[0]
      .trim();
    const originUrl = `${proto}://${host}`;

    ws.on('message', (rawBuf) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(rawBuf)) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'clock:ping') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'clock:pong',
              clientSendMs: Number(msg.clientSendMs) || Date.now(),
              serverNowMs: Date.now(),
            })
          );
        }
        return;
      }

      if (type === 'room:join') {
        const roomId = String(msg.roomId || '').trim();
        const peerId = String(msg.peerId || `peer_${Date.now()}`).trim().slice(0, 64);
        const name = String(msg.name || 'Sala Sincronizada').trim().slice(0, 40);
        const source: 'loveflix' | 'external' =
          msg.source === 'external' ? 'external' : 'loveflix';

        if (!isValidBridgeRoomId(roomId)) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Código de sala inválido.' }));
          }
          return;
        }

        const prevMeta = socketMeta.get(ws);
        if (prevMeta && prevMeta.roomId !== roomId) {
          roomSockets.get(prevMeta.roomId)?.delete(ws);
        }

        let set = roomSockets.get(roomId);
        if (!set) {
          set = new Set();
          roomSockets.set(roomId, set);
        }
        set.add(ws);
        socketMeta.set(ws, { roomId, peerId, name, source, originUrl });

        const room = getOrCreateBridgeRoom(roomId);
        const now = Date.now();
        room.peers.set(peerId, {
          peerId,
          name,
          avatarSrc: typeof msg.avatarSrc === 'string' ? msg.avatarSrc : undefined,
          source,
          joinedAtMs: room.peers.get(peerId)?.joinedAtMs || now,
          lastSeenMs: now,
        });
        room.updatedAtMs = now;

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'room:snapshot',
              room: serializeBridgeRoom(room),
            })
          );
        }

        broadcastRoomPayload(
          roomId,
          {
            type: 'peer:joined',
            roomId,
            peer: room.peers.get(peerId),
            peers: Array.from(room.peers.values()),
            serverNowMs: now,
          },
          peerId
        );
        return;
      }

      const meta = socketMeta.get(ws);
      if (!meta) return;
      const room = bridgeRoomsStore.get(meta.roomId);
      if (!room) return;

      const peerEntry = room.peers.get(meta.peerId);
      if (peerEntry) {
        peerEntry.lastSeenMs = Date.now();
      }

      if (type === 'room:leave') {
        roomSockets.get(meta.roomId)?.delete(ws);
        socketMeta.delete(ws);
        room.peers.delete(meta.peerId);
        broadcastRoomPayload(meta.roomId, {
          type: 'peer:left',
          roomId: meta.roomId,
          peerId: meta.peerId,
          peers: Array.from(room.peers.values()),
          serverNowMs: Date.now(),
        });
        return;
      }

      if (type === 'media:set' && msg.media && typeof msg.media === 'object') {
        void applyBridgeMediaUpdate({
          room,
          originUrl: meta.originUrl,
          rawMedia: msg.media as Record<string, unknown>,
          actorId: meta.peerId,
          actorName: meta.name,
          eventId: typeof msg.eventId === 'string' ? msg.eventId : undefined,
        });
        return;
      }

      if (type === 'playback:set' && msg.playback && typeof msg.playback === 'object') {
        applyBridgePlaybackUpdate({
          room,
          rawPlayback: msg.playback as Record<string, unknown>,
          actorId: meta.peerId,
          actorName: meta.name,
        });
        return;
      }

      if (type === 'chat:send' && msg.text) {
        const text = String(msg.text || '').trim();
        if (text) {
          const chatMsg = addChatMessageToBridgeRoom(room, {
            peerId: meta.peerId,
            name: meta.name,
            text,
          });
          room.seq += 1;
          room.updatedAtMs = chatMsg.createdAtMs;
          broadcastRoomPayload(meta.roomId, {
            type: 'chat:message',
            roomId: meta.roomId,
            message: chatMsg,
            seq: room.seq,
          });
        }
        return;
      }

      if (type === 'reaction:send' && msg.emoji) {
        const emoji = String(msg.emoji || '').slice(0, 14);
        broadcastRoomPayload(meta.roomId, {
          type: 'reaction:event',
          roomId: meta.roomId,
          reaction: {
            id: `rx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            peerId: meta.peerId,
            name: meta.name,
            emoji,
            createdAtMs: Date.now(),
          },
        });
        return;
      }
    });

    ws.on('close', () => {
      const meta = socketMeta.get(ws);
      if (!meta) return;
      socketMeta.delete(ws);

      const sockets = roomSockets.get(meta.roomId);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) {
          roomSockets.delete(meta.roomId);
        }
      }

      const stillConnectedSamePeer = Array.from(roomSockets.get(meta.roomId) || []).some(
        (other) => socketMeta.get(other)?.peerId === meta.peerId
      );
      if (stillConnectedSamePeer) return;

      const room = bridgeRoomsStore.get(meta.roomId);
      if (room) {
        room.peers.delete(meta.peerId);
        broadcastRoomPayload(meta.roomId, {
          type: 'peer:left',
          roomId: meta.roomId,
          peerId: meta.peerId,
          peers: Array.from(room.peers.values()),
          serverNowMs: Date.now(),
        });
      }
    });
  });
}
