import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

export function createSocketServer(httpServer: HttpServer, allowedOrigins: string[]): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join_checkout', ({ checkoutRequestId }: { checkoutRequestId: string }) => {
      if (checkoutRequestId) {
        socket.join(checkoutRequestId);
        console.log(`Socket ${socket.id} joined room ${checkoutRequestId}`);
      }
    });

    socket.on('join_kopokopo', ({ location }: { location: string }) => {
      if (location) {
        socket.join(location);
        console.log(`Socket ${socket.id} joined kopokopo room ${location}`);
      }
    });

    socket.on('disconnect', (reason: string) => {
      console.log('Socket disconnected:', socket.id, reason);
    });
  });

  return io;
}
