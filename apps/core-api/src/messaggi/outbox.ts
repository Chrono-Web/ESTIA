import type { FederationService } from "../federation/service.js";
import type { FollowRepository } from "../profile/follows.js";
import type { MessaggiService } from "./service.js";

export interface OutboxDrainerLogger {
  info(details: Record<string, unknown>, message: string): void;
  warn(details: Record<string, unknown>, message: string): void;
  error(details: Record<string, unknown>, message: string): void;
}

export interface OutboxDrainerOptions {
  messaggi: MessaggiService;
  federation: FederationService;
  follows?: FollowRepository | undefined;
  intervalMs?: number | undefined;
  logger?: OutboxDrainerLogger | undefined;
}

/**
 * Background worker che drena la tabella `messaggi_in_uscita` verso le istanze remote (ADR 0029).
 */
export class OutboxDrainer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly messaggi: MessaggiService;
  private readonly federation: FederationService;
  private readonly follows?: FollowRepository | undefined;
  private readonly intervalMs: number;
  private readonly logger?: OutboxDrainerLogger | undefined;

  constructor(options: OutboxDrainerOptions) {
    this.messaggi = options.messaggi;
    this.federation = options.federation;
    this.follows = options.follows;
    this.intervalMs = options.intervalMs ?? 30_000;
    this.logger = options.logger;
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.drain();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async drain(): Promise<{ sent: number; failed: number }> {
    if (this.running) return { sent: 0, failed: 0 };
    this.running = true;

    let sent = 0;
    let failed = 0;

    try {
      const pending = this.messaggi.listMessaggiInUscita(20);
      for (const item of pending) {
        try {
          const following = this.follows?.findFollowing({
            userId: item.senderUserId,
            instance: item.destinatarioChiave,
            username: item.destinatarioUsername,
          });
          const prova = following?.grant ?? "prova-consegna";

          const ok = await this.federation.inviaBusta(
            item.destinatarioChiave,
            { nome: item.destinatarioUsername, prova },
            {
              busta: item.busta,
              conversazioneId: item.conversazioneId,
              createdAt: item.createdAt,
              da: item.senderUsername,
              destinatario: item.destinatarioUsername,
              messaggioId: item.messaggioId,
              senderDeviceId: item.senderDeviceId,
            },
          );

          if (ok) {
            this.messaggi.rimuoviMessaggioInUscita(item.id);
            sent++;
          } else {
            this.messaggi.fallisciTentativoMessaggioInUscita(item.id, item.tentativi);
            failed++;
          }
        } catch {
          this.messaggi.fallisciTentativoMessaggioInUscita(item.id, item.tentativi);
          failed++;
        }
      }
    } finally {
      this.running = false;
    }

    return { sent, failed };
  }
}
