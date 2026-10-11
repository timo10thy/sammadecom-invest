import type { AccessTokenPayload } from "../modules/auth/authTokens.js";

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};