> Translation of [`ACCESSO_DA_FUORI.md`](ACCESSO_DA_FUORI.md) at commit `14d59ee`. If the two differ, the original is right.

# Access from outside home

ESTIA lives on the local network: it installs and is used with no domain, no certificates and no ports opened on the router ([ADR 0003](adr/0003-primo-contatto-in-rete-locale.md)). This document is about the extra case — reading the neighbourhood board from the train — and it is **additive**: an instance that does none of this works, for everyone, at home.

The way a browser reaches the instance is **a separate, replaceable layer** ([ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md)): the API and the interface are identical in every case. For the pilot that layer is **Tailscale**, that is, a third-party company. Declaring it to the people taking part is part of the decision, not a courtesy: it is half the reason this document exists.

> **How this page came about, and why it matters.** [`INSTALLAZIONE.en.md`](INSTALLAZIONE.en.md) grew out of installations that went wrong, and that is why it is reliable. This page did not: the steps below come from Tailscale's public pages, read on 2026-08-19, plus **a single measurement in the field** (§6). Until someone walks through it and says where they got stuck, read it as a trail to be checked, not as a tested guide. The difference is the same one this project has already paid for twice.

## 1. What changes, and what doesn't

Nothing changes inside the instance. You don't touch the `docker-compose.yml`, you don't open a port on the router, you don't need a domain. The only thing that changes is **where the browser comes from**: before, only from the home network; now, from the private network as well.

And above all: **the transport is not the identity.** Being on the private network doesn't make anyone a member of the instance. Whoever arrives finds the same sign-in screen, and needs the same invite as always. The transport carries the packet up to the door; the one who opens the door is ESTIA.

The instance, for its part, notices and says so to whoever is crossing that boundary: someone arriving from outside sees at the top of the page that the content stays encrypted all the way to the instance, but that whoever runs that network still sees that they connected, when and from where. On the home network it says nothing.

## 2. The transport goes on the machine, not around the instance

Three ways of putting the machine on the private network, in order of preference.

| Way                                       | For whom                                   | How                                                                                                    |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **NAS app**                               | A NAS that has Tailscale in its app centre | Install it from the panel, sign in, done                                                               |
| **Package on the machine**                | Mini-PC, laptop, Linux server              | The official installer (`tailscale.com/install.sh`) or the distribution's package, then `tailscale up` |
| **Container alongside** (not recommended) | Anyone who has neither                     | A second container that shares its network with ESTIA's                                                |

The third way works, and Tailscale documents it, but it **ties the instance's network to the transport**: ESTIA would stop being reachable whenever that container fails to start, including from the home network, which is the product's main path. That is exactly what [ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md) sets out to avoid by keeping the transport off the critical path. With Tailscale on the machine, instead, the two paths live side by side without knowing about each other: from the home network `http://IP-locale:3000` (the machine's local IP address), from outside the machine's name on the private network.

For the path from outside to work, the instance's port must be published on `0.0.0.0` and not on `127.0.0.1` — that is already the rule in step 5 of [`INSTALLAZIONE.en.md`](INSTALLAZIONE.en.md), for the same reason.

**Not to do: advertising the home network** (`--advertise-routes`). Turning the machine into a router towards the LAN hands the remote device the whole home — the printer, the camera, the NAS's panel — when a single door was all that was needed. Least privilege comes free here: don't do it.

**The six-month trap.** A node's key expires, by default, after **180 days**: once they have passed, the instance disappears from the private network until someone signs in again on the machine. From home it keeps working, which makes the failure even more confusing. You can disable key expiry for that machine from the admin console, or note down the date.

## 3. Letting a member in

Two routes, and they are not equivalent.

**Sharing the single machine** is the right one. The member receives an invite and gets access **to that machine only**, not to the rest of the home network and not to the other devices. On top of that, the shared machine stays in quarantine: it can answer whoever looks for it, but it cannot start connections towards the member's devices — which, for a server that serves pages, is exactly the behaviour you want. The member must have a Tailscale account of their own, which is free, and be the owner of their own private network; an unused invite expires after 30 days.

**Adding the member as a user of your own private network** is the wrong route: unless you write rules by hand, it gives them visibility of every device on that network, and the free plan stops at six users. A neighbourhood doesn't fit, and shouldn't fit anyway.

Once that is done, the member opens `http://nome-macchina.nome-rete.ts.net:3000` (the machine's name, then the private network's name) and finds ESTIA. From there on, the usual way in applies: invite, admission, session.

## 4. There are two revocations, and neither replaces the other

| What you revoke            | Where                        | What you get                                                                   |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| **Access to the instance** | ESTIA's administration panel | The person can no longer get in, from any network, not even from home          |
| **The transport**          | Tailscale's admin console    | The person can no longer reach the machine from outside, but the account stays |

Revoking only the transport leaves a valid account standing: from inside the home, that person still gets in. Revoking only the instance leaves the sign-in screen reachable, which is little, but not nothing. **Anyone who leaves the community must be removed from both**, and the right order is the instance first, since that is what holds the content.

The declared budget for revocation is **60 seconds** ([`PRODUCT_VISION.md`](PRODUCT_VISION.md) §4). For the instance, revoking sessions is proven by the tests. For the transport it **has not been measured**: it is one of the open items of M4, and until that measurement exists nobody knows how long it really takes to lose access from outside.

## 5. What the third party sees

Checked on 2026-08-19 against Tailscale's public pages; the sources are in §10. It applies to the pilot's transport, not to a future one.

| Component                               | What it sees                                                                                                 | What it keeps                        | For how long |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------ |
| Coordination server (Tailscale)         | The nodes' **public** keys, the device's name and operating system, public IP address, times                 | Yes                                  | Not stated   |
| Log of traffic between nodes            | Which device connected to which, when, how much                                                              | Yes                                  | Not stated   |
| DERP relays, when the direct path fails | **Encrypted** packets and the addresses of the two ends                                                      | States that it does not log the data | —            |
| ESTIA content                           | Nothing: traffic is encrypted from one device to the other, and the company states that it cannot inspect it | —                                    | —            |
| The member's account                    | Name and email of the identity they signed up with                                                           | Yes                                  | Not stated   |

Three things have to be said in full, because they are what a participant has the right to know before installing anything.

1. **Private keys do not leave the devices**, and the content cannot be read by the third party: on this the documentation is explicit, and the architecture (WireGuard between the two ends) makes it a property, not a promise.
2. **Metadata does.** Who connects to whom, from which address and at what time is precisely what a coordination server has to know to do its job. It is not a flaw in the implementation: it is trust boundary 4 in [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md) §1, and it is why that boundary is declared a "declared and replaceable third party".
3. **How long it keeps it is not written anywhere.** The privacy policy says that data is kept for as long as needed for the purposes it was collected for, without giving a number. People taking part in the pilot must know it as it is: with no declared term.

And one that concerns ESTIA more than Tailscale: **every member opens an account with a third-party company**, which is exactly what this project exists to make unnecessary. For a pilot it is an acceptable, temporary compromise. As a final architecture it would be a contradiction, and that is why choosing the final transport is an open item of M4 and not a ticked box.

## 6. What has actually been measured

Once, on 2026-08-13, during spike M0.2, with the commercial service and not with a control plane of our own. The details are in [ADR 0001](adr/0001-private-network-control-plane.md), evidence 4–6.

- An iPhone on a mobile network reached the home network over a **direct path**, with no relay: 20 packets, 0% loss, 151 ms on average. On that class of line, the content does not pass through third-party infrastructure.
- **Waking up has a cost**: with the phone locked for a minute, the average doubles to 277 ms and the first packet arrives after 1.28 s.
- Baseline latency depends on the mobile operator, not on the topology.

Not measured — and this is the list of the open items of M4: the behaviour **behind CGNAT** on a real line, the **revocation time**, Android, a **real member on a shared machine**, and how much it costs to download photos through the tunnel.

## 7. The cost, stated plainly

- Every member installs a component on every device and opens an account with a third party.
- That third party knows who connects to whom and when, and does not state how long it keeps that.
- If it changes its terms or shuts down, this path goes dark: that is why it is a layer and not an architecture.
- The alternative, public exposure, has a measured and higher cost: seven technical steps, a domain, a certificate and port forwarding ([ADR 0001](adr/0001-private-network-control-plane.md)), plus an instance that anyone can reach.
- The route that costs nothing is still the first one: **at home you need none of this.**

## 8. HTTPS on the private network's name, if you want it

Tailscale can obtain a Let's Encrypt certificate for the machine's `.ts.net` name. It serves one purpose, but not a small one: with `https://` the browser treats the origin as secure, and notifications, the camera, offline use and installability come back, none of which are available with `http://` on a network address ([ADR 0004](adr/0004-client-web-e-trasporto-sostituibile.md)).

The cost is public, literally: every certificate ends up in the **Certificate Transparency** logs, and the machine's name with it. The private network's name is a random string; the machine's name is not — if you named it after the neighbourhood, that name becomes public. Tailscale itself advises against turning the feature on if the machines' names say something.

It is not needed to read the board. It is optional, and can be decided later.

## 9. When something goes wrong

| Symptom                                                              | What is happening                                                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| It opens from home, but not from outside                             | The transport is not active on the machine, or the port is published on `127.0.0.1`                               |
| It worked, stopped after some months, still works from home          | The node key has expired: 180 days, §2                                                                            |
| The `.ts.net` name doesn't resolve                                   | Name resolution for the private network is turned off: use the `100.x.y.z` address                                |
| The member sees the machine but the browser opens nothing            | Port 3000 is not reachable from that network, or an access rule blocks it                                         |
| The instance says "neither the home network nor the private network" | You arrived without the transport: either the instance is exposed on the Internet, or there is a proxy in between |

A limit of that last message, declared rather than hidden: the instance recognises the private network by the `100.64.0.0/10` address space, which is the one mesh VPNs use and also the one operators use for CGNAT. It is an inference from the socket's address alone, not a certainty.

## 10. Sources

Tailscale's public pages, read on 2026-08-19.

- https://tailscale.com/security
- https://tailscale.com/privacy-policy
- https://tailscale.com/kb/1084/sharing
- https://tailscale.com/kb/1085/auth-keys
- https://tailscale.com/kb/1011/log-mesh-traffic
- https://tailscale.com/kb/1153/enabling-https
- https://tailscale.com/kb/1282/docker
