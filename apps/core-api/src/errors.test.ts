import { errorResponseSchema } from "@estia/contracts";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { DomainError, errorBody } from "./errors.js";

describe("DomainError (ADR 0046)", () => {
  it("takes its message from the English phrase of its code", () => {
    const error = new DomainError("username_taken", 409);

    expect(error.message).toBe("This username is already in use.");
    expect(errorBody(error)).toEqual({
      code: "username_taken",
      message: "This username is already in use.",
    });
  });

  it("fills the phrase with its params and hands them to the client", () => {
    const error = new DomainError("nome_troppo_lungo", 400, { massimo: 100 });

    expect(error.message).toBe("The display name can be at most 100 characters.");
    expect(errorBody(error).params).toEqual({ massimo: 100 });
  });

  // A route's response schema decides what is serialised: a field it does not
  // declare is dropped without a word, and the client would read a phrase with
  // its placeholder still in it.
  it("keeps its params through the documented error schema", async () => {
    const app = Fastify();
    app.get("/", { schema: { response: { 400: errorResponseSchema } } }, async (_request, reply) =>
      reply.status(400).send(errorBody(new DomainError("bio_troppo_lunga", 400, { massimo: 500 }))),
    );

    const response = await app.inject({ method: "GET", url: "/" });
    await app.close();

    expect(response.json()).toEqual({
      code: "bio_troppo_lunga",
      message: "The description can be at most 500 characters.",
      params: { massimo: 500 },
    });
  });
});
