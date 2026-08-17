import type { ConnectionView } from "@estia/contracts";
import { useEffect, useState } from "react";

import { api } from "../api.js";

/**
 * Says out loud when somebody is not on the local network (M4, ADR 0004).
 *
 * SECURITY_BASELINE §1 lists the remote transport as trust boundary 4, «terzo
 * dichiarato e sostituibile». Declaring it in a document is not declaring it:
 * the people who cross that boundary are the ones who need to know, and they
 * are not reading the documents.
 *
 * Silent on the local network. A notice that appears every day is scenery.
 */
export function Connection(): React.ReactElement | null {
  const [connection, setConnection] = useState<ConnectionView | undefined>();

  useEffect(() => {
    void api
      .connection()
      .then(setConnection)
      .catch(() => undefined);
  }, []);

  if (
    connection === undefined ||
    connection.origin === "local" ||
    connection.origin === "loopback"
  ) {
    return null;
  }

  return (
    <div className={connection.origin === "public" ? "alert error banner" : "alert banner"}>
      {connection.detail}
    </div>
  );
}
