import { DomainError } from "../errors.js";
import type { FollowDirectory } from "../federation/service.js";

import { coniaProva, improntaProva } from "./follows.js";
import type { FollowRepository, FollowState, FollowerRecord } from "./follows.js";
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

/**
 * Quello che il follow chiede alla rete, e nient'altro (`ARCHITECTURE` §3).
 *
 * Dichiarato qui come porta invece di prendere l'intero servizio di
 * federazione: chi segue non ha bisogno di sapere che esistono collegamenti,
 * ricerche o presentazioni, e una dipendenza stretta è anche l'unico modo di
 * provare da questa parte ciò che oggi si prova solo dall'altra.
 */
export interface FollowNetwork {
  sendFollow(instanceKey: string, target: string, follower: string): Promise<EsitoFollow>;
  sendUnfollow(instanceKey: string, target: string, follower: string): Promise<void>;
}

/**
 * Che cosa torna dall'altra istanza quando le si chiede di seguire.
 *
 * `prova` c'è solo con `accettato`, ed è il segreto per coppia di
 * [ADR 0023] §2: si conserva e si presenta per leggere: senza, un follow
 * accettato resta una relazione che non apre niente.
 */
export type EsitoFollow = { stato: FollowState; prova?: string } | undefined;

export interface FollowServiceOptions {
  follows: FollowRepository;
  profiles: ProfileRepository;
  federation: FollowNetwork;
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
  readonly #federation: FollowNetwork;
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
  public receiveFollow(input: { instance: string; follower: string; target: string }): EsitoFollow {
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
      return this.#conProva(existing, existing.state);
    }

    const nato = this.#follows.addFollower({
      at: this.#now().toISOString(),
      instance: input.instance,
      state,
      userId: profile.userId,
      username: input.follower,
    });

    return this.#conProva(nato, nato.state);
  }

  /**
   * Consegna la prova della coppia, e la conia adesso ([ADR 0023] §2).
   *
   * Si conia al momento di consegnarla e non al momento di accettare, per una
   * ragione che viene dal modo in cui si conserva: chi verifica tiene solo
   * l'hash, quindi il segreto in chiaro esiste **una volta sola**, mentre lo si
   * risponde. Coniarlo prima vorrebbe dire averne uno che non può più uscire.
   *
   * Da cui, gratis, il recupero: chi ha perso la propria — un ripristino da un
   * backup vecchio — richiede `segui` e ne riceve una nuova, e la precedente
   * smette di valere nello stesso istante. Un solo detentore, nessuna
   * ambiguità.
   *
   * In casa non se ne conia nessuna: le due metà stanno nello stesso database,
   * e una credenziale per parlare con sé stessi non prova niente a nessuno.
   */
  #conProva(riga: FollowerRecord, stato: FollowState): EsitoFollow {
    if (stato !== "accettato" || this.#isLocal(riga.followerInstance)) {
      return { stato };
    }

    const prova = coniaProva();

    this.#follows.setFollowerGrant(riga.id, improntaProva(prova));

    return { prova, stato };
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

  /**
   * Accetta un follower in attesa.
   *
   * Da fuori, il diretto interessato lo scopre richiedendo: le due metà stanno
   * su due macchine che si vedono a intermittenza, e nessuna notifica cambia
   * questo. **In casa no**: le due metà stanno nello stesso database, non c'è
   * niente di asincrono da riconciliare, e lasciarle divergere vorrebbe dire
   * solo mostrare a chi ha chiesto un'attesa che è già finita.
   */
  public accept(userId: string, id: string): void {
    const found = this.#follows.listFollowers(userId).find((row) => row.id === id);

    if (found === undefined) {
      throw new DomainError("follower_inesistente", "Questa richiesta non esiste.", 404);
    }

    this.#follows.decideFollower(id, "accettato", this.#now().toISOString());
    this.#allineaMetaLocale(found, "accettato");
  }

  /**
   * L'altra metà di un follow **locale**, tenuta allineata.
   *
   * Non tocca niente quando il follower sta altrove: lì la divergenza è il
   * comportamento voluto da ADR 0022, e questa funzione esce subito.
   */
  #allineaMetaLocale(
    riga: { userId: string; followerInstance: string; followerUsername: string },
    stato: FollowState | "via",
  ): void {
    if (!this.#isLocal(riga.followerInstance)) {
      return;
    }

    const chiSegue = this.#profiles.findByUsername(riga.followerUsername);
    const seguito = this.#profiles.find(riga.userId);

    if (chiSegue === undefined || seguito === undefined) {
      return;
    }

    const altra = this.#follows.findFollowing({
      instance: riga.followerInstance,
      userId: chiSegue.userId,
      username: seguito.username,
    });

    if (altra === undefined) {
      return;
    }

    if (stato === "via") {
      this.#follows.removeFollowing(altra.id);
      return;
    }

    this.#follows.setFollowingState(altra.id, stato);
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
    // In casa la revoca è visibile subito anche a chi seguiva: la sua riga non
    // ha più niente da autorizzare, e tenerla direbbe una cosa falsa.
    this.#allineaMetaLocale(found, "via");
  }

  /**
   * Segue qualcuno, qui o su un'altra istanza.
   *
   * **Chiedere due volte è previsto, ed è il modo in cui si scopre di essere
   * stati accettati.** Fuori casa le due metà stanno su due macchine che si
   * vedono a intermittenza: chi accetta non spedisce niente a nessuno — è la
   * proprietà di ADR 0022, non una dimenticanza — quindi la riga di chi ha
   * chiesto resta «in attesa» finché non richiede. La chiamata è idempotente
   * per costruzione: la riga esiste già e non se ne aggiunge un'altra, e
   * dall'altra parte `receiveFollow` restituisce lo stato che c'è invece di
   * creare una seconda richiesta.
   *
   * Ne consegue una cosa da non trasformare in un ciclo automatico: un follow
   * **rifiutato** non lascia traccia — rifiutare cancella la riga — quindi un
   * richiamo periodico lo farebbe rinascere all'infinito. Il richiamo resta un
   * gesto di chi ha chiesto, che è la stessa cosa che fa chi ripreme «segui».
   */
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
      const esito = this.receiveFollow({ follower: username, instance, target });

      if (esito === undefined) {
        this.#follows.removeFollowing(saved.id);

        throw new DomainError("profilo_inesistente", "Questo profilo non esiste.", 404);
      }

      if (esito.stato === "accettato") {
        this.#follows.setFollowingState(saved.id, "accettato");
      }

      return;
    }

    const esito = await this.#federation.sendFollow(instance, target, username);

    if (esito?.stato !== "accettato") {
      return;
    }

    this.#follows.setFollowingState(saved.id, "accettato");

    // La prova arriva con il sì e si conserva subito: è ciò che trasforma un
    // follow accettato in una bacheca leggibile ([ADR 0023] §2). Se manca —
    // un'istanza più vecchia, che quel campo non lo scrive — il follow vale
    // lo stesso e la lettura non parte: richiedere è il modo di rimediare.
    if (esito.prova !== undefined) {
      this.#follows.setFollowingGrant(saved.id, esito.prova);
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
