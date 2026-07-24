export interface JwtPayload {
  sub: number;
  username: string;
  iat?: number;
  exp?: number;
}

export interface SessionState {
  userId: number;
  username: string;
  // mid-game state - anything you want to survive an accidental disconnect
  scene?: string;
  position?: { x: number; y: number; z?: number };
  farmData?: Record<string, any>;
  data?: Record<string, any>;
  ts?: number;
  lastSavedAt?: number;
  [k: string]: any;
}
