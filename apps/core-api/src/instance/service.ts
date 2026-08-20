import { randomUUID } from "node:crypto";

import {
  dataAtRisk,
  type DataDurability,
  type InstancePublicView,
  type InstanceSetupRequest,
  type InstanceSetupResponse,
} from "@estia/contracts";

import type { Transactor } from "../db/database.js";
import { DomainError } from "../errors.js";
import { secretsMatch } from "../identity/tokens.js";
import type { IdentityService } from "../identity/service.js";
import type { InstanceRecord, InstanceRepository } from "./repository.js";

export interface InstanceServiceOptions {
  repository: InstanceRepository;
  identity: IdentityService;
  transaction: Transactor;
  publicKey: string;
  setupToken: string;
  now?: () => Date;
  /**
   * Whether the data directory survives an image update. Shown only while the
   * instance is unconfigured: at that moment the only person looking is the one
   * about to trust it with a community's photographs, and telling them before
   * is worth more than telling them after.
   */
  durability?: DataDurability;
  /**
   * Lets the setup through even when the data will not survive an update. For
   * someone trying ESTIA out for ten minutes, and for nobody else (ADR 0019).
   */
  allowEphemeralData?: boolean;
}

export class InstanceService {
  private readonly repository: InstanceRepository;
  private readonly identity: IdentityService;
  private readonly transaction: Transactor;
  private readonly publicKey: string;
  private readonly setupToken: string;
  private readonly now: () => Date;
  private readonly durability: DataDurability | undefined;
  private readonly allowEphemeralData: boolean;

  public constructor(options: InstanceServiceOptions) {
    this.durability = options.durability;
    this.allowEphemeralData = options.allowEphemeralData ?? false;
    this.repository = options.repository;
    this.identity = options.identity;
    this.transaction = options.transaction;
    this.publicKey = options.publicKey;
    this.setupToken = options.setupToken;
    this.now = options.now ?? ((): Date => new Date());
  }

  /**
   * What a prospective member is allowed to see before being admitted.
   * Deliberately excludes the member list (PRODUCT_VISION §5.1).
   */
  public getPublicView(): InstancePublicView {
    const instance = this.repository.find();

    if (instance === undefined) {
      return {
        memberCount: 0,
        publicKey: this.publicKey,
        state: "unconfigured",
        ...(this.durability === undefined ? {} : { dataDurability: this.durability }),
      };
    }

    return {
      description: instance.description,
      memberCount: this.identity.countUsers(),
      name: instance.name,
      publicKey: instance.publicKey,
      state: "configured",
    };
  }

  /**
   * First-run configuration: names the instance and creates its administrator.
   *
   * The two happen in one transaction on purpose. An instance that ended up
   * configured but without an administrator would be unrecoverable without
   * touching the database by hand.
   */
  public async setup(request: InstanceSetupRequest): Promise<InstanceSetupResponse> {
    if (this.repository.find() !== undefined) {
      throw new DomainError(
        "instance_already_configured",
        "This instance has already been configured.",
        409,
      );
    }

    // Checked before anything else, and before the setup code: whoever is here
    // is about to spend twenty minutes and then hand this instance a
    // neighbourhood's photographs (ADR 0019).
    //
    // Refusing costs an installation that has nothing in it yet. Accepting cost
    // this project the same configuration twice, and the second time it was a
    // warning that had been shown, read, and reasonably disbelieved: the guide
    // said the volume was not needed.
    if (this.durability !== undefined && dataAtRisk(this.durability) && !this.allowEphemeralData) {
      throw new DomainError(
        "data_not_durable",
        this.durability === "ephemeral"
          ? "I dati di questa istanza stanno dentro il container e spariranno al primo aggiornamento. Monta una cartella o un volume con un nome sulla directory dei dati, poi riprova: la configurazione la farai una volta sola."
          : "I dati di questa istanza stanno su un volume anonimo, che si perde ogni volta che il container viene ricreato da fuori da `docker compose` — cioè dal pannello del NAS. Monta una cartella o un volume con un nome sulla directory dei dati, poi riprova: la configurazione la farai una volta sola.",
        409,
      );
    }

    if (!secretsMatch(this.setupToken, request.setupToken)) {
      throw new DomainError("invalid_setup_token", "The setup token is not valid.", 403);
    }

    const name = request.name.trim();

    if (name.length === 0) {
      throw new DomainError("invalid_instance_name", "The instance name must not be empty.", 400);
    }

    // Hashing is slow by design, so it happens before the transaction opens.
    const admin = await this.identity.prepareUser({
      ...(request.adminDisplayName === undefined ? {} : { displayName: request.adminDisplayName }),
      password: request.adminPassword,
      role: "instance_admin",
      username: request.adminUsername,
    });

    const record: InstanceRecord = {
      createdAt: this.now().toISOString(),
      description: request.description?.trim() ?? "",
      // Opaque identifier: not derived from the name (ADR 0002).
      id: randomUUID(),
      name,
      publicKey: this.publicKey,
    };

    let recoveryCode = "";

    this.transaction(() => {
      this.identity.persistUser(admin);
      this.repository.create(record);
      // Issued here so that an instance never exists without a way back in.
      recoveryCode = this.identity.issueRecoveryCode(admin.id);
    });

    return { instance: this.getPublicView(), recoveryCode };
  }
}
