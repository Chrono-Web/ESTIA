import { Link } from "react-router-dom";

import { useSignedIn } from "../state.js";

export function Home(): React.ReactElement {
  const { instance, user } = useSignedIn();

  return (
    <main>
      <div className="card">
        <h1>Ciao {user.displayName}</h1>
        <p>
          Sei dentro <strong>{instance.name}</strong>.
        </p>
        <p className="muted">
          {instance.memberCount === 1 ? "1 persona" : `${instance.memberCount} persone`} in questo
          quartiere.
        </p>
      </div>

      {/* No pretend feed: what does not exist yet is not mocked up. */}
      <div className="card">
        <h2>La bacheca non c'è ancora</h2>
        <p>
          Post, foto e commenti arrivano con la prossima tappa del progetto. Per ora l'istanza sa
          fare la cosa che viene prima di tutte: sapere chi siete, e lasciare entrare solo chi è
          stato invitato.
        </p>
        <p className="muted">
          Intanto puoi controllare i <Link to="/dispositivi">tuoi dispositivi</Link>
          {user.role === "instance_admin" && (
            <>
              {" "}
              o <Link to="/amministrazione">invitare qualcuno</Link>
            </>
          )}
          .
        </p>
      </div>
    </main>
  );
}
