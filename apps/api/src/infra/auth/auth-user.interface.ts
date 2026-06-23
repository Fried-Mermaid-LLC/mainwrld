// Shape attached to `req.user` by AuthGuard after verifying the Firebase ID
// token. `username`/`admin`/`banned` come from custom claims set server-side.
export interface AuthUser {
  uid: string;
  email?: string;
  username?: string;
  admin: boolean;
  banned: boolean;
}
