import type {
  AuthenticatedUser,
  ConversazioneView,
  FeedKind,
  FollowerView,
  FollowingView,
  InstancePublicView,
  MissingSource,
  PersonView,
  PostView,
} from "@estia/contracts";
import { Host, Picker, Text as SwiftUIText } from "@expo/ui/swift-ui";
import { pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { GlassView } from "expo-glass-effect";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, useColorScheme, View } from "react-native";

import { createApi, type EstiaApi } from "./api";
import { initializeDeviceIdentity } from "./crypto";
import { isSessioneMorta, spiega } from "./errori";
import {
  cancellaSessione,
  cancellaUrlIstanza,
  dispositivoId,
  leggiSessione,
  leggiUrlIstanza,
  scriviSessione,
  scriviUrlIstanza,
} from "./memoria";
import { dettaglioPorta, etichettaPorta, valutaPorta, type StatoPorta } from "./porta";
import { SchermataAccesso } from "./SchermataAccesso";
import { SchermataBacheca } from "./SchermataBacheca";
import { SchermataConversazione } from "./SchermataConversazione";
import { nomeIstanza, SchermataIstanza } from "./SchermataIstanza";
import { SchermataMessaggi } from "./SchermataMessaggi";
import { SchermataProfilo } from "./SchermataProfilo";
import { creaPalette, type Palette } from "./tema";
import { Avviso, Live, Pulsante } from "./ui";
import { normalizzaUrlIstanza } from "./url-istanza";

type Tab = "bacheca" | "messaggi" | "io";

interface ProfiloAperto {
  username: string;
  instanceKey: string | undefined;
}

export function App(): React.ReactElement {
  const scuro = useColorScheme() === "dark";

  const [pronto, setPronto] = useState(false);
  const [urlGrezzo, setUrlGrezzo] = useState("");
  const [url, setUrl] = useState<string | undefined>();
  const [instance, setInstance] = useState<InstancePublicView | undefined>();
  const [token, setToken] = useState<string | undefined>();
  const [user, setUser] = useState<AuthenticatedUser | undefined>();
  const [inCorso, setInCorso] = useState(false);
  const [raggiungibile, setRaggiungibile] = useState(false);
  const [erroreRete, setErroreRete] = useState(false);
  const [sessioneRevocata, setSessioneRevocata] = useState(false);
  const [feedIncompleto, setFeedIncompleto] = useState(false);
  const [errore, setErrore] = useState<string | undefined>();
  const [live, setLive] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<Tab>("bacheca");
  const [feed, setFeed] = useState<FeedKind>("locale");
  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [mancanti, setMancanti] = useState<MissingSource[]>([]);
  const [bachecaPronta, setBachecaPronta] = useState(false);
  const [ricarica, setRicarica] = useState(false);
  const [ancoraOccupato, setAncoraOccupato] = useState(false);
  const [cuoreOccupatoId, setCuoreOccupatoId] = useState<string | undefined>();
  const [profiloAperto, setProfiloAperto] = useState<ProfiloAperto | undefined>();
  const [persona, setPersona] = useState<PersonView | undefined>();
  const [postProfilo, setPostProfilo] = useState<PostView[]>([]);
  const [profiloPronto, setProfiloPronto] = useState(false);
  const [pending, setPending] = useState<FollowerView[]>([]);
  const [seguito, setSeguito] = useState<FollowingView | undefined>();
  const [lavoroProfilo, setLavoroProfilo] = useState<string | undefined>();
  const [esciOccupato, setEsciOccupato] = useState(false);

  // Messaggi e Conversazioni E2E
  const [conversazioni, setConversazioni] = useState<ConversazioneView[]>([]);
  const [conversazioniPronte, setConversazioniPronte] = useState(false);
  const [ricaricaConversazioni, setRicaricaConversazioni] = useState(false);
  const [conversazioneAperta, setConversazioneAperta] = useState<ConversazioneView | null>(null);
  const [creazioneConvInCorso, setCreazioneConvInCorso] = useState(false);

  const colori: Palette = useMemo(() => creaPalette(scuro, feed), [scuro, feed]);

  const api = useMemo(
    (): EstiaApi | undefined => (url === undefined ? undefined : createApi(url)),
    [url],
  );

  const porta = valutaPorta({
    erroreRete,
    feedIncompleto,
    inCorso,
    raggiungibile,
    sessioneRevocata,
    url,
  });

  const onSessioneMorta = useCallback(async (): Promise<void> => {
    setToken(undefined);
    setUser(undefined);
    setSessioneRevocata(true);
    await cancellaSessione();
    setLive("La sessione non vale più. Entra di nuovo.");
  }, []);

  const avviaIstanza = useCallback(
    async (base: string, sessione?: { token: string; user: AuthenticatedUser }): Promise<void> => {
      setInCorso(true);
      setErrore(undefined);
      setErroreRete(false);
      setSessioneRevocata(false);
      setLive("Collego all'istanza…");
      const client = createApi(base);
      try {
        const vista = await client.instance();
        setUrl(base);
        setInstance(vista);
        setRaggiungibile(true);
        await scriviUrlIstanza(base);
        if (sessione !== undefined) {
          try {
            const me = await client.me(sessione.token);
            setToken(sessione.token);
            setUser(me);
            await scriviSessione({ token: sessione.token, url: base, user: me });
            void initializeDeviceIdentity(client, sessione.token).catch(() => {});
            setLive(`Entrato come ${me.displayName}.`);
          } catch (causa) {
            await cancellaSessione();
            setToken(undefined);
            setUser(undefined);
            if (isSessioneMorta(causa)) {
              setSessioneRevocata(true);
              setLive("La sessione non vale più. Entra di nuovo.");
            } else {
              setErrore(spiega(causa, "Non riesco a verificare la sessione."));
              setLive("Non sono riuscito a riprendere la sessione.");
            }
          }
        } else {
          setLive(`Collegato a ${nomeIstanza(vista)}.`);
        }
      } catch (causa) {
        setRaggiungibile(false);
        setErroreRete(true);
        setErrore(spiega(causa, "Non raggiungo l'istanza. Controlla l'indirizzo e il Wi-Fi."));
        setLive("Collegamento non riuscito.");
      } finally {
        setInCorso(false);
      }
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      const salvata = await leggiSessione();
      if (salvata !== undefined) {
        setUrlGrezzo(salvata.url);
        await avviaIstanza(salvata.url, { token: salvata.token, user: salvata.user });
        setPronto(true);
        return;
      }
      const soloUrl = await leggiUrlIstanza();
      if (soloUrl !== undefined) {
        setUrlGrezzo(soloUrl);
        await avviaIstanza(soloUrl);
      }
      setPronto(true);
    })();
  }, [avviaIstanza]);

  const caricaBacheca = useCallback(
    async (lente: FeedKind, accoda = false): Promise<void> => {
      if (api === undefined || token === undefined) {
        return;
      }
      if (!accoda) {
        setBachecaPronta(false);
        setPosts([]);
        setCursor(undefined);
        setMancanti([]);
        setErrore(undefined);
      }
      setLive(accoda ? "Carico altri messaggi…" : "Carico la bacheca…");
      try {
        const pagina = await api.timeline(token, {
          feed: lente,
          ...(accoda && cursor !== undefined ? { cursor } : {}),
        });
        setPosts((prima) => (accoda ? [...prima, ...pagina.posts] : pagina.posts));
        setCursor(pagina.nextCursor);
        const lista = pagina.mancanti ?? [];
        setMancanti(lista);
        setFeedIncompleto(lista.length > 0);
        setBachecaPronta(true);
        setLive(
          lista.length > 0
            ? "Bacheca caricata, incompleta: qualche casa non ha risposto."
            : "Bacheca aggiornata.",
        );
      } catch (causa) {
        if (isSessioneMorta(causa)) {
          await onSessioneMorta();
          return;
        }
        setErrore(spiega(causa, "Non riesco a leggere la bacheca."));
        setBachecaPronta(true);
        setLive("Non sono riuscito a leggere la bacheca.");
      }
    },
    [api, cursor, onSessioneMorta, token],
  );

  const cambiaFeed = useCallback((nuovaLente: FeedKind) => {
    setFeed(nuovaLente);
    setPosts([]);
    setCursor(undefined);
    setMancanti([]);
    setBachecaPronta(false);
  }, []);

  useEffect(() => {
    if (token === undefined) {
      return;
    }
    void caricaBacheca(feed);
  }, [feed, token]);

  const caricaConversazioni = useCallback(async (): Promise<void> => {
    if (api === undefined || token === undefined) return;
    try {
      const res = await api.conversazioni(token);
      setConversazioni(res.conversazioni);
      setConversazioniPronte(true);
    } catch (causa) {
      if (isSessioneMorta(causa)) {
        await onSessioneMorta();
        return;
      }
      setConversazioniPronte(true);
    }
  }, [api, onSessioneMorta, token]);

  useEffect(() => {
    if (token !== undefined && tab === "messaggi") {
      void caricaConversazioni();
    }
  }, [caricaConversazioni, tab, token]);

  const caricaProfilo = useCallback(
    async (chi: ProfiloAperto | undefined, me: AuthenticatedUser): Promise<void> => {
      if (api === undefined || token === undefined) {
        return;
      }
      const usernameProfilo = chi?.username ?? me.username;
      const remoto = chi?.instanceKey;
      setProfiloPronto(false);
      setErrore(undefined);
      setLive("Apro il profilo…");
      try {
        const personaLetta =
          remoto === undefined
            ? await api.person(token, usernameProfilo)
            : await api.remotePerson(token, remoto, usernameProfilo);
        const pagina =
          remoto === undefined
            ? await api.personPosts(token, usernameProfilo, { feed })
            : await api.remotePersonPosts(token, remoto, usernameProfilo);
        setPersona(personaLetta);
        setPostProfilo(pagina.posts);
        const relazioni = await api.follows(token);
        if (chi === undefined || usernameProfilo === me.username) {
          setPending(relazioni.followers.filter((riga) => riga.state === "in_attesa"));
          setSeguito(undefined);
        } else {
          setPending([]);
          setSeguito(
            relazioni.following.find(
              (riga) =>
                riga.username === usernameProfilo && riga.instanceKey === (remoto ?? "locale"),
            ),
          );
        }
        setProfiloPronto(true);
        setLive(`Profilo di ${personaLetta.displayName}.`);
      } catch (causa) {
        if (isSessioneMorta(causa)) {
          await onSessioneMorta();
          return;
        }
        setErrore(spiega(causa, "Questo profilo non esiste, o non riesco a leggerlo."));
        setProfiloPronto(true);
        setLive("Profilo non letto.");
      }
    },
    [api, feed, onSessioneMorta, token],
  );

  useEffect(() => {
    if (token === undefined || user === undefined) {
      return;
    }
    if (tab === "io" || profiloAperto !== undefined) {
      void caricaProfilo(profiloAperto, user);
    }
  }, [caricaProfilo, profiloAperto, tab, token, user]);

  const collega = (): void => {
    const esito = normalizzaUrlIstanza(urlGrezzo);
    if (!esito.ok) {
      setErrore(esito.motivo);
      setLive(esito.motivo);
      return;
    }
    void avviaIstanza(esito.url);
  };

  const entra = async (): Promise<void> => {
    if (api === undefined) {
      return;
    }
    setInCorso(true);
    setErrore(undefined);
    setLive("Entro…");
    try {
      const deviceId = await dispositivoId();
      const sessione = await api.login({
        deviceId,
        deviceLabel: "Telefono",
        password,
        username: username.trim(),
      });
      setToken(sessione.token);
      setUser(sessione.user);
      setSessioneRevocata(false);
      setPassword("");
      await scriviSessione({ token: sessione.token, url: url ?? "", user: sessione.user });
      void initializeDeviceIdentity(api, sessione.token).catch(() => {});
      setLive(`Entrato come ${sessione.user.displayName}.`);
    } catch (causa) {
      const messaggio = isSessioneMorta(causa)
        ? "Nome utente o password non validi."
        : spiega(causa, "Non riesco a contattare l'istanza.");
      setErrore(messaggio);
      setLive(messaggio);
    } finally {
      setInCorso(false);
    }
  };

  const applicaCuore = (
    lista: PostView[],
    id: string,
    likeCount: number,
    liked: boolean,
  ): PostView[] => lista.map((post) => (post.id === id ? { ...post, likeCount, liked } : post));

  const cuore = async (post: PostView): Promise<void> => {
    if (api === undefined || token === undefined) {
      return;
    }
    setCuoreOccupatoId(post.id);
    const liked = !post.liked;
    setLive(liked ? "Metto mi piace…" : "Tolgo mi piace…");
    try {
      const risposta =
        post.remoto === undefined
          ? await api.setLike(token, post.id, liked)
          : await api.setRemoteLike(
              token,
              { instanceKey: post.remoto.instanceKey, username: post.author.username },
              post.id,
              liked,
            );
      setPosts((lista) => applicaCuore(lista, post.id, risposta.likeCount, risposta.liked));
      setPostProfilo((lista) => applicaCuore(lista, post.id, risposta.likeCount, risposta.liked));
      setLive(risposta.liked ? "Mi piace messo." : "Mi piace tolto.");
    } catch (causa) {
      if (isSessioneMorta(causa)) {
        await onSessioneMorta();
        return;
      }
      setErrore(spiega(causa, "Non sono riuscito ad aggiornare il mi piace."));
      setLive("Mi piace non aggiornato.");
    } finally {
      setCuoreOccupatoId(undefined);
    }
  };

  const agisciProfilo = async (id: string, azione: () => Promise<void>): Promise<void> => {
    if (user === undefined) {
      return;
    }
    setLavoroProfilo(id);
    setErrore(undefined);
    try {
      await azione();
      await caricaProfilo(profiloAperto, user);
    } catch (causa) {
      if (isSessioneMorta(causa)) {
        await onSessioneMorta();
        return;
      }
      setErrore(spiega(causa, "Non ha funzionato. Riprova."));
    } finally {
      setLavoroProfilo(undefined);
    }
  };

  const avviaNuovaConversazione = async (destinatarioUsername: string): Promise<void> => {
    if (api === undefined || token === undefined) return;
    setCreazioneConvInCorso(true);
    try {
      const res = await api.createConversazione(token, { recipientUsername: destinatarioUsername });
      setConversazioni((prev) => [
        res.conversazione,
        ...prev.filter((c) => c.id !== res.conversazione.id),
      ]);
      setConversazioneAperta(res.conversazione);
    } finally {
      setCreazioneConvInCorso(false);
    }
  };

  const esci = async (): Promise<void> => {
    setEsciOccupato(true);
    setLive("Esco…");
    try {
      if (api !== undefined && token !== undefined) {
        try {
          await api.logout(token);
        } catch {
          // Si esce comunque
        }
      }
      await cancellaSessione();
      setToken(undefined);
      setUser(undefined);
      setPosts([]);
      setConversazioni([]);
      setConversazioneAperta(null);
      setPersona(undefined);
      setLive("Sei uscito.");
    } finally {
      setEsciOccupato(false);
    }
  };

  const cambiaIstanza = async (): Promise<void> => {
    await cancellaSessione();
    await cancellaUrlIstanza();
    setToken(undefined);
    setUser(undefined);
    setUrl(undefined);
    setInstance(undefined);
    setRaggiungibile(false);
    setErrore(undefined);
    setSessioneRevocata(false);
    setLive("Scegli l'istanza.");
  };

  const apriProfilo = (name: string, key: string | undefined): void => {
    setProfiloAperto({ instanceKey: key, username: name });
    setTab("io");
  };

  if (!pronto) {
    return (
      <View
        style={{
          backgroundColor: colori.fondo,
          flex: 1,
          justifyContent: "center",
          padding: 28,
        }}
      >
        <StatusBar style={scuro ? "light" : "dark"} />
        <Live>Apro ESTIA…</Live>
        <Text style={{ color: colori.testo, fontSize: 17 }}>Apro ESTIA…</Text>
      </View>
    );
  }

  if (url === undefined || instance === undefined) {
    return (
      <>
        <StatusBar style={scuro ? "light" : "dark"} />
        <SchermataIstanza
          colori={colori}
          errore={errore}
          occupato={inCorso}
          onChange={setUrlGrezzo}
          onCollega={collega}
          statoLive={live}
          valore={urlGrezzo}
        />
      </>
    );
  }

  if (token === undefined || user === undefined || api === undefined) {
    return (
      <>
        <StatusBar style={scuro ? "light" : "dark"} />
        <SchermataAccesso
          colori={colori}
          errore={errore}
          instance={instance}
          occupato={inCorso}
          onCambiaIstanza={() => void cambiaIstanza()}
          onEntra={() => void entra()}
          onPassword={setPassword}
          onUsername={setUsername}
          password={password}
          statoLive={live}
          username={username}
        />
      </>
    );
  }

  // Se c'è una conversazione aperta a schermo intero
  if (conversazioneAperta) {
    return (
      <View style={[styles.guscioApp, { backgroundColor: colori.fondo }]}>
        <StatusBar style={scuro ? "light" : "dark"} />
        <SchermataConversazione
          api={api}
          colori={colori}
          conversazione={conversazioneAperta}
          onIndietro={() => {
            setConversazioneAperta(null);
            void caricaConversazioni();
          }}
          token={token}
          user={user}
        />
      </View>
    );
  }

  return (
    <View style={[styles.guscioApp, { backgroundColor: colori.fondo }]}>
      <StatusBar style={scuro ? "light" : "dark"} />

      {/* Intestazione Nativa Apple Liquid Glass */}
      <GlassView
        colorScheme={scuro ? "dark" : "light"}
        glassEffectStyle="regular"
        style={styles.topBarIstanza}
      >
        <View style={styles.topBarTitoli}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.topBarNomeIstanza, { color: colori.testo }]}
          >
            {nomeIstanza(instance)}
          </Text>
          <Text style={[styles.topBarStato, { color: colori.testoMorbido }]}>
            {etichettaPorta(porta)}
          </Text>
        </View>
      </GlassView>

      <BannerPorta colori={colori} onRiprova={() => void caricaBacheca(feed)} porta={porta} />

      {/* Corpo Principale in base al Tab attivo */}
      <View style={styles.corpoTab}>
        {tab === "bacheca" && profiloAperto === undefined ? (
          <SchermataBacheca
            ancoraOccupato={ancoraOccupato}
            caricato={bachecaPronta}
            colori={colori}
            cuoreOccupatoId={cuoreOccupatoId}
            cursor={cursor}
            errore={errore}
            feed={feed}
            mancanti={mancanti}
            onAncora={() => {
              setAncoraOccupato(true);
              void caricaBacheca(feed, true).finally(() => setAncoraOccupato(false));
            }}
            onAutore={apriProfilo}
            onCuore={(post) => void cuore(post)}
            onFeed={cambiaFeed}
            onRicarica={() => {
              setRicarica(true);
              void caricaBacheca(feed).finally(() => setRicarica(false));
            }}
            posts={posts}
            ricarica={ricarica}
            statoLive={live}
            token={token}
            urlIstanza={url}
          />
        ) : tab === "messaggi" && profiloAperto === undefined ? (
          <SchermataMessaggi
            caricato={conversazioniPronte}
            colori={colori}
            conversazioni={conversazioni}
            creazioneInCorso={creazioneConvInCorso}
            errore={errore}
            onApriConversazione={setConversazioneAperta}
            onNuovaConversazione={avviaNuovaConversazione}
            onRicarica={() => {
              setRicaricaConversazioni(true);
              void caricaConversazioni().finally(() => setRicaricaConversazioni(false));
            }}
            ricarica={ricaricaConversazioni}
            token={token}
            user={user}
          />
        ) : (
          <View style={{ flex: 1 }}>
            {profiloAperto !== undefined ? (
              <View style={styles.bloccoTornaIndietro}>
                <Pulsante
                  colori={colori}
                  onPress={() => setProfiloAperto(undefined)}
                  secondario
                  titolo="← Torna alla bacheca"
                />
              </View>
            ) : null}
            <SchermataProfilo
              caricato={profiloPronto}
              colori={colori}
              cuoreOccupatoId={cuoreOccupatoId}
              errore={errore}
              esciOccupato={esciOccupato}
              lavoro={lavoroProfilo}
              onAccetta={(riga) =>
                void agisciProfilo(`accetta:${riga.id}`, async () => {
                  await api.acceptFollower(token, riga.id);
                })
              }
              onAutore={apriProfilo}
              onCambiaIstanza={() => void cambiaIstanza()}
              onCuore={(post) => void cuore(post)}
              onEsci={() => void esci()}
              onRifiuta={(riga) =>
                void agisciProfilo(`rifiuta:${riga.id}`, async () => {
                  await api.removeFollower(token, riga.id);
                })
              }
              onSegui={() =>
                void agisciProfilo("segui", async () => {
                  await api.follow(token, {
                    instanceKey: profiloAperto?.instanceKey ?? "locale",
                    username: profiloAperto?.username ?? user.username,
                  });
                })
              }
              onSmetti={(riga) =>
                void agisciProfilo("smetti", async () => {
                  await api.unfollow(token, riga.id);
                })
              }
              pending={pending}
              persona={persona}
              posts={postProfilo}
              proprio={profiloAperto === undefined}
              seguito={seguito}
              statoLive={live}
            />
          </View>
        )}
      </View>

      <View style={styles.dockWrapper}>
        <Host matchContents style={styles.dockGuscio}>
          <Picker
            modifiers={[pickerStyle("segmented")]}
            onSelectionChange={(s) => {
              setProfiloAperto(undefined);
              setTab(s as Tab);
            }}
            selection={tab}
          >
            <SwiftUIText modifiers={[tag("bacheca")]}>Bacheca</SwiftUIText>
            <SwiftUIText modifiers={[tag("messaggi")]}>Messaggi</SwiftUIText>
            <SwiftUIText modifiers={[tag("io")]}>Profilo</SwiftUIText>
          </Picker>
        </Host>
      </View>
    </View>
  );
}

function BannerPorta({
  colori,
  porta,
  onRiprova,
}: {
  colori: Palette;
  porta: StatoPorta;
  onRiprova: () => void;
}): React.ReactElement | null {
  if (porta === "connected" || porta === "unconfigured" || porta === "connecting") {
    return null;
  }

  return (
    <View style={styles.bloccoPorta}>
      <Avviso colori={colori} tono={porta === "degraded" ? "info" : "errore"}>
        {dettaglioPorta(porta)}
      </Avviso>
      {porta === "error" || porta === "degraded" ? (
        <Pulsante colori={colori} onPress={onRiprova} secondario titolo="Riprova" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bloccoPorta: {
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  bloccoTornaIndietro: {
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  corpoTab: {
    flex: 1,
  },
  dockGuscio: {
    paddingBottom: 28, // Safe area home indicator
    paddingHorizontal: 20,
    width: "100%",
  },
  dockWrapper: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    width: "100%",
  },
  guscioApp: {
    flex: 1,
  },
  topBarIstanza: {
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 54, // Dynamic Island / Notch safe area
  },
  topBarNomeIstanza: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  topBarStato: {
    fontSize: 13,
  },
  topBarTitoli: {
    gap: 2,
  },
});
