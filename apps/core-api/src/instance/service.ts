import { randomUUID } from "node:crypto";

import type { InstancePublicView, InstanceSetupRequest } from "@estia/contracts";

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
}

export class InstanceService {
  private readonly repository: InstanceRepository;
  private readonly identity: IdentityService;
  private readonly transaction: Transactor;
  private readonly publicKey: string;
  private readonly setupToken: string;
  private readonly now: () => Date;

  public constructor(options: InstanceServiceOptions) {
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
      return { memberCount: 0, publicKey: this.publicKey, state: "unconfigured" };
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
  public async setup(request: InstanceSetupRequest): Promise<InstancePublicView> {
    if (this.repository.find() !== undefined) {
      throw new DomainError(
        "instance_already_configured",
        "This instance has already been configured.",
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

    this.transaction(() => {
      this.identity.persistUser(admin);
      this.repository.create(record);
    });

    return this.getPublicView();
  }
}
