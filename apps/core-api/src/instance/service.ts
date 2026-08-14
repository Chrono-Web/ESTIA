import { randomUUID, timingSafeEqual } from "node:crypto";

import type { InstancePublicView, InstanceSetupRequest } from "@estia/contracts";

import type { InstanceRecord, InstanceRepository } from "./repository.js";

export class DomainError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export interface InstanceServiceOptions {
  repository: InstanceRepository;
  publicKey: string;
  setupToken: string;
  now?: () => Date;
}

export class InstanceService {
  private readonly repository: InstanceRepository;
  private readonly publicKey: string;
  private readonly setupToken: string;
  private readonly now: () => Date;

  public constructor(options: InstanceServiceOptions) {
    this.repository = options.repository;
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
      // No members exist until M1.2 introduces accounts.
      memberCount: 0,
      name: instance.name,
      publicKey: instance.publicKey,
      state: "configured",
    };
  }

  public setup(request: InstanceSetupRequest): InstancePublicView {
    if (this.repository.find() !== undefined) {
      throw new DomainError(
        "instance_already_configured",
        "This instance has already been configured.",
        409,
      );
    }

    if (!this.isSetupTokenValid(request.setupToken)) {
      throw new DomainError("invalid_setup_token", "The setup token is not valid.", 403);
    }

    const name = request.name.trim();

    if (name.length === 0) {
      throw new DomainError("invalid_instance_name", "The instance name must not be empty.", 400);
    }

    const record: InstanceRecord = {
      createdAt: this.now().toISOString(),
      description: request.description?.trim() ?? "",
      // Opaque identifier: not derived from the name (ADR 0002).
      id: randomUUID(),
      name,
      publicKey: this.publicKey,
    };

    this.repository.create(record);

    return this.getPublicView();
  }

  private isSetupTokenValid(candidate: string): boolean {
    const expected = Buffer.from(this.setupToken, "utf8");
    const provided = Buffer.from(candidate, "utf8");

    // timingSafeEqual throws on length mismatch, which would itself leak length.
    if (expected.length !== provided.length) {
      return false;
    }

    return timingSafeEqual(expected, provided);
  }
}
