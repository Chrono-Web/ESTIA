import { describe, expect, it } from "vitest";

import { joinUrlForInvite } from "./join-url.js";

function fakeRequest(headers: Record<string, string>, protocol: "http" | "https" = "http") {
  return { headers, protocol } as Parameters<typeof joinUrlForInvite>[0];
}

describe("joinUrlForInvite", () => {
  it("builds the link from the Host the instance saw", () => {
    expect(
      joinUrlForInvite(fakeRequest({ host: "192.168.1.171:3000" }), "9NTP-MFPK-0SN8-J3G6"),
    ).toBe("http://192.168.1.171:3000/entra?codice=9NTP-MFPK-0SN8-J3G6");
  });

  it("prefers the forwarded host when a proxy rewrote the request", () => {
    expect(
      joinUrlForInvite(
        fakeRequest({
          host: "127.0.0.1:3000",
          "x-forwarded-host": "nas.casa.lan:3000",
          "x-forwarded-proto": "https",
        }),
        "ABCD-EFGH-IJKL-MNOP",
      ),
    ).toBe("https://nas.casa.lan:3000/entra?codice=ABCD-EFGH-IJKL-MNOP");
  });
});
