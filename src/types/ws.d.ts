import "ws";
declare module "ws" {
  interface WebSocket {
    user: { id: string; username: string };
  }
}
