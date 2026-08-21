import { DomainError } from "../errors.js";
import type { ProfileDirectory, RemoteSearchHit } from "../federation/service.js";
import { MAX_BIO_LENGTH } from "../federation/protocol.js";
import type { ProfiloRemoto, ProfiloSintetico } from "../federation/protocol.js";

import type { Presence, ProfileRecord, ProfileRepository } from "./repository.js";

/**
 * The person's face, and how far it reaches.
 *
 * [ADR 0018] makes presence a choice of the **person**, not of the instance,
 * with three states and the narrowest as the default:
 *
 * - `non_presente` — exists only inside this instance. **The default**, because
 *   nothing becomes visible outside by omission (PRODUCT_VISION §2);
 * - `presente_privato` — on EstiaNet and searchable; opening the profile shows
 *   a follow request, not the posts, until the person accepts;
 * - `presente_pubblico` — on EstiaNet and searchable; opening the profile shows
 *   the posts.
 *
 * Search lists **both** present states. Being searchable and showing posts are
 * different permissions: collapsing them into «findable or not» is how a
 * private profile disappears from discovery instead of only gating its posts.
 */

export interface ProfileView {
  username: string;
  displayName: string;
  bio: string;
  presence: Presence;
  openFollows: boolean;
}

export interface ProfileServiceOptions {
  profiles: ProfileRepository;
  now?: () => Date;
}

export class ProfileService implements ProfileDirectory {
  readonly #profiles: ProfileRepository;
  readonly #now: () => Date;

  public constructor(options: ProfileServiceOptions) {
    this.#profiles = options.profiles;
    this.#now = options.now ?? (() => new Date());
  }

  public read(userId: string): ProfileView {
    const record = this.#profiles.find(userId);

    if (record === undefined) {
      throw new DomainError("profilo_inesistente", "Questo profilo non esiste.", 404);
    }

    return toView(record);
  }

  public update(
    userId: string,
    input: { bio: string; presence: Presence; openFollows: boolean },
  ): ProfileView {
    const bio = input.bio.trim();

    if (bio.length > MAX_BIO_LENGTH) {
      throw new DomainError(
        "bio_troppo_lunga",
        `La descrizione non può superare ${String(MAX_BIO_LENGTH)} caratteri.`,
        400,
      );
    }

    if (this.#profiles.find(userId) === undefined) {
      throw new DomainError("profilo_inesistente", "Questo profilo non esiste.", 404);
    }

    this.#profiles.save({
      bio,
      openFollows: input.openFollows,
      presence: input.presence,
      updatedAt: this.#now().toISOString(),
      userId,
    });

    return this.read(userId);
  }

  /** Members of this instance. Presence does not apply at home — see the repository. */
  public searchLocal(term: string, limit = 20): ProfileView[] {
    return this.#profiles.searchMembers(term, limit).map(toView);
  }

  /**
   * La persona dietro un nome, per la sua pagina.
   *
   * Restituisce il record intero e non una vista: chi chiama deve poter
   * contare i follower, e per farlo serve l'identificatore — che nella vista
   * non c'è, e non deve esserci, perché è un dato interno che il browser non
   * usa mai.
   *
   * Nessun filtro di presenza: questo è lo sguardo di chi condivide l'istanza,
   * e la presenza governa il fuori.
   */
  public findMember(username: string): ProfileRecord | undefined {
    return this.#profiles.findByUsername(username);
  }

  // --- La porta verso la rete ---------------------------------------------

  /**
   * A named profile, for a connected instance.
   *
   * Returns nothing for somebody who is not in the network **and** for somebody
   * who does not exist, because the caller must not be able to tell those apart
   * (ADR 0020 §1).
   */
  public byUsername(username: string): ProfiloRemoto | undefined {
    const record = this.#profiles.findByUsername(username);

    if (record === undefined || record.presence === "non_presente") {
      return undefined;
    }

    return {
      bio: record.bio,
      nome: record.displayName,
      pubblico: record.presence === "presente_pubblico",
      utente: record.username,
    };
  }

  /**
   * Chiunque sia in EstiaNet. Privato o pubblico decide i post sul profilo, non
   * l'elenco: la ricerca elenca entrambi (ADR 0018).
   */
  public searchPublic(term: string, limit: number): ProfiloSintetico[] {
    return this.#profiles
      .searchPublic(term, limit)
      .map((record) => ({ nome: record.displayName, utente: record.username }));
  }

  /**
   * Gli stessi profili in EstiaNet, ma per i propri membri.
   *
   * Serve alla ricerca in modalità rete, e passa **dallo stesso metodo del
   * repository** che risponde alle istanze remote: di sé si vede esattamente
   * quello che vedrebbe un'altra istanza, e non per convenzione ma per
   * costruzione. La differenza con `searchPublic` è solo la forma — qui serve
   * il profilo intero, là il minimo che basta a fare clic.
   */
  public searchLocalPublic(term: string, limit = 20): ProfileView[] {
    return this.#profiles.searchPublic(term, limit).map(toView);
  }
}

function toView(record: ProfileRecord): ProfileView {
  return {
    bio: record.bio,
    displayName: record.displayName,
    openFollows: record.openFollows,
    presence: record.presence,
    username: record.username,
  };
}

export type { RemoteSearchHit };
