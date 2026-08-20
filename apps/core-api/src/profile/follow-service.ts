import { DomainError } from "../errors.js";
import type { FollowDirectory, FederationService } from "../federation/service.js";

import type { FollowRepository, FollowState } from "./follows.js";
import type { ProfileRepository } from "./repository.js";

/**
 * Il follow, che attraversa le istanze ([ADR 0022]).
 *
 * Due metà in due posti, e non è la stessa riga scritta due volte:
 * `followers` autorizza e sta in casa di chi è seguito, `following` serve ad
 * andare a prendere e sta in casa di chi segue. Da cui la proprietà che ADR
 * 0018 prometteva: **togliere un follower ha effetto subito**, perché la lista
 * che decide è qui e non c'è nessuna revoca da spedire a nessuno.
 *
 * Che le due metà possano divergere non è un difetto da riparare con una
 * sincronizzazione. Se l'altra parte ti ha tolto, te ne accorgi alla prima
 * lettura che fallisce — ed è il comportamento giusto, non un ritardo.
 */

export interface FollowServiceOptions {
  follows: FollowRepository;
  profiles: ProfileRepository;
  federation: FederationService;
  /**
   * La chiave di questa istanza, se la rete è accesa.
   *
   * Serve a riconoscere il caso locale: seguire un vicino di casa non deve
   * passare dalla rete, e soprattutto non deve **dipendere** dalla rete. Un
   * quartiere che smette di funzionare perché la federazione è spenta sarebbe
   * il contrario di ciò che questo prodotto è.
   */
  selfKey?: () => string | undefined;
  now?: () => Date;
}

export class FollowService implements FollowDirectory {
  readonly #follows: FollowRepository;
  readonly #profiles: ProfileRepository;
  readonly #federation: FederationService;
  readonly #selfKey: () => string | undefined;
  readonly #now: () => Date;

  public constructor(options: FollowServiceOptions) {
    this.#follows = options.follows;
    this.#profiles = options.profiles;
    this.#federation = options.federation;
    this.#selfKey = options.selfKey ?? (() => undefined);
    this.#now = options.now ?? (() => new Date());
  }

  // --- Quello che arriva dalla rete ---------------------------------------

  public hasAcceptedWith(instanceKey: string): boolean {
    return this.#follows.hasAcceptedWith(instanceKey);
  }

  /**
   * Registra un follow in arrivo, o non registra niente.
   *
   * `undefined` sta per «non esiste» **e** per «non è raggiungibile», con la
   * stessa risposta: distinguerli farebbe del follow un modo di indovinare i
   * nomi di un'istanza, che è ciò che ADR 0020 §1 vieta ai profili.
   *
   * **La presenza governa chi esiste fuori, non chi esiste dentro.** Da fuori,
   * `non_presente` vuol dire irraggiungibile e la richiesta non trova nessuno;
   * da dentro no, ed è la stessa regola che `searchMembers` applica già alla
   * ricerca: chi condivide un'istanza si trova e si segue, e un vicino che non
   * ha mai aperto la schermata della rete non si è per questo nascosto ai
   * propri vicini. Fonderle avrebbe reso il feed di rete inutilizzabile per
   * chiunque non avesse cambiato un'impostazione che riguarda un'altra cosa.
   */
  public receiveFollow(input: {
    instance: string;
    follower: string;
    target: string;
  }): "in_attesa" | "accettato" | undefined {
    const profile = this.#profiles.findByUsername(input.target);

    if (profile === undefined) {
      return undefined;
    }

    if (!this.#isLocal(input.instance) && profile.presence === "non_presente") {
      return undefined;
    }

    const state: FollowState = profile.openFollows ? "accettato" : "in_attesa";
    const existing = this.#follows.findFollower({
      instance: input.instance,
      userId: profile.userId,
      username: input.follower,
    });

    // Rimandare un follow già accettato è come chi ha chiesto scopre di essere
    // stato accettato: non serve nessuna casella d'ingresso.
    if (existing !== undefined) {
      return existing.state;
    }

    return this.#follows.addFollower({
      at: this.#now().toISOString(),
      instance: input.instance,
      state,
      userId: profile.userId,
      username: input.follower,
    }).state;
  }

  public receiveUnfollow(input: { instance: string; follower: string; target: string }): void {
    const profile = this.#profiles.findByUsername(input.target);

    if (profile === undefined) {
      return;
    }

    const existing = this.#follows.findFollower({
      instance: input.instance,
      userId: profile.userId,
      username: input.follower,
    });

    if (existing !== undefined) {
      this.#follows.removeFollower(existing.id);
    }
  }

  // --- Quello che decide chi sta qui ---------------------------------------

  public listFollowers(userId: string): ReturnType<FollowRepository["listFollowers"]> {
    return this.#follows.listFollowers(userId);
  }

  public listFollowing(userId: string): ReturnType<FollowRepository["listFollowing"]> {
    return this.#follows.listFollowing(userId);
  }

  /** Accetta un follower in attesa. Il diretto interessato lo scopre richiedendo. */
  public accept(userId: string, id: string): void {
    const found = this.#follows.listFollowers(userId).find((row) => row.id === id);

    if (found === undefined) {
      throw new DomainError("follower_inesistente", "Questa richiesta non esiste.", 404);
    }

    this.#follows.decideFollower(id, "accettato", this.#now().toISOString());
  }

  /**
   * Toglie un follower, e ha effetto **adesso**.
   *
   * Non si avvisa nessuno di proposito: la lista che autorizza è questa, e una
   * notifica sarebbe una cortesia che non aggiunge niente alla revoca. L'altra
   * parte se ne accorge quando prova a leggere.
   */
  public removeFollower(userId: string, id: string): void {
    const found = this.#follows.listFollowers(userId).find((row) => row.id === id);

    if (found === undefined) {
      throw new DomainError("follower_inesistente", "Questo follower non esiste.", 404);
    }

    this.#follows.removeFollower(id);
  }

  /** Segue qualcuno su un'altra istanza. */
  public async follow(
    userId: string,
    username: string,
    input: { instanceKey: string; username: string },
  ): Promise<void> {
    const target = input.username.trim();
    const instance = input.instanceKey.trim();

    if (target.length === 0 || instance.length === 0) {
      throw new DomainError("richiesta_incompleta", "Serve chi seguire, e su quale istanza.", 400);
    }

    if (this.#isLocal(instance) && target === username) {
      throw new DomainError("segui_te_stesso", "Non puoi seguire te stesso.", 400);
    }

    const at = this.#now().toISOString();

    // La riga si scrive prima della chiamata: un'istanza spenta adesso non è
    // un follow che non è stato chiesto, ed è ciò che permette di riprovare.
    const saved = this.#follows.addFollowing({
      at,
      instance,
      state: "in_attesa",
      userId,
      username: target,
    });

    // Un vicino di casa non passa dalla rete: le due metà stanno nello stesso
    // database, e la stessa regola vale — chiuso mette in attesa, aperto entra.
    if (this.#isLocal(instance)) {
      const stato = this.receiveFollow({ follower: username, instance, target });

      if (stato === undefined) {
        this.#follows.removeFollowing(saved.id);

        throw new DomainError("profilo_inesistente", "Questo profilo non esiste.", 404);
      }

      if (stato === "accettato") {
        this.#follows.setFollowingState(saved.id, "accettato");
      }

      return;
    }

    const answer = await this.#federation.sendFollow(instance, target, username);

    if (answer === "accettato") {
      this.#follows.setFollowingState(saved.id, "accettato");
    }
  }

  #isLocal(instance: string): boolean {
    return instance === "locale" || instance === this.#selfKey();
  }

  public async unfollow(userId: string, username: string, id: string): Promise<void> {
    const found = this.#follows.listFollowing(userId).find((row) => row.id === id);

    if (found === undefined) {
      throw new DomainError("follow_inesistente", "Non stai seguendo questa persona.", 404);
    }

    // Prima a casa propria, perché è la parte che deve valere comunque; poi si
    // avvisa, perché è l'altra a doverti togliere dalla lista che autorizza.
    this.#follows.removeFollowing(id);

    if (this.#isLocal(found.targetInstance)) {
      this.receiveUnfollow({
        follower: username,
        instance: found.targetInstance,
        target: found.targetUsername,
      });

      return;
    }

    await this.#federation.sendUnfollow(found.targetInstance, found.targetUsername, username);
  }
}
