export type SessionContext = {
  userId: string;
  tenantId?: string;
  roles: string[];
};

export function hasRole(session: SessionContext | null | undefined, role: string) {
  return !!session && session.roles.includes(role);
}

export function requireRole(session: SessionContext | null | undefined, role: string) {
  if (!hasRole(session, role)) {
    throw new Error(`missing_required_role:${role}`);
  }
}
