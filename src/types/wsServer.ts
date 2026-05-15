type WS_REQUEST_TYPE =
  | "subscribe_event"
  | "unsubscribe_event"
  | "create_order"
  | "cancel_order"
  | "get_balance"
  | "add_balance"
  | "get_depth"
  | "get_orders"
  | "get_order"
  | "get_fills";

type WS_RESPONSE_TYPE =
  | "event_subscribed"
  | "event_unsubscribed"
  | "order_created"
  | "order_cancelled"
  | "balance"
  | "balance_updated"
  | "depth"
  | "orders"
  | "order"
  | "fills"
  | "error" // for anything that did not succeed
  | "depth_update_btc_usd"
  | "depth_update_sol_usd";

type WS_REQUEST = {
  type: WS_REQUEST_TYPE;
  payload: any; // here put zod inferred types
  rqeuestId: string;
};
type WS_RESPONSE = {
  type: WS_RESPONSE_TYPE;
  payload: any;
  requestId?: string;
};

export type { WS_REQUEST, WS_REQUEST_TYPE, WS_RESPONSE, WS_RESPONSE_TYPE };
