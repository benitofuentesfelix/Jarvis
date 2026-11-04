// Action Gateway: the only path from JARVIS's decisions to the outside world.
// The AI never calls an integration directly; it requests an action, and the
// gateway checks the permission category, records an audit entry, and either
// executes, queues for approval, or refuses.

export type PermissionCategory = "automatica" | "autorizacion_inicial" | "por_accion";

export type ActionName =
  | "calendar.create_jarvis_block"
  | "calendar.move_jarvis_block"
  | "calendar.delete_jarvis_block"
  | "calendar.modify_personal_event"
  | "calendar.delete_personal_event"
  | "notion.write"
  | "notify.push"
  | "memory.save_operational"
  | "memory.save_personal_inferred"
  | "data.delete"
  | "message.send_as_user"
  | "payment.make"
  | "data.share"
  | "account.change_permissions";

export const ACTION_POLICY: Record<ActionName, { category: PermissionCategory; integration?: string; label: string }> = {
  "calendar.create_jarvis_block": { category: "automatica", integration: "google", label: "Crear bloque en el calendario JARVIS" },
  "calendar.move_jarvis_block": { category: "automatica", integration: "google", label: "Mover bloque del calendario JARVIS" },
  "calendar.delete_jarvis_block": { category: "automatica", integration: "google", label: "Quitar bloque del calendario JARVIS" },
  "calendar.modify_personal_event": { category: "por_accion", integration: "google", label: "Modificar un evento personal" },
  "calendar.delete_personal_event": { category: "por_accion", integration: "google", label: "Borrar un evento personal" },
  "notion.write": { category: "por_accion", integration: "notion", label: "Escribir en Notion" },
  "notify.push": { category: "automatica", integration: "push", label: "Enviar notificación" },
  "memory.save_operational": { category: "automatica", label: "Guardar memoria operativa" },
  "memory.save_personal_inferred": { category: "por_accion", label: "Guardar una inferencia sobre ti" },
  "data.delete": { category: "por_accion", label: "Borrar datos" },
  "message.send_as_user": { category: "por_accion", label: "Enviar un mensaje en tu nombre" },
  "payment.make": { category: "por_accion", label: "Realizar un pago" },
  "data.share": { category: "por_accion", label: "Compartir información privada" },
  "account.change_permissions": { category: "por_accion", label: "Cambiar permisos de una cuenta" },
};

export interface ActionRequest {
  name: ActionName;
  params: Record<string, unknown>;
  /** Who asked: an agent name or "user". */
  requestedBy: string;
  /** Short reason shown to the user. */
  reason: string;
}

export interface GatewayContext {
  /** Integrations the user has authorized (initial authorization). */
  authorized: Set<string>;
  /** Global kill switch: read-only mode. */
  readOnly: boolean;
  /** Integrations still in their one-week dry-run period. */
  dryRun: Set<string>;
  /** Id of the JARVIS-owned calendar; writes elsewhere are never automatic. */
  jarvisCalendarId?: string;
}

export type GatewayDecision =
  | { outcome: "execute"; dryRun: boolean }
  | { outcome: "needs_approval"; prompt: string }
  | { outcome: "refused"; why: string };

export function decide(req: ActionRequest, ctx: GatewayContext): GatewayDecision {
  const policy = ACTION_POLICY[req.name];
  if (!policy) return { outcome: "refused", why: "Acción desconocida." };

  if (ctx.readOnly && req.name !== "notify.push") {
    return { outcome: "refused", why: "JARVIS está en modo solo lectura." };
  }
  if (policy.integration && !ctx.authorized.has(policy.integration)) {
    return { outcome: "refused", why: `La integración «${policy.integration}» no está autorizada.` };
  }

  // Structural guard: "automatic" calendar actions only on the JARVIS calendar.
  if (req.name.startsWith("calendar.") && req.name.includes("jarvis_block")) {
    const cal = req.params.calendarId;
    if (!ctx.jarvisCalendarId || cal !== ctx.jarvisCalendarId) {
      return {
        outcome: "needs_approval",
        prompt: `JARVIS quiere ${policy.label.toLowerCase()} fuera de su calendario. ¿Lo permites? Motivo: ${req.reason}`,
      };
    }
  }

  if (policy.category === "por_accion") {
    return { outcome: "needs_approval", prompt: `${policy.label}. Motivo: ${req.reason}` };
  }
  const dry = policy.integration ? ctx.dryRun.has(policy.integration) : false;
  return { outcome: "execute", dryRun: dry };
}

export interface AuditEntry {
  at: string;
  action: ActionName;
  category: PermissionCategory;
  requestedBy: string;
  reason: string;
  decision: GatewayDecision["outcome"];
  dryRun?: boolean;
  params: Record<string, unknown>;
}

export function audit(req: ActionRequest, decision: GatewayDecision, now: Date): AuditEntry {
  return {
    at: now.toISOString(),
    action: req.name,
    category: ACTION_POLICY[req.name].category,
    requestedBy: req.requestedBy,
    reason: req.reason,
    decision: decision.outcome,
    dryRun: decision.outcome === "execute" ? decision.dryRun : undefined,
    params: req.params,
  };
}
